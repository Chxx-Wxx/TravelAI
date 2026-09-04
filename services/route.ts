const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export type RouteTravelMode = "WALK";

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type ComputedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: RouteCoordinate[];
  travelMode: RouteTravelMode;
};

type ComputeRouteInput = {
  tripId: string;
  date: string;
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  travelMode?: RouteTravelMode;
};

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  return API_URL;
}

function isValidCoordinate(
  coordinate: RouteCoordinate
) {
  return (
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
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
    route.travelMode === "WALK" &&
    Array.isArray(route.coordinates) &&
    route.coordinates.length > 0 &&
    route.coordinates.every(isValidCoordinate)
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
    message?: string;
    route?: unknown;
  } | null = null;

  try {
    data = await response.json();
  } catch {
    // The server should return JSON, but never surface proxy HTML to the UI.
  }

  if (!response.ok) {
    throw new Error(
      data?.message ??
        "경로 정보를 불러올 수 없습니다."
    );
  }

  if (!isComputedRoute(data?.route)) {
    throw new Error(
      "경로 응답 형식이 올바르지 않습니다."
    );
  }

  return data.route;
}
