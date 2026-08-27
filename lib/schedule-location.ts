import type {
  Schedule,
} from "../types";

type ScheduleLocation = Pick<
  Schedule,
  "latitude" | "longitude"
>;

export type LinkedScheduleLocation =
  ScheduleLocation & {
    latitude: number;
    longitude: number;
  };

export function hasValidScheduleLocation<
  T extends ScheduleLocation,
>(
  schedule: T
): schedule is T & LinkedScheduleLocation {
  return (
    typeof schedule.latitude === "number" &&
    Number.isFinite(schedule.latitude) &&
    schedule.latitude >= -90 &&
    schedule.latitude <= 90 &&
    typeof schedule.longitude === "number" &&
    Number.isFinite(schedule.longitude) &&
    schedule.longitude >= -180 &&
    schedule.longitude <= 180
  );
}
