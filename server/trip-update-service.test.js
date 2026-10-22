const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TripUpdateValidationError,
  applyTripMemberChanges,
  findSchedulesOutsideRange,
  normalizeScheduleDateUpdates,
  normalizeTripUpdate,
  validateScheduleDateWithinTrip,
} = require("./trip-update-service");

const baseMembers = [
  {
    id: "owner-id",
    tripId: "trip-id",
    userId: "user-id",
    displayName: "나",
    role: "owner",
    status: "active",
  },
  {
    id: "friend-id",
    tripId: "trip-id",
    userId: null,
    displayName: "친구",
    role: "member",
    status: "placeholder",
  },
];

function createMember(displayName) {
  return {
    id: `new-${displayName}`,
    tripId: "trip-id",
    userId: null,
    displayName,
    role: "member",
    status: "placeholder",
  };
}

test("renames members without changing their ids", () => {
  const result = applyTripMemberChanges(
    baseMembers,
    {
      updates: [
        { id: "friend-id", displayName: "새 이름" },
      ],
    },
    2,
    createMember
  );

  assert.equal(result.activeMembers[1].id, "friend-id");
  assert.equal(result.activeMembers[1].displayName, "새 이름");
});

test("only removes an unclaimed placeholder member", () => {
  const result = applyTripMemberChanges(
    baseMembers,
    { removeIds: ["friend-id"] },
    1,
    createMember
  );

  assert.equal(result.activeMembers.length, 1);
  assert.equal(result.members[1].status, "removed");
  assert.equal(result.members[1].id, "friend-id");
});

test("blocks removal of a linked member", () => {
  assert.throws(
    () =>
      applyTripMemberChanges(
        baseMembers,
        { removeIds: ["owner-id"] },
        1,
        createMember
      ),
    (error) =>
      error instanceof TripUpdateValidationError &&
      error.code === "TRIP_MEMBER_REMOVAL_BLOCKED"
  );
});

test("finds schedules outside a changed trip period", () => {
  const schedules = [
    { id: "before", date: "2026-10-01" },
    { id: "inside", date: "2026-10-05" },
    { id: "after", date: "2026-10-10" },
  ];

  assert.deepEqual(
    findSchedulesOutsideRange(
      schedules,
      "2026-10-03",
      "2026-10-08"
    ).map((schedule) => schedule.id),
    ["before", "after"]
  );
});

test("normalizes valid trip updates and rejects invalid ranges", () => {
  const currentTrip = {
    tripName: "기존 여행",
    country: "일본",
    city: "도쿄",
    startDate: "2026-10-01",
    endDate: "2026-10-10",
  };
  const normalized = normalizeTripUpdate(
    {
      tripName: " 수정된 여행 ",
      startDate: "2026-10-02",
      endDate: "2026-10-09",
      people: "2",
    },
    currentTrip,
    2
  );

  assert.equal(normalized.tripName, "수정된 여행");
  assert.equal(normalized.city, "도쿄");
  assert.equal(normalized.dateChanged, true);
  assert.throws(() =>
    normalizeTripUpdate(
      {
        startDate: "2026-10-11",
        endDate: "2026-10-09",
      },
      currentTrip,
      2
    )
  );
});

test("projects schedule date updates without changing schedule data", () => {
  const schedules = [
    {
      id: "schedule-id",
      title: "센소지",
      date: "2026-08-25",
      placeId: "place-id",
      latitude: 35.7148,
      longitude: 139.7967,
      memo: "기존 메모",
    },
  ];
  const result = normalizeScheduleDateUpdates(
    schedules,
    [
      {
        id: "schedule-id",
        previousDate: "2026-08-25",
        date: "2026-10-23",
      },
    ],
    "2026-10-22",
    "2026-10-23"
  );

  assert.equal(result.projectedSchedules[0].id, "schedule-id");
  assert.equal(result.projectedSchedules[0].date, "2026-10-23");
  assert.equal(result.projectedSchedules[0].placeId, "place-id");
  assert.equal(result.projectedSchedules[0].memo, "기존 메모");
});

test("rejects unresolved, stale, and unknown schedule date updates", () => {
  const schedules = [
    { id: "schedule-id", title: "센소지", date: "2026-08-25" },
  ];

  assert.throws(
    () =>
      normalizeScheduleDateUpdates(
        schedules,
        [],
        "2026-10-22",
        "2026-10-23"
      ),
    (error) => error.code === "TRIP_DATE_RANGE_CONFLICT"
  );
  assert.throws(
    () =>
      normalizeScheduleDateUpdates(
        schedules,
        [
          {
            id: "schedule-id",
            previousDate: "2026-08-24",
            date: "2026-10-22",
          },
        ],
        "2026-10-22",
        "2026-10-23"
      ),
    (error) => error.code === "TRIP_SCHEDULE_CHANGED"
  );
  assert.throws(() =>
    normalizeScheduleDateUpdates(
      schedules,
      [
        {
          id: "other-trip-schedule",
          previousDate: "2026-08-25",
          date: "2026-10-22",
        },
      ],
      "2026-10-22",
      "2026-10-23"
    )
  );
});

test("validates individual schedule dates against the trip range", () => {
  assert.equal(
    validateScheduleDateWithinTrip(
      "2026-10-22",
      "2026-10-22",
      "2026-10-23"
    ),
    "2026-10-22"
  );
  assert.throws(
    () =>
      validateScheduleDateWithinTrip(
        "2026-10-24",
        "2026-10-22",
        "2026-10-23"
      ),
    (error) => error.code === "SCHEDULE_DATE_OUTSIDE_TRIP"
  );
});
