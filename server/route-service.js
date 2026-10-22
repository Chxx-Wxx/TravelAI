const ROUTES_API_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const {
  TransitProviderError,
  requestTransitRoute,
  selectRouteProvider,
} = require("./transit-service");

const BASE_ROUTES_FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
];

const TRANSIT_ROUTES_FIELD_MASK = [
  ...BASE_ROUTES_FIELD_MASK,
  "routes.legs.steps.travelMode",
  "routes.legs.steps.distanceMeters",
  "routes.legs.steps.transitDetails.transitLine.vehicle.type",
].join(",");

const WALK_ROUTES_FIELD_MASK =
  BASE_ROUTES_FIELD_MASK.join(",");

const SUPPORTED_TRAVEL_MODES = new Set([
  "WALK",
  "TRANSIT",
]);

const ROUTE_CACHE_TTL_MS =
  24 * 60 * 60 * 1000;
const TRANSIT_ROUTE_CACHE_TTL_MS =
  15 * 60 * 1000;
const ROUTE_CACHE_MAX_ENTRIES = 500;
const NEARBY_COORDINATE_METERS = 5;
const EARTH_RADIUS_METERS = 6_371_000;
const TRANSIT_PAST_WINDOW_MS =
  7 * 24 * 60 * 60 * 1000;
const TRANSIT_FUTURE_WINDOW_MS =
  100 * 24 * 60 * 60 * 1000;
const IS_DEVELOPMENT =
  process.env.NODE_ENV !== "production";

const routeCache = new Map();
const routeRequestsInFlight = new Map();

class RouteServiceError extends Error {
  constructor(
    message,
    statusCode = 500,
    upstreamStatus = null,
    code = null
  ) {
    super(message);
    this.name = "RouteServiceError";
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
    this.code = code;
  }
}

