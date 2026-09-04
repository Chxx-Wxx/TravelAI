const NAVITIME_ROUTE_PATH = "/route_transit";
const DEFAULT_NAVITIME_RAPIDAPI_HOST =
  "navitime-route-totalnavi.p.rapidapi.com";
const MAX_ROUTE_COORDINATES = 2000;
const IS_DEVELOPMENT =
  process.env.NODE_ENV !== "production";

const TRANSIT_PROVIDERS = {
  GOOGLE: "GOOGLE",
  NAVITIME: "NAVITIME",
};

const NAVITIME_TRAIN_TYPES = new Set([
  "superexpress_train",
  "sleeper_ultraexpress",
  "ultraexpress_train",
  "express_train",
  "rapid_train",
  "semiexpress_train",
  "local_train",
]);

const NAVITIME_BUS_TYPES = new Set([
  "shuttle_bus",
  "highway_bus",
  "local_bus",
]);

class TransitProviderError extends Error {
  constructor(
    message,
    statusCode = 502,
    upstreamStatus = null,
    code = "TRANSIT_PROVIDER_UNAVAILABLE"
  ) {
    super(message);
    this.name = "TransitProviderError";
    this.statusCode = statusCode;
    this.upstreamStatus = upstreamStatus;
    this.code = code;
  }
}

function isJapanCountry(value) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
  const compact = normalized.replace(/[\s._-]+/g, "");

  return (
    compact === "jp" ||
    compact === "jpn" ||
    normalized.includes("japan") ||
    normalized.includes("일본") ||
    normalized.includes("日本")
  );
}

function selectRouteProvider(routeRequest) {
  if (
    routeRequest.travelMode === "TRANSIT" &&
    isJapanCountry(routeRequest.country)
  ) {
    return TRANSIT_PROVIDERS.NAVITIME;
  }

  return TRANSIT_PROVIDERS.GOOGLE;
}

