import {
  isValidCalendarDate,
} from "./trip-date";

import type {
  Schedule,
} from "../types";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const TRANSIT_PAST_WINDOW_MS = 7 * DAY_MS;
export const TRANSIT_FUTURE_WINDOW_MS = 100 * DAY_MS;

type ScheduleTimeInput = Pick<
  Schedule,
  "date" | "time" | "durationMinutes"
>;

export type TransitTimeAvailability =
  | "available"
  | "invalid"
  | "too-old"
  | "too-far";

export function timeToMinutes(time: string) {
  const timeMatch =
    /^(\d{2}):(\d{2})$/.exec(time);

  if (!timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

export function calculateScheduleEndTime(
  startTime: string,
  durationMinutes?: number
) {
  if (!durationMinutes) {
    return null;
  }

  const start = timeToMinutes(startTime);

  if (start === null) {
    return null;
  }

  const end = start + durationMinutes;
  const endHour = Math.floor(end / 60) % 24;
  const endMinute = end % 60;

  return `${String(endHour).padStart(2, "0")}:${String(
    endMinute
  ).padStart(2, "0")}`;
}

export function calculateScheduleGapMinutes(
  current: Pick<
    Schedule,
    "time" | "durationMinutes"
  >,
  next?: Pick<Schedule, "time">
) {
  if (!next || !current.durationMinutes) {
    return null;
  }

  const currentStart = timeToMinutes(current.time);
  let nextStart = timeToMinutes(next.time);

  if (
    currentStart === null ||
    nextStart === null
  ) {
    return null;
  }

  const currentEnd =
    currentStart + current.durationMinutes;

  if (nextStart < currentStart) {
    nextStart += 24 * 60;
  }

  return nextStart - currentEnd;
}

export function getScheduleEndDate(
  schedule: ScheduleTimeInput
) {
  if (!isValidCalendarDate(schedule.date)) {
    return null;
  }

  const startMinutes =
    timeToMinutes(schedule.time);
  const durationMinutes =
    schedule.durationMinutes ?? 0;

  if (
    startMinutes === null ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 0
  ) {
    return null;
  }

  const [year, month, day] =
    schedule.date.split("-").map(Number);
  const hour = Math.floor(startMinutes / 60);
  const minute = startMinutes % 60;
  const start = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );

  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day ||
    start.getHours() !== hour ||
    start.getMinutes() !== minute
  ) {
    return null;
  }

  return new Date(
    start.getTime() +
      Math.round(durationMinutes) * MINUTE_MS
  );
}

export function createScheduleDepartureTime(
  schedule: ScheduleTimeInput
) {
  return getScheduleEndDate(schedule)?.toISOString() ?? null;
}

export function getTransitTimeAvailability(
  departureTime: string | null,
  now = Date.now()
): TransitTimeAvailability {
  if (!departureTime) {
    return "invalid";
  }

  const departureTimeMs = Date.parse(departureTime);

  if (
    !Number.isFinite(departureTimeMs) ||
    !Number.isFinite(now)
  ) {
    return "invalid";
  }

  if (departureTimeMs < now - TRANSIT_PAST_WINDOW_MS) {
    return "too-old";
  }

  if (departureTimeMs > now + TRANSIT_FUTURE_WINDOW_MS) {
    return "too-far";
  }

  return "available";
}
