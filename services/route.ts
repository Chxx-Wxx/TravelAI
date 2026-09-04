const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export const ROUTE_TRAVEL_MODES = [
  "WALK",
  "TRANSIT",
] as const;

export type RouteTravelMode =
  (typeof ROUTE_TRAVEL_MODES)[number];

export const TRANSIT_VEHICLE_TYPES = [
  "BUS",
  "SUBWAY",
  "TRAIN",
  "TRAM",
  "FERRY",
  "OTHER",
] as const;

export type TransitVehicleType =
  (typeof TRANSIT_VEHICLE_TYPES)[number];

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type ComputedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: RouteCoordinate[];
  travelMode: RouteTravelMode;
  transitSummary?: {
    vehicleTypes: TransitVehicleType[];
    transitLegCount: number;
    transferCount: number;
    walkDistanceMeters?: number;
    hasShinkansen?: boolean;
    lineNames?: string[];
    fare?: {
      ticket?: number;
      ic?: number;
      currency: "JPY";
    };
  };
};

export type ComputeRouteInput = {
  tripId: string;
  date: string;
  country?: string;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  travelMode?: RouteTravelMode;
  departureTime?: string;
};

export class RouteRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "RouteRequestError";
    this.code = code;
  }
}

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  return API_URL;
}

function isValidCoordinate(
  value: unknown
) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const coordinate = value as RouteCoordinate;

  return (
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

function isOptionalTransitFare(
  value: unknown
) {
  if (value === undefined) {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const fare = value as NonNullable<
    NonNullable<
      ComputedRoute["transitSummary"]
    >["fare"]
  >;

  return (
    fare.currency === "JPY" &&
    (fare.ticket === undefined ||
      (Number.isFinite(fare.ticket) &&
        fare.ticket >= 0)) &&
    (fare.ic === undefined ||
      (Number.isFinite(fare.ic) && fare.ic >= 0)) &&
    (fare.ticket !== undefined || fare.ic !== undefined)
  );
}

function isRouteTravelMode(
  value: unknown
): value is RouteTravelMode {
  return ROUTE_TRAVEL_MODES.some(
    (mode) => mode === value
  );
}

function isTransitSummary(
  value: unknown
): value is NonNullable<
  ComputedRoute["transitSummary"]
> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const summary =
    value as NonNullable<
      ComputedRoute["transitSummary"]
    >;

  return (
    Array.isArray(summary.vehicleTypes) &&
    summary.vehicleTypes.every((vehicleType) =>
      TRANSIT_VEHICLE_TYPES.some(
        (supportedType) =>
          supportedType === vehicleType
      )
    ) &&
    Number.isInteger(summary.transitLegCount) &&
    summary.transitLegCount >= 0 &&
    Number.isInteger(summary.transferCount) &&
    summary.transferCount >= 0 &&
    (summary.walkDistanceMeters === undefined ||
      (Number.isFinite(summary.walkDistanceMeters) &&
        summary.walkDistanceMeters >= 0)) &&
    (summary.hasShinkansen === undefined ||
      typeof summary.hasShinkansen === "boolean") &&
    (summary.lineNames === undefined ||
      (Array.isArray(summary.lineNames) &&
        summary.lineNames.every(
          (lineName) =>
            typeof lineName === "string" &&
            lineName.length > 0
        ))) &&
    isOptionalTransitFare(summary.fare)
  );
}

function isComputedRoute(
  value: unknown
): value is ComputedRoute {
  if (!value || typeof value !== "object") {
    return false;
  }

  const route = value as ComputedRoute;

  return (
    Number.isFinite(route.distanceMeters) &&
    route.distanceMeters >= 0 &&
    Number.isFinite(route.durationSeconds) &&
    route.durationSeconds >= 0 &&
    isRouteTravelMode(route.travelMode) &&
    Array.isArray(route.coordinates) &&
    route.coordinates.length <= 2000 &&
    (route.travelMode === "TRANSIT" ||
      route.coordinates.length > 0) &&
    route.coordinates.every(isValidCoordinate) &&
    (route.travelMode !== "TRANSIT" ||
      route.transitSummary === undefined ||
      isTransitSummary(route.transitSummary))
  );
}

export async function computeRoute(
  input: ComputeRouteInput,
  signal?: AbortSignal
): Promise<ComputedRoute> {
  const apiUrl = requireApiUrl();
  const response = await fetch(
    `${apiUrl}/routes/compute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        ...input,
        travelMode:
          input.travelMode ?? "WALK",
      }),
    }
  );

  let data: {
    code?: string;
    message?: string;
    route?: unknown;
  } | null = null;

  try {
    data = await response.json();
  } catch {
    // The server should return JSON, but never surface proxy HTML to the UI.
  }

  if (!response.ok) {
    throw new RouteRequestError(
      data?.message ??
        "경로 정보를 불러올 수 없습니다.",
      data?.code
    );
  }

  if (!isComputedRoute(data?.route)) {
    throw new Error(
      "경로 응답 형식이 올바르지 않습니다."
    );
  }

  return data.route;
}
