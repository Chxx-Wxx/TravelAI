const ROUTES_API_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
].join(",");

const SUPPORTED_TRAVEL_MODES = new Set([
  "WALK",
]);

const ROUTE_CACHE_TTL_MS =
  24 * 60 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 500;
const NEARBY_COORDINATE_METERS = 5;
const EARTH_RADIUS_METERS = 6_371_000;

const routeCache = new Map();
const routeRequestsInFlight = new Map();

class RouteServiceError extends Error {
  constructor(
    message,
    statusCode = 500,
    upstreamStatus = null
  ) {
    super(message);
    this.name = "RouteServiceError";
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
  }
}

function normalizeCoordinate(value, label) {
  const latitude = value?.latitude;
  const longitude = value?.longitude;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new RouteServiceError(
      `${label} 좌표가 올바르지 않습니다.`,
      400
    );
  }

  return {
    latitude,
    longitude,
  };
}

function normalizeRouteRequest(body) {
  const tripId = String(body?.tripId ?? "").trim();
  const date = String(body?.date ?? "").trim();
  const travelMode = String(
    body?.travelMode ?? "WALK"
  )
    .trim()
    .toUpperCase();

  if (!tripId || tripId.length > 128) {
    throw new RouteServiceError(
      "여행 ID가 필요합니다.",
      400
    );
  }

  const dateMatch =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const parsedDate = dateMatch
    ? new Date(
        Date.UTC(
          Number(dateMatch[1]),
          Number(dateMatch[2]) - 1,
          Number(dateMatch[3])
        )
      )
    : null;

  if (
    !dateMatch ||
    !parsedDate ||
    parsedDate.getUTCFullYear() !==
      Number(dateMatch[1]) ||
    parsedDate.getUTCMonth() !==
      Number(dateMatch[2]) - 1 ||
    parsedDate.getUTCDate() !==
      Number(dateMatch[3])
  ) {
    throw new RouteServiceError(
      "올바른 일정 날짜가 필요합니다.",
      400
    );
  }

  if (!SUPPORTED_TRAVEL_MODES.has(travelMode)) {
    throw new RouteServiceError(
      "지원하지 않는 이동수단입니다.",
      400
    );
  }

  return {
    tripId,
    date,
    origin: normalizeCoordinate(
      body?.origin,
      "출발지"
    ),
    destination: normalizeCoordinate(
      body?.destination,
      "도착지"
    ),
    travelMode,
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calculateStraightLineDistance(
  origin,
  destination
) {
  const latitudeDelta = toRadians(
    destination.latitude - origin.latitude
  );
  const longitudeDelta = toRadians(
    destination.longitude - origin.longitude
  );
  const originLatitude = toRadians(
    origin.latitude
  );
  const destinationLatitude = toRadians(
    destination.latitude
  );

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(haversine))
  );
}

function decodeEncodedPolyline(encodedPolyline) {
  if (
    typeof encodedPolyline !== "string" ||
    !encodedPolyline
  ) {
    throw new RouteServiceError(
      "경로 좌표 응답이 올바르지 않습니다.",
      502
    );
  }

  const coordinates = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  function decodeValue() {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      if (index >= encodedPolyline.length) {
        throw new RouteServiceError(
          "경로 좌표 응답이 올바르지 않습니다.",
          502
        );
      }

      byte =
        encodedPolyline.charCodeAt(index) - 63;
      index += 1;

      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    return result & 1
      ? ~(result >> 1)
      : result >> 1;
  }

  while (index < encodedPolyline.length) {
    latitude += decodeValue();
    longitude += decodeValue();

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
}

function createRouteCacheKey(routeRequest) {
  const { origin, destination } = routeRequest;

  return [
    routeRequest.tripId,
    routeRequest.date,
    origin.latitude.toFixed(5),
    origin.longitude.toFixed(5),
    destination.latitude.toFixed(5),
    destination.longitude.toFixed(5),
    routeRequest.travelMode,
  ].join("|");
}

function getCachedRoute(cacheKey) {
  const cached = routeCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    routeCache.delete(cacheKey);
    return null;
  }

  return cached.route;
}