function formatNavitimeStartTime(departureTime) {
  const date = new Date(departureTime);

  if (!Number.isFinite(date.getTime())) {
    throw new TransitProviderError(
      "대중교통 출발시간이 올바르지 않습니다.",
      400,
      null,
      "TRANSIT_DEPARTURE_TIME_INVALID"
    );
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function isFiniteNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function toNonNegativeInteger(value) {
  return isFiniteNumber(value) && value >= 0
    ? Math.round(value)
    : null;
}

function normalizeNavitimeVehicleType(value) {
  if (NAVITIME_TRAIN_TYPES.has(value)) {
    return "TRAIN";
  }

  if (NAVITIME_BUS_TYPES.has(value)) {
    return "BUS";
  }

  if (value === "ferry") {
    return "FERRY";
  }

  return value === "walk" ? null : "OTHER";
}

function normalizeNavitimeCoordinates(shapes) {
  const features = Array.isArray(shapes?.features)
    ? shapes.features
    : [];
  const coordinates = [];

  for (const feature of features) {
    if (feature?.geometry?.type !== "LineString") {
      continue;
    }

    const lineCoordinates = feature.geometry.coordinates;

    if (!Array.isArray(lineCoordinates)) {
      return [];
    }

    for (const coordinate of lineCoordinates) {
      const longitude = coordinate?.[0];
      const latitude = coordinate?.[1];

      if (
        !isFiniteNumber(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !isFiniteNumber(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        return [];
      }

      const previous = coordinates.at(-1);

      if (
        previous?.latitude === latitude &&
        previous?.longitude === longitude
      ) {
        continue;
      }

      coordinates.push({ latitude, longitude });

      if (coordinates.length > MAX_ROUTE_COORDINATES) {
        return [];
      }
    }
  }

  return coordinates.length >= 2 ? coordinates : [];
}

function getTransitSections(item) {
  return Array.isArray(item?.sections)
    ? item.sections.filter(
        (section) =>
          section?.type === "move" &&
          section?.move !== "walk"
      )
    : [];
}

function createNavitimeTransitSummary(item) {
  const moveSummary = item.summary.move;
  const transitSections = getTransitSections(item);
  const summaryMoveTypes = Array.isArray(
    moveSummary.move_type
  )
    ? moveSummary.move_type
    : Array.isArray(moveSummary.move_types)
      ? moveSummary.move_types
      : [];
  const rawVehicleTypes =
    transitSections.length > 0
      ? transitSections.map((section) => section.move)
      : summaryMoveTypes.filter((moveType) => moveType !== "walk");
  const vehicleTypes = [
    ...new Set(
      rawVehicleTypes
        .map(normalizeNavitimeVehicleType)
        .filter(Boolean)
    ),
  ];
  const lineNames = [
    ...new Set(
      transitSections
        .map((section) => {
          const lineName =
            typeof section.line_name === "string"
              ? section.line_name.trim()
              : "";

          return lineName || section.transport?.name;
        })
        .filter(
          (lineName) =>
            typeof lineName === "string" &&
            lineName.trim()
        )
        .map((lineName) => lineName.trim())
    ),
  ];
  const reportedTransferCount = toNonNegativeInteger(
    moveSummary.transit_count
  );
  const walkDistanceMeters = (
    Array.isArray(item.sections) ? item.sections : []
  )
    .filter(
      (section) =>
        section?.type === "move" &&
        section?.move === "walk"
    )
    .reduce(
      (total, section) =>
        total +
        (isFiniteNumber(section.distance)
          ? Math.max(0, section.distance)
          : 0),
      0
    );
  const referenceFare = moveSummary.reference_fare;
  const hasShinkansen = transitSections.some(
    (section) => section.move === "superexpress_train"
  );
  const ticket = toNonNegativeInteger(
    referenceFare?.lowest_total_ticket
  );
  const ic = toNonNegativeInteger(
    referenceFare?.lowest_total_ic
  );

  return {
    vehicleTypes,
    transitLegCount: transitSections.length,
    transferCount:
      reportedTransferCount ??
      Math.max(0, transitSections.length - 1),
    walkDistanceMeters: Math.round(walkDistanceMeters),
    hasShinkansen,
    ...(lineNames.length > 0 ? { lineNames } : {}),
    ...(ticket !== null || ic !== null
      ? {
          fare: {
            ...(ticket !== null ? { ticket } : {}),
            ...(ic !== null ? { ic } : {}),
            currency: "JPY",
          },
        }
      : {}),
  };
}

function findFirstUsableNavitimeItem(data) {
  const items = Array.isArray(data?.items)
    ? data.items
    : [];

  return items.find((item) => {
    const move = item?.summary?.move;

    return (
      isFiniteNumber(move?.time) &&
      move.time >= 0 &&
      isFiniteNumber(move?.distance) &&
      move.distance >= 0
    );
  });
}

function normalizeNavitimeRoute(data) {
  const item = findFirstUsableNavitimeItem(data);

  if (!item) {
    throw new TransitProviderError(
      "해당 시간의 대중교통 경로가 없습니다.",
      422,
      200,
      "TRANSIT_ROUTE_NOT_FOUND"
    );
  }

  const transitSummary =
    createNavitimeTransitSummary(item);

  if (transitSummary.transitLegCount === 0) {
    throw new TransitProviderError(
      "이 구간에는 이용 가능한 대중교통 경로가 없습니다.",
      422,
      200,
      "TRANSIT_WALK_ONLY"
    );
  }

  return {
    distanceMeters: Math.round(item.summary.move.distance),
    durationSeconds: Math.round(item.summary.move.time * 60),
    coordinates: normalizeNavitimeCoordinates(item.shapes),
    travelMode: "TRANSIT",
    transitSummary,
  };
}

function normalizeNavitimeHost(value) {
  const configuredHost = String(value ?? "").trim();
  const host =
    configuredHost || DEFAULT_NAVITIME_RAPIDAPI_HOST;

  if (!/^[a-z0-9.-]+$/i.test(host)) {
    throw new TransitProviderError(
      "대중교통 경로 제공자 설정을 확인해 주세요.",
      503
    );
  }

  return host;
}

async function requestNavitimeTransitRoute(
  routeRequest,
  { apiKey, host }
) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new TransitProviderError(
      "대중교통 경로 제공자 설정을 확인해 주세요.",
      503
    );
  }

  const rapidApiHost = normalizeNavitimeHost(host);
  const url = new URL(
    `https://${rapidApiHost}${NAVITIME_ROUTE_PATH}`
  );

  url.searchParams.set(
    "start",
    `${routeRequest.origin.latitude},${routeRequest.origin.longitude}`
  );
  url.searchParams.set(
    "goal",
    `${routeRequest.destination.latitude},${routeRequest.destination.longitude}`
  );
  url.searchParams.set(
    "start_time",
    formatNavitimeStartTime(routeRequest.departureTime)
  );
  url.searchParams.set("datum", "wgs84");
  url.searchParams.set("coord_unit", "degree");
  url.searchParams.set("shape", "true");
  url.searchParams.set("limit", "1");

  let response;

  try {
    if (IS_DEVELOPMENT) {
      console.info("[Transit] provider=NAVITIME request");
    }

    response = await fetch(url, {
      headers: {
        "x-rapidapi-key": apiKey.trim(),
        "x-rapidapi-host": rapidApiHost,
      },
    });
  } catch {
    throw new TransitProviderError(
      "대중교통 경로 정보를 불러올 수 없습니다.",
      503
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    // Provider text/HTML is never forwarded to the app.
  }

  if (!response.ok) {
    const code =
      response.status === 429
        ? "TRANSIT_RATE_LIMITED"
        : "TRANSIT_PROVIDER_UNAVAILABLE";
    const statusCode = response.status === 429 ? 429 : 503;

    if (IS_DEVELOPMENT) {
      console.error(
        `[Transit] provider=NAVITIME error status=${response.status} code=${code}`
      );
    }

    throw new TransitProviderError(
      response.status === 429
        ? "대중교통 경로 요청이 많습니다. 잠시 후 다시 시도해 주세요."
        : "대중교통 경로 정보를 불러올 수 없습니다.",
      statusCode,
      response.status,
      code
    );
  }

  return normalizeNavitimeRoute(data);
}

async function requestTransitRoute(
  routeRequest,
  {
    googleApiKey,
    navitimeApiKey,
    navitimeHost,
    requestGoogleRoute,
  }
) {
  const provider = selectRouteProvider(routeRequest);

  if (provider === TRANSIT_PROVIDERS.NAVITIME) {
    return requestNavitimeTransitRoute(routeRequest, {
      apiKey: navitimeApiKey,
      host: navitimeHost,
    });
  }

  if (IS_DEVELOPMENT) {
    console.info("[Transit] provider=GOOGLE request");
  }

  return requestGoogleRoute(routeRequest, googleApiKey);
}

module.exports = {
  DEFAULT_NAVITIME_RAPIDAPI_HOST,
  MAX_ROUTE_COORDINATES,
  TRANSIT_PROVIDERS,
  TransitProviderError,
  createNavitimeTransitSummary,
  findFirstUsableNavitimeItem,
  formatNavitimeStartTime,
  isJapanCountry,
  normalizeNavitimeCoordinates,
  normalizeNavitimeRoute,
  normalizeNavitimeVehicleType,
  requestNavitimeTransitRoute,
  requestTransitRoute,
  selectRouteProvider,
};
