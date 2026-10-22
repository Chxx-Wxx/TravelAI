import {
  ComputedRoute,
  RouteTravelMode,
} from "../services/route";

export const ROUTE_RECOMMENDATION_WEIGHTS = {
  TRANSIT_BOARDING_MINUTES: 4,
  TRANSFER_MINUTES: 5,
  YEN_PER_EQUIVALENT_MINUTE: 60,
  TRANSIT_WALK_MINUTES_PER_KILOMETER: 2,
} as const;

export type RouteRecommendation = {
  recommendedMode: RouteTravelMode;
  walkScore: number;
  transitScore: number;
  savedMinutes: number;
  costPerSavedMinute: number | null;
};

function getTransitFare(route: ComputedRoute) {
  return (
    route.transitSummary?.fare?.ic ??
    route.transitSummary?.fare?.ticket ??
    0
  );
}

export function recommendRouteMode(
  walkRoute: ComputedRoute,
  transitRoute: ComputedRoute
): RouteRecommendation {
  const walkMinutes = walkRoute.durationSeconds / 60;
  const transitMinutes =
    transitRoute.durationSeconds / 60;
  const fare = getTransitFare(transitRoute);
  const transferCount =
    transitRoute.transitSummary?.transferCount ?? 0;
  const transitWalkKilometers =
    (transitRoute.transitSummary?.walkDistanceMeters ?? 0) /
    1000;
  const savedMinutes = walkMinutes - transitMinutes;
  const costPerSavedMinute =
    savedMinutes > 0 ? fare / savedMinutes : null;
  const walkScore = walkMinutes;
  const transitScore =
    transitMinutes +
    ROUTE_RECOMMENDATION_WEIGHTS.TRANSIT_BOARDING_MINUTES +
    transferCount *
      ROUTE_RECOMMENDATION_WEIGHTS.TRANSFER_MINUTES +
    fare /
      ROUTE_RECOMMENDATION_WEIGHTS.YEN_PER_EQUIVALENT_MINUTE +
    transitWalkKilometers *
      ROUTE_RECOMMENDATION_WEIGHTS.TRANSIT_WALK_MINUTES_PER_KILOMETER;

  return {
    recommendedMode:
      transitScore < walkScore ? "TRANSIT" : "WALK",
    walkScore,
    transitScore,
    savedMinutes,
    costPerSavedMinute,
  };
}