function storeCachedRoute(cacheKey, route) {
  if (
    routeCache.size >= ROUTE_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = routeCache.keys().next().value;

    if (oldestKey) {
      routeCache.delete(oldestKey);
    }
  }

  routeCache.set(cacheKey, {
    expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    route,
  });
}

function parseDurationSeconds(duration) {
  const seconds = Number(
    String(duration ?? "").replace(/s$/, "")
  );

  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RouteServiceError(
      "경로 시간 응답이 올바르지 않습니다.",
      502
    );
  }

  return Math.round(seconds);
}

async function requestGoogleRoute(
  routeRequest,
  apiKey
) {
  let response;

  try {
    response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: routeRequest.origin,
          },
        },
        destination: {
          location: {
            latLng: routeRequest.destination,
          },
        },
        travelMode: routeRequest.travelMode,
        computeAlternativeRoutes: false,
        polylineQuality: "OVERVIEW",
        polylineEncoding: "ENCODED_POLYLINE",
        languageCode: "ko",
        units: "METRIC",
      }),
    });
  } catch {
    throw new RouteServiceError(
      "Google Routes에 연결할 수 없습니다.",
      502
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Upstream HTML/text is deliberately not forwarded to the app.
  }

  if (!response.ok) {
    throw new RouteServiceError(
      "Google Routes 경로 계산에 실패했습니다.",
      502,
      response.status
    );
  }

  const route = data?.routes?.[0];
  const distanceMeters = route?.distanceMeters;
  const encodedPolyline =
    route?.polyline?.encodedPolyline;

  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    typeof encodedPolyline !== "string" ||
    !encodedPolyline
  ) {
    throw new RouteServiceError(
      "Google Routes 경로 응답이 올바르지 않습니다.",
      502
    );
  }

  const coordinates =
    decodeEncodedPolyline(encodedPolyline);

  if (coordinates.length === 0) {
    throw new RouteServiceError(
      "Google Routes 경로 좌표가 없습니다.",
      502
    );
  }

  return {
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: parseDurationSeconds(
      route.duration
    ),
    coordinates,
    travelMode: routeRequest.travelMode,
  };
}

async function computeCachedRoute(
  routeRequest,
  apiKey
) {
  const cacheKey =
    createRouteCacheKey(routeRequest);
  const cachedRoute = getCachedRoute(cacheKey);

  if (cachedRoute) {
    return cachedRoute;
  }

  const inFlight =
    routeRequestsInFlight.get(cacheKey);

  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const straightLineDistance =
      calculateStraightLineDistance(
        routeRequest.origin,
        routeRequest.destination
      );

    if (
      straightLineDistance <=
      NEARBY_COORDINATE_METERS
    ) {
      const route = {
        distanceMeters: Math.round(
          straightLineDistance
        ),
        durationSeconds: 0,
        coordinates:
          straightLineDistance === 0
            ? [routeRequest.origin]
            : [
                routeRequest.origin,
                routeRequest.destination,
              ],
        travelMode: routeRequest.travelMode,
      };

      storeCachedRoute(cacheKey, route);
      return route;
    }

    const route = await requestGoogleRoute(
      routeRequest,
      apiKey
    );

    storeCachedRoute(cacheKey, route);
    return route;
  })();

  routeRequestsInFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    routeRequestsInFlight.delete(cacheKey);
  }
}

module.exports = {
  ROUTES_FIELD_MASK,
  ROUTE_CACHE_TTL_MS,
  RouteServiceError,
  calculateStraightLineDistance,
  computeCachedRoute,
  createRouteCacheKey,
  decodeEncodedPolyline,
  normalizeRouteRequest,
};
