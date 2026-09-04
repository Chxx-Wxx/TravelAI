type TripDateRange = {
  startDate: string;
  endDate: string;
};

export function isValidCalendarDate(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function formatLocalCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0"
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getInitialTripDate(
  trip: TripDateRange,
  today = new Date()
) {
  if (
    !isValidCalendarDate(trip.startDate) ||
    !isValidCalendarDate(trip.endDate) ||
    trip.startDate > trip.endDate
  ) {
    return null;
  }

  const localToday = formatLocalCalendarDate(today);

  if (localToday < trip.startDate) {
    return trip.startDate;
  }

  if (localToday > trip.endDate) {
    return trip.endDate;
  }

  return localToday;
}

export function isDateWithinTrip(
  date: string,
  trip: TripDateRange
) {
  return (
    isValidCalendarDate(date) &&
    isValidCalendarDate(trip.startDate) &&
    isValidCalendarDate(trip.endDate) &&
    trip.startDate <= date &&
    date <= trip.endDate
  );
}

export function getTripCalendarDates(
  trip: TripDateRange
) {
  if (
    !isValidCalendarDate(trip.startDate) ||
    !isValidCalendarDate(trip.endDate) ||
    trip.startDate > trip.endDate
  ) {
    return [];
  }

  const [startYear, startMonth, startDay] =
    trip.startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] =
    trip.endDate.split("-").map(Number);
  const current = new Date(
    startYear,
    startMonth - 1,
    startDay
  );
  const end = new Date(endYear, endMonth - 1, endDay);
  const dates: string[] = [];

  while (current <= end) {
    dates.push(formatLocalCalendarDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
