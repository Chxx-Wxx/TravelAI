const MAX_TRIP_PEOPLE = 10;

class TripUpdateValidationError extends Error {
  constructor(
    message,
    statusCode = 400,
    code = "TRIP_UPDATE_INVALID",
    details = undefined
  ) {
    super(message);
    this.name = "TripUpdateValidationError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeText(value, fieldLabel) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new TripUpdateValidationError(
      `${fieldLabel}은(는) 필수입니다.`
    );
  }

  return normalized;
}

function isValidCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizePeople(value) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    throw new TripUpdateValidationError(
      "여행 인원은 숫자로 입력해주세요."
    );
  }

  const people = Number(normalized);

  if (
    !Number.isInteger(people) ||
    people < 1 ||
    people > MAX_TRIP_PEOPLE
  ) {
    throw new TripUpdateValidationError(
      `여행 인원은 1명부터 ${MAX_TRIP_PEOPLE}명까지 설정할 수 있습니다.`
    );
  }

  return people;
}

function normalizeTripUpdate(body, currentTrip, activeMemberCount) {
  const tripName = normalizeText(
    hasOwn(body, "tripName")
      ? body.tripName
      : currentTrip.tripName,
    "여행 이름"
  );
  const country = normalizeText(
    hasOwn(body, "country")
      ? body.country
      : currentTrip.country,
    "국가"
  );
  const city = normalizeText(
    hasOwn(body, "city") ? body.city : currentTrip.city,
    "도시"
  );
  const startDate = String(
    hasOwn(body, "startDate")
      ? body.startDate
      : currentTrip.startDate
  ).trim();
  const endDate = String(
    hasOwn(body, "endDate")
      ? body.endDate
      : currentTrip.endDate
  ).trim();

  if (
    !isValidCalendarDate(startDate) ||
    !isValidCalendarDate(endDate) ||
    startDate > endDate
  ) {
    throw new TripUpdateValidationError(
      "여행 시작일과 종료일을 확인해주세요."
    );
  }

  const people = normalizePeople(
    hasOwn(body, "people") ? body.people : activeMemberCount
  );

  return {
    tripName,
    country,
    city,
    startDate,
    endDate,
    people,
    dateChanged:
      startDate !== currentTrip.startDate ||
      endDate !== currentTrip.endDate,
  };
}

function normalizeMemberChanges(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    updates: Array.isArray(source.updates) ? source.updates : [],
    additions: Array.isArray(source.additions)
      ? source.additions
      : [],
    removeIds: Array.isArray(source.removeIds)
      ? source.removeIds
      : [],
  };
}

function applyTripMemberChanges(
  currentMembers,
  rawChanges,
  requestedPeople,
  createMember
) {
  const members = currentMembers.map((member) => ({ ...member }));
  const changes = normalizeMemberChanges(rawChanges);
  const memberById = new Map(
    members.map((member) => [member.id, member])
  );
  const updatedIds = new Set();

  for (const update of changes.updates) {
    const id = String(update?.id ?? "").trim();
    const member = memberById.get(id);

    if (
      !id ||
      !member ||
      member.status === "removed" ||
      updatedIds.has(id)
    ) {
      throw new TripUpdateValidationError(
        "수정할 여행 멤버 정보를 확인해주세요."
      );
    }

    member.displayName = normalizeText(
      update.displayName,
      "동행자 이름"
    );
    updatedIds.add(id);
  }

  const removeIds = [
    ...new Set(
      changes.removeIds.map((id) => String(id ?? "").trim())
    ),
  ].filter(Boolean);

  for (const id of removeIds) {
    const member = memberById.get(id);

    if (!member || member.status === "removed") {
      throw new TripUpdateValidationError(
        "제외할 여행 멤버 정보를 확인해주세요."
      );
    }

    if (
      member.role === "owner" ||
      member.userId ||
      member.status !== "placeholder"
    ) {
      throw new TripUpdateValidationError(
        "여행에 연결된 멤버는 자동으로 제외할 수 없습니다.",
        409,
        "TRIP_MEMBER_REMOVAL_BLOCKED"
      );
    }

    member.status = "removed";
  }

  const addedMembers = changes.additions.map((addition) =>
    createMember(
      normalizeText(addition?.displayName, "동행자 이름")
    )
  );
  members.push(...addedMembers);

  const activeMembers = members.filter(
    (member) => member.status !== "removed"
  );

  if (activeMembers.length !== requestedPeople) {
    throw new TripUpdateValidationError(
      "여행 인원수와 유지할 동행자 수가 일치하지 않습니다."
    );
  }

  if (!activeMembers.some((member) => member.role === "owner")) {
    throw new TripUpdateValidationError(
      "여행 만든 사람은 제외할 수 없습니다.",
      409,
      "TRIP_MEMBER_REMOVAL_BLOCKED"
    );
  }

  return {
    members,
    activeMembers,
    addedMembers,
    removeIds,
    updatedIds: [...updatedIds],
  };
}