function normalizeDepartureTime(
  value,
  now = Date.now()
) {
  const rfc3339Pattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

  if (
    typeof value !== "string" ||
    !rfc3339Pattern.test(value.trim())
  ) {
    throw new RouteServiceError(
      "대중교통 출발시간이 올바르지 않습니다.",
      400,
      null,
      "TRANSIT_DEPARTURE_TIME_INVALID"
    );
  }

  const departureTimeMs = Date.parse(value);

  if (!Number.isFinite(departureTimeMs)) {
    throw new RouteServiceError(
      "대중교통 출발시간이 올바르지 않습니다.",
      400,
      null,
      "TRANSIT_DEPARTURE_TIME_INVALID"
    );
  }

  if (
    departureTimeMs <
    now - TRANSIT_PAST_WINDOW_MS
  ) {
    throw new RouteServiceError(
      "이 날짜의 대중교통 경로는 조회 기간이 지났습니다.",
      422,
      null,
      "TRANSIT_TIME_TOO_OLD"
    );
  }

  if (
    departureTimeMs >
    now + TRANSIT_FUTURE_WINDOW_MS
  ) {
    throw new RouteServiceError(
      "대중교통 경로는 여행일이 가까워지면 확인할 수 있습니다.",
      422,
      null,
      "TRANSIT_TIME_TOO_FAR"
    );
  }

  return new Date(
    Math.floor(departureTimeMs / 60_000) *
      60_000
  ).toISOString();
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
  const country = String(body?.country ?? "")
    .normalize("NFKC")
    .trim();
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

  const departureTime =
    travelMode === "TRANSIT"
      ? normalizeDepartureTime(
          body?.departureTime
        )
      : undefined;

  return {
    tripId,
    date,
    country,
    origin: normalizeCoordinate(
      body?.origin,
      "출발지"
    ),
    destination: normalizeCoordinate(
      body?.destination,
      "도착지"
    ),
    travelMode,
    departureTime,
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

function createRouteCacheKey(
  routeRequest,
  provider = selectRouteProvider(routeRequest)
) {
  const { origin, destination } = routeRequest;

  return [
    routeRequest.tripId,
    routeRequest.date,
    origin.latitude.toFixed(5),
    origin.longitude.toFixed(5),
    destination.latitude.toFixed(5),
    destination.longitude.toFixed(5),
    routeRequest.travelMode,
    provider,
    routeRequest.departureTime ?? "static",
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

function storeCachedRoute(
  cacheKey,
  route,
  ttlMs = ROUTE_CACHE_TTL_MS
) {
  if (
    routeCache.size >= ROUTE_CACHE_MAX_ENTRIES
  ) {
    const oldestKey = routeCache.keys().next().value;

    if (oldestKey) {
      routeCache.delete(oldestKey);
    }
  }

  routeCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    route,
  });
}

function getRouteCacheTtl(travelMode) {
  return travelMode === "TRANSIT"
    ? TRANSIT_ROUTE_CACHE_TTL_MS
    : ROUTE_CACHE_TTL_MS;
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

function normalizeTransitVehicleType(value) {
  switch (value) {
    case "BUS":
    case "INTERCITY_BUS":
    case "SHARE_TAXI":
    case "TROLLEYBUS":
      return "BUS";
    case "SUBWAY":
      return "SUBWAY";
    case "COMMUTER_TRAIN":
    case "HEAVY_RAIL":
    case "HIGH_SPEED_TRAIN":
    case "LONG_DISTANCE_TRAIN":
    case "METRO_RAIL":
    case "MONORAIL":
    case "RAIL":
      return "TRAIN";
    case "TRAM":
      return "TRAM";
    case "FERRY":
      return "FERRY";
    default:
      return "OTHER";
  }
}

function createTransitSummary(route) {
  const steps = Array.isArray(route?.legs)
    ? route.legs.flatMap((leg) =>
        Array.isArray(leg?.steps)
          ? leg.steps
          : []
      )
    : [];
  const transitSteps = steps.filter(
    (step) =>
      step?.travelMode === "TRANSIT" &&
      step?.transitDetails
  );
  const walkDistanceMeters = steps
    .filter((step) => step?.travelMode === "WALK")
    .reduce(
      (total, step) =>
        total +
        (Number.isFinite(step?.distanceMeters)
          ? Math.max(0, step.distanceMeters)
          : 0),
      0
    );
  const vehicleTypes = [
    ...new Set(
      transitSteps.map((step) =>
        normalizeTransitVehicleType(
          step.transitDetails?.transitLine
            ?.vehicle?.type
        )
      )
    ),
  ];

  return {
    vehicleTypes,
    transitLegCount: transitSteps.length,
    transferCount: Math.max(
      0,
      transitSteps.length - 1
    ),
    walkDistanceMeters: Math.round(walkDistanceMeters),
  };
}

function getGoogleErrorDiagnostic(data) {
  const error =
    data && typeof data === "object"
      ? data.error
      : null;

  return {
    code:
      typeof error?.status === "string"
        ? error.status
        : typeof error?.code === "number"
          ? String(error.code)
          : "unknown",
    message:
      typeof error?.message === "string"
        ? error.message.replace(/\s+/g, " ").trim()
        : "unknown",
  };
}

function throwTransitRouteNotFound(
  routeRequest,
  upstreamStatus,
  diagnosticMessage
) {
  if (IS_DEVELOPMENT) {
    console.info(
      `[Routes API] TRANSIT google no-route status=${upstreamStatus} code=NO_ROUTE message=${diagnosticMessage} departureTime=${Boolean(routeRequest.departureTime)}`
    );
  }

  throw new RouteServiceError(
    "해당 시간에 대중교통 경로가 없습니다.",
    422,
    upstreamStatus,
    "TRANSIT_ROUTE_NOT_FOUND"
  );
}

function throwWalkRouteNotFound(
  upstreamStatus,
  diagnosticMessage
) {
  if (IS_DEVELOPMENT) {
    console.info(
      `[Routes API] WALK google no-route status=${upstreamStatus} code=NO_ROUTE message=${diagnosticMessage}`
    );
  }

  throw new RouteServiceError(
    "도보 경로를 찾을 수 없습니다.",
    422,
    upstreamStatus,
    "WALK_ROUTE_NOT_FOUND"
  );
}

async function requestGoogleRoute(
  routeRequest,
  apiKey
) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new RouteServiceError(
      "Google Maps API key가 설정되지 않았습니다.",
      500,
      null,
      "ROUTE_PROVIDER_UNAVAILABLE"
    );
  }

  let response;
  const fieldMask =
    routeRequest.travelMode === "TRANSIT"
      ? TRANSIT_ROUTES_FIELD_MASK
      : WALK_ROUTES_FIELD_MASK;
  const requestBody = {
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
    ...(routeRequest.travelMode === "TRANSIT"
      ? {
          departureTime:
            routeRequest.departureTime,
        }
      : {}),
  };

  try {
    if (IS_DEVELOPMENT) {
      console.info(
        `[Routes API] mode=${routeRequest.travelMode} google=request`
      );
    }

    response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(requestBody),
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
    if (
      IS_DEVELOPMENT &&
      routeRequest.travelMode === "TRANSIT"
    ) {
      const diagnostic =
        getGoogleErrorDiagnostic(data);

      console.error(
        `[Routes API] TRANSIT google error status=${response.status} code=${diagnostic.code} message=${diagnostic.message} departureTime=${Boolean(routeRequest.departureTime)}`
      );
    }

    throw new RouteServiceError(
      "Google Routes 경로 계산에 실패했습니다.",
      502,
      response.status
    );
  }

  const routes = Array.isArray(data?.routes)
    ? data.routes
    : [];
  const route = routes[0];

  if (!route) {
    if (routeRequest.travelMode === "TRANSIT") {
      throwTransitRouteNotFound(
        routeRequest,
        response.status,
        "no routes returned"
      );
    }

    throwWalkRouteNotFound(
      response.status,
      "no routes returned"
    );
  }

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
    if (routeRequest.travelMode === "TRANSIT") {
      throwTransitRouteNotFound(
        routeRequest,
        response.status,
        "usable route fields missing"
      );
    }

    throwWalkRouteNotFound(
      response.status,
      "usable route fields missing"
    );
  }

  const coordinates =
    decodeEncodedPolyline(encodedPolyline);

  if (coordinates.length === 0) {
    if (routeRequest.travelMode === "WALK") {
      throwWalkRouteNotFound(
        response.status,
        "route coordinates missing"
      );
    }

    throwTransitRouteNotFound(
      routeRequest,
      response.status,
      "route coordinates missing"
    );
  }

  return {
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: parseDurationSeconds(
      route.duration
    ),
    coordinates,
    travelMode: routeRequest.travelMode,
    ...(routeRequest.travelMode === "TRANSIT"
      ? {
          transitSummary:
            createTransitSummary(route),
        }
      : {}),
  };
}

