export const LIVE_LOCATION_MAX_AGE_MS = 15_000;
export const LIVE_LOCATION_MAX_ACCURACY_METERS = 150;
export const LIVE_LOCATION_LOW_ACCURACY_METERS = 50;

export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  timestamp: number;
};

export type LocationSampleRejection =
  | "invalid"
  | "stale"
  | "inaccurate"
  | "out-of-order"
  | "implausible-jump";

export type LocationSampleEvaluation =
  | {
      accepted: true;
      sample: LocationSample;
    }
  | {
      accepted: false;
      reason: LocationSampleRejection;
    };

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function normalizeOptionalPositive(value: number | null | undefined) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : null;
}

export function isValidLocationCoordinate(
  latitude: number,
  longitude: number
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function getLocationDistanceMeters(
  from: Pick<LocationSample, "latitude" | "longitude">,
  to: Pick<LocationSample, "latitude" | "longitude">
) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

export function evaluateLocationSample(
  value: LocationSample,
  previous: LocationSample | null,
  now = Date.now()
): LocationSampleEvaluation {
  if (
    !isValidLocationCoordinate(value.latitude, value.longitude) ||
    !Number.isFinite(value.timestamp)
  ) {
    return { accepted: false, reason: "invalid" };
  }

  const accuracy = normalizeOptionalPositive(value.accuracy);
  const speed = normalizeOptionalPositive(value.speed);
  const sample: LocationSample = {
    latitude: value.latitude,
    longitude: value.longitude,
    accuracy,
    speed,
    timestamp: value.timestamp,
  };
  const age = now - sample.timestamp;

  if (age > LIVE_LOCATION_MAX_AGE_MS || age < -5_000) {
    return { accepted: false, reason: "stale" };
  }

  if (
    accuracy !== null &&
    accuracy > LIVE_LOCATION_MAX_ACCURACY_METERS
  ) {
    return { accepted: false, reason: "inaccurate" };
  }

  if (!previous) {
    return { accepted: true, sample };
  }

  if (sample.timestamp <= previous.timestamp) {
    return { accepted: false, reason: "out-of-order" };
  }

  const elapsedSeconds =
    (sample.timestamp - previous.timestamp) / 1_000;
  const distance = getLocationDistanceMeters(previous, sample);
  const reportedSpeed = Math.max(
    previous.speed ?? 0,
    sample.speed ?? 0
  );
  const accuracyAllowance =
    (previous.accuracy ?? 0) + (sample.accuracy ?? 0) + 30;
  const movementAllowance = reportedSpeed * elapsedSeconds * 2 + 50;
  const plausibleDistance = Math.max(
    120,
    accuracyAllowance,
    movementAllowance
  );

  if (elapsedSeconds <= 10 && distance > plausibleDistance) {
    return { accepted: false, reason: "implausible-jump" };
  }

  return { accepted: true, sample };
}

export function normalizeHeading(value: number | null | undefined) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return ((value % 360) + 360) % 360;
}

export function getShortestHeadingTarget(
  currentUnwrapped: number,
  nextHeading: number
) {
  const normalizedCurrent =
    ((currentUnwrapped % 360) + 360) % 360;
  const normalizedNext = ((nextHeading % 360) + 360) % 360;
  const delta =
    ((normalizedNext - normalizedCurrent + 540) % 360) - 180;

  return currentUnwrapped + delta;
}

export function getHeadingDeadband(accuracy: number) {
  if (accuracy >= 3) {
    return 2;
  }

  if (accuracy === 2) {
    return 4;
  }

  return 6;
}

export function getLocationAnimationDuration(
  previousTimestamp: number,
  nextTimestamp: number
) {
  const elapsed = Math.max(0, nextTimestamp - previousTimestamp);
  return Math.round(Math.min(850, Math.max(240, elapsed * 0.75)));
}

export function shouldAnimateLocationSample(
  previous: LocationSample,
  next: LocationSample
) {
  const previousAccuracy = previous.accuracy;
  const nextAccuracy = next.accuracy;

  if (
    previousAccuracy === null ||
    nextAccuracy === null ||
    previousAccuracy > LIVE_LOCATION_LOW_ACCURACY_METERS ||
    nextAccuracy > LIVE_LOCATION_LOW_ACCURACY_METERS
  ) {
    return false;
  }

  const distance = getLocationDistanceMeters(previous, next);
  const uncertainty = previousAccuracy + nextAccuracy;

  return distance <= Math.max(80, uncertainty * 2 + 20);
}