function findSchedulesOutsideRange(schedules, startDate, endDate) {
  return schedules.filter(
    (schedule) =>
      schedule.date < startDate || schedule.date > endDate
  );
}

function validateScheduleDateWithinTrip(date, startDate, endDate) {
  const normalizedDate = String(date ?? "").trim();

  if (!isValidCalendarDate(normalizedDate)) {
    throw new TripUpdateValidationError(
      "일정 날짜 형식을 확인해주세요."
    );
  }

  if (normalizedDate < startDate || normalizedDate > endDate) {
    throw new TripUpdateValidationError(
      `일정은 ${startDate}부터 ${endDate} 사이에만 설정할 수 있습니다.`,
      409,
      "SCHEDULE_DATE_OUTSIDE_TRIP"
    );
  }

  return normalizedDate;
}

function normalizeScheduleDateUpdates(
  currentSchedules,
  rawUpdates,
  startDate,
  endDate
) {
  const updates = Array.isArray(rawUpdates) ? rawUpdates : [];
  const scheduleById = new Map(
    currentSchedules.map((schedule) => [schedule.id, schedule])
  );
  const seenIds = new Set();
  const normalizedUpdates = updates.map((update) => {
    const id = String(update?.id ?? "").trim();
    const previousDate = String(update?.previousDate ?? "").trim();
    const date = String(update?.date ?? "").trim();
    const schedule = scheduleById.get(id);

    if (!id || !schedule || seenIds.has(id)) {
      throw new TripUpdateValidationError(
        "변경할 일정 정보를 확인해주세요."
      );
    }

    if (previousDate !== schedule.date) {
      throw new TripUpdateValidationError(
        "일정 날짜가 다른 화면에서 변경되었습니다. 최신 정보를 다시 불러온 뒤 시도해주세요.",
        409,
        "TRIP_SCHEDULE_CHANGED"
      );
    }

    if (
      !isValidCalendarDate(date) ||
      date < startDate ||
      date > endDate
    ) {
      throw new TripUpdateValidationError(
        "변경할 일정 날짜가 새 여행 기간 안에 있어야 합니다."
      );
    }

    seenIds.add(id);

    return {
      id,
      date,
      previousDate,
    };
  });
  const dateById = new Map(
    normalizedUpdates.map((update) => [update.id, update.date])
  );
  const projectedSchedules = currentSchedules.map((schedule) => ({
    ...schedule,
    date: dateById.get(schedule.id) ?? schedule.date,
  }));
  const outsideSchedules = findSchedulesOutsideRange(
    projectedSchedules,
    startDate,
    endDate
  );

  if (outsideSchedules.length > 0) {
    throw new TripUpdateValidationError(
      "변경할 여행 기간 밖에 남아 있는 일정이 있습니다.",
      409,
      "TRIP_DATE_RANGE_CONFLICT",
      {
        schedules: outsideSchedules.map(({ id, title, date }) => ({
          id,
          title,
          date,
        })),
      }
    );
  }

  return {
    updates: normalizedUpdates,
    projectedSchedules,
  };
}

module.exports = {
  MAX_TRIP_PEOPLE,
  TripUpdateValidationError,
  applyTripMemberChanges,
  findSchedulesOutsideRange,
  isValidCalendarDate,
  normalizeScheduleDateUpdates,
  normalizeTripUpdate,
  validateScheduleDateWithinTrip,
};