async function computeCachedRoute(
  routeRequest,
  providerConfig
) {
  const config =
    typeof providerConfig === "string"
      ? { googleApiKey: providerConfig }
      : providerConfig ?? {};
  const provider = selectRouteProvider(routeRequest);
  const cacheKey =
    createRouteCacheKey(routeRequest, provider);
  const cachedRoute = getCachedRoute(cacheKey);

  if (cachedRoute) {
    if (IS_DEVELOPMENT) {
      console.info(
        routeRequest.travelMode === "TRANSIT"
          ? `[Transit] provider=${provider} cache=hit`
          : `[Routes API] mode=${routeRequest.travelMode} cache=hit`
      );
    }
    return cachedRoute;
  }

  const inFlight =
    routeRequestsInFlight.get(cacheKey);

  if (inFlight) {
    if (IS_DEVELOPMENT) {
      console.info(
        routeRequest.travelMode === "TRANSIT"
          ? `[Transit] provider=${provider} cache=in-flight`
          : `[Routes API] mode=${routeRequest.travelMode} cache=in-flight`
      );
    }
    return inFlight;
  }

  const request = (async () => {
    const straightLineDistance =
      calculateStraightLineDistance(
        routeRequest.origin,
        routeRequest.destination
      );

    if (
      routeRequest.travelMode === "WALK" &&
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

      storeCachedRoute(
        cacheKey,
        route,
        getRouteCacheTtl(
          routeRequest.travelMode
        )
      );
      return route;
    }

    let route;

    try {
      route =
        routeRequest.travelMode === "TRANSIT"
          ? await requestTransitRoute(routeRequest, {
              googleApiKey: config.googleApiKey,
              navitimeApiKey: config.navitimeApiKey,
              navitimeHost: config.navitimeHost,
              requestGoogleRoute,
            })
          : await requestGoogleRoute(
              routeRequest,
              config.googleApiKey
            );
    } catch (error) {
      if (error instanceof TransitProviderError) {
        throw new RouteServiceError(
          error.message,
          error.statusCode,
          error.upstreamStatus,
          error.code
        );
      }

      throw error;
    }

    storeCachedRoute(
      cacheKey,
      route,
      getRouteCacheTtl(
        routeRequest.travelMode
      )
    );
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
  ROUTES_FIELD_MASK: WALK_ROUTES_FIELD_MASK,
  TRANSIT_ROUTES_FIELD_MASK,
  ROUTE_CACHE_TTL_MS,
  TRANSIT_ROUTE_CACHE_TTL_MS,
  TRANSIT_FUTURE_WINDOW_MS,
  TRANSIT_PAST_WINDOW_MS,
  RouteServiceError,
  calculateStraightLineDistance,
  computeCachedRoute,
  createTransitSummary,
  createRouteCacheKey,
  decodeEncodedPolyline,
  normalizeDepartureTime,
  normalizeRouteRequest,
  normalizeTransitVehicleType,
  requestGoogleRoute,
};
