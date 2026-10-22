const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";

const { app } = require("./server");

async function request(baseUrl, path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const data = await response.json();

  return { response, data };
}

test("PUT /trips/:id preserves ids and blocks date conflicts", async (t) => {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });

  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const createResult = await request(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "기존 여행",
      country: "일본",
      city: "도쿄",
      startDate: "2026-10-01",
      endDate: "2026-10-10",
      people: "2",
      members: [{ name: "나" }, { name: "친구" }],
    }),
  });

  assert.equal(createResult.response.status, 201);
  const originalTrip = createResult.data.trip;
  const [owner, friend] = originalTrip.tripMembers;

  const scheduleResult = await request(baseUrl, "/schedules", {
    method: "POST",
    body: JSON.stringify({
      tripId: originalTrip.id,
      title: "기존 일정",
      location: "도쿄역",
      date: "2026-10-09",
      time: "10:00",
    }),
  });

  assert.equal(scheduleResult.response.status, 201);

  const conflictResult = await request(
    baseUrl,
    `/trips/${originalTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...originalTrip,
        endDate: "2026-10-08",
        memberChanges: {
          updates: [
            { id: owner.id, displayName: owner.displayName },
            { id: friend.id, displayName: friend.displayName },
          ],
          additions: [],
          removeIds: [],
        },
      }),
    }
  );

  assert.equal(conflictResult.response.status, 409);
  assert.equal(conflictResult.data.code, "TRIP_DATE_RANGE_CONFLICT");
  assert.equal(conflictResult.data.schedules[0].title, "기존 일정");

  const updateResult = await request(
    baseUrl,
    `/trips/${originalTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: "수정된 여행",
        country: "일본",
        city: "오사카",
        startDate: originalTrip.startDate,
        endDate: originalTrip.endDate,
        people: "1",
        memberChanges: {
          updates: [{ id: owner.id, displayName: "새 이름" }],
          additions: [],
          removeIds: [friend.id],
        },
      }),
    }
  );

  assert.equal(updateResult.response.status, 200);
  assert.equal(updateResult.data.trip.id, originalTrip.id);
  assert.equal(updateResult.data.trip.city, "오사카");
  assert.equal(updateResult.data.trip.people, "1");
  assert.equal(
    updateResult.data.trip.tripMembers.find(
      (member) => member.id === owner.id
    ).displayName,
    "새 이름"
  );
  assert.equal(
    updateResult.data.trip.tripMembers.find(
      (member) => member.id === friend.id
    ).status,
    "removed"
  );

  const schedulesResult = await request(
    baseUrl,
    `/schedules?tripId=${originalTrip.id}`
  );

  assert.equal(schedulesResult.response.status, 200);
  assert.equal(schedulesResult.data.schedules.length, 1);
  assert.equal(schedulesResult.data.schedules[0].id, scheduleResult.data.schedule.id);

  const movingTripResult = await request(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "날짜 이동 여행",
      country: "일본",
      city: "도쿄",
      startDate: "2026-08-24",
      endDate: "2026-08-25",
      people: "2",
      members: [{ name: "나" }, { name: "친구" }],
    }),
  });
  const movingTrip = movingTripResult.data.trip;
  const movingOwner = movingTrip.tripMembers[0];
  const movingFriend = movingTrip.tripMembers[1];
  const schedulePayloads = [
    {
      tripId: movingTrip.id,
      title: "센소지",
      location: "센소지",
      address: "도쿄도 다이토구",
      latitude: 35.7148,
      longitude: 139.7967,
      placeId: "sensoji-place-id",
      category: "관광",
      durationMinutes: 90,
      date: "2026-08-25",
      time: "10:00",
      memo: "기존 메모",
    },
    {
      tripId: movingTrip.id,
      title: "아사쿠사",
      location: "아사쿠사",
      date: "2026-08-25",
      time: "12:00",
    },
  ];
  const createdSchedules = [];

  for (const payload of schedulePayloads) {
    const created = await request(baseUrl, "/schedules", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    createdSchedules.push(created.data.schedule);
  }

  const shiftResult = await request(
    baseUrl,
    `/trips/${movingTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: movingTrip.tripName,
        country: movingTrip.country,
        city: movingTrip.city,
        startDate: "2026-10-22",
        endDate: "2026-10-23",
        people: "2",
        memberChanges: {
          updates: [
            { id: movingOwner.id, displayName: movingOwner.displayName },
            { id: movingFriend.id, displayName: movingFriend.displayName },
          ],
          additions: [],
          removeIds: [],
        },
        scheduleDateUpdates: createdSchedules.map((schedule) => ({
          id: schedule.id,
          previousDate: schedule.date,
          date: "2026-10-23",
        })),
      }),
    }
  );

  assert.equal(shiftResult.response.status, 200);
  assert.equal(shiftResult.data.trip.id, movingTrip.id);
  assert.equal(shiftResult.data.updatedSchedules.length, 2);

  const shiftedSchedulesResult = await request(
    baseUrl,
    `/schedules?tripId=${movingTrip.id}`
  );
  const shiftedSchedules = shiftedSchedulesResult.data.schedules;
  const shiftedSensoji = shiftedSchedules.find(
    (schedule) => schedule.id === createdSchedules[0].id
  );

  assert.equal(shiftedSensoji.date, "2026-10-23");
  assert.equal(shiftedSensoji.placeId, "sensoji-place-id");
  assert.equal(shiftedSensoji.address, "도쿄도 다이토구");
  assert.equal(shiftedSensoji.latitude, 35.7148);
  assert.equal(shiftedSensoji.memo, "기존 메모");

  const extensionResult = await request(
    baseUrl,
    `/trips/${movingTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: movingTrip.tripName,
        country: movingTrip.country,
        city: movingTrip.city,
        startDate: "2026-10-22",
        endDate: "2026-10-24",
        people: "2",
        memberChanges: {
          updates: [
            { id: movingOwner.id, displayName: movingOwner.displayName },
            { id: movingFriend.id, displayName: movingFriend.displayName },
          ],
          additions: [],
          removeIds: [],
        },
        scheduleDateUpdates: [],
      }),
    }
  );

  assert.equal(extensionResult.response.status, 200);
  assert.equal(extensionResult.data.trip.endDate, "2026-10-24");
  assert.equal(extensionResult.data.updatedSchedules.length, 0);

  const manualResult = await request(
    baseUrl,
    `/trips/${movingTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: movingTrip.tripName,
        country: movingTrip.country,
        city: movingTrip.city,
        startDate: "2026-10-22",
        endDate: "2026-10-22",
        people: "2",
        memberChanges: {
          updates: [
            { id: movingOwner.id, displayName: movingOwner.displayName },
            { id: movingFriend.id, displayName: movingFriend.displayName },
          ],
          additions: [],
          removeIds: [],
        },
        scheduleDateUpdates: shiftedSchedules.map((schedule) => ({
          id: schedule.id,
          previousDate: schedule.date,
          date: "2026-10-22",
        })),
      }),
    }
  );

  assert.equal(manualResult.response.status, 200);
  assert.equal(manualResult.data.updatedSchedules.length, 2);

  const outsideScheduleUpdate = await request(
    baseUrl,
    `/schedules/${createdSchedules[0].id}`,
    {
      method: "PUT",
      body: JSON.stringify({ date: "2026-10-23" }),
    }
  );

  assert.equal(outsideScheduleUpdate.response.status, 409);
  assert.equal(
    outsideScheduleUpdate.data.code,
    "SCHEDULE_DATE_OUTSIDE_TRIP"
  );

  const rollbackResult = await request(
    baseUrl,
    `/trips/${movingTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: "저장되면 안 되는 이름",
        country: movingTrip.country,
        city: movingTrip.city,
        startDate: "2026-10-22",
        endDate: "2026-10-23",
        people: "1",
        memberChanges: {
          updates: [],
          additions: [],
          removeIds: [movingOwner.id],
        },
        scheduleDateUpdates: manualResult.data.updatedSchedules.map(
          (schedule) => ({
            id: schedule.id,
            previousDate: schedule.date,
            date: "2026-10-23",
          })
        ),
      }),
    }
  );

  assert.equal(rollbackResult.response.status, 409);

  const tripAfterRollback = await request(
    baseUrl,
    `/trips/${movingTrip.id}`
  );
  const schedulesAfterRollback = await request(
    baseUrl,
    `/schedules?tripId=${movingTrip.id}`
  );

  assert.equal(tripAfterRollback.data.trip.tripName, movingTrip.tripName);
  assert.equal(tripAfterRollback.data.trip.endDate, "2026-10-22");
  assert.ok(
    schedulesAfterRollback.data.schedules.every(
      (schedule) => schedule.date === "2026-10-22"
    )
  );

  const emptyTripResult = await request(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "일정 없는 여행",
      country: "한국",
      city: "서울",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      people: "1",
      members: [{ name: "나" }],
    }),
  });
  const emptyTrip = emptyTripResult.data.trip;
  const emptyOwner = emptyTrip.tripMembers[0];
  const outsideScheduleCreate = await request(baseUrl, "/schedules", {
    method: "POST",
    body: JSON.stringify({
      tripId: emptyTrip.id,
      title: "범위 밖 일정",
      location: "서울",
      date: "2026-11-03",
      time: "10:00",
    }),
  });

  assert.equal(outsideScheduleCreate.response.status, 409);
  assert.equal(
    outsideScheduleCreate.data.code,
    "SCHEDULE_DATE_OUTSIDE_TRIP"
  );

  const emptyTripUpdate = await request(
    baseUrl,
    `/trips/${emptyTrip.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        tripName: emptyTrip.tripName,
        country: emptyTrip.country,
        city: emptyTrip.city,
        startDate: "2027-01-01",
        endDate: "2027-01-10",
        people: "1",
        memberChanges: {
          updates: [
            { id: emptyOwner.id, displayName: emptyOwner.displayName },
          ],
          additions: [],
          removeIds: [],
        },
        scheduleDateUpdates: [],
      }),
    }
  );

  assert.equal(emptyTripUpdate.response.status, 200);
  assert.equal(emptyTripUpdate.data.trip.id, emptyTrip.id);
  assert.equal(emptyTripUpdate.data.trip.startDate, "2027-01-01");
});
