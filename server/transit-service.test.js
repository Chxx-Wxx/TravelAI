const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NAVITIME_ROUTE_LIMIT,
  TransitProviderError,
  createNavitimeTransitSummary,
  normalizeNavitimeRoute,
  requestNavitimeTransitRoute,
  selectBestNavitimeItem,
} = require("./transit-service");

function createPoint(name, nodeId) {
  return {
    type: "point",
    name,
    ...(nodeId ? { node_id: nodeId } : {}),
  };
}

function createWalk(time, distance) {
  return {
    type: "move",
    move: "walk",
    time,
    distance,
    line_name: "徒歩",
  };
}

function createTrain({
  lineId,
  lineName,
  operatorId = "00000123",
  operatorName = "東武鉄道",
  from,
  to,
  destination = to,
  time = 2,
  distance = 1100,
}) {
  return {
    type: "move",
    move: "local_train",
    time,
    distance,
    line_name: `${lineName}（詳細）`,
    transport: {
      name: `${lineName}（詳細）`,
      company: {
        id: operatorId,
        name: operatorName,
      },
      links: [
        {
          id: lineId,
          name: lineName,
          from,
          to,
          destination,
          direction: "down",
        },
      ],
    },
  };
}

function createItem({
  time,
  distance,
  transitCount,
  sections,
  fare = 157,
}) {
  return {
    summary: {
      move: {
        time,
        distance,
        transit_count: transitCount,
        move_type: ["local_train", "walk"],
        reference_fare: {
          lowest_total_ticket: fare,
          lowest_total_ic: fare,
        },
      },
    },
    sections,
    shapes: {
      features: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [139.7966553, 35.7147651],
              [139.8107004, 35.7100627],
            ],
          },
        },
      ],
    },
  };
}

const asakusa = {
  id: "00005270",
  name: "浅草",
};
const tokyoSkytree = {
  id: "00001789",
  name: "とうきょうスカイツリー[業平橋]",
};
const isesaki = {
  id: "00000323",
  name: "伊勢崎",
};
const tobuSkytreeLine = {
  lineId: "00000798",
  lineName: "東武伊勢崎線〔スカイツリーライン〕",
  from: asakusa,
  to: tokyoSkytree,
  destination: isesaki,
};

test("single boarding is not counted as a transfer", () => {
  const item = createItem({
    time: 22,
    distance: 2224,
    transitCount: 1,
    sections: [
      createPoint("start"),
      createWalk(7, 509),
      createPoint(asakusa.name, asakusa.id),
      createTrain(tobuSkytreeLine),
      createPoint(tokyoSkytree.name, tokyoSkytree.id),
      createWalk(8, 615),
      createPoint("goal"),
    ],
  });

  const summary = createNavitimeTransitSummary(item);

  assert.equal(summary.transitLegCount, 1);
  assert.equal(summary.transferCount, 0);
  assert.equal(summary.walkDistanceMeters, 1124);
  assert.equal(summary.walkDurationSeconds, 15 * 60);
  assert.deepEqual(summary.lineNames, [
    tobuSkytreeLine.lineName,
  ]);
  assert.deepEqual(summary.transitLegs, [
    {
      vehicleType: "TRAIN",
      lineId: "00000798",
      lineName: tobuSkytreeLine.lineName,
      operatorId: "00000123",
      operatorName: "東武鉄道",
      fromStation: asakusa,
      toStation: tokyoSkytree,
      destination: isesaki,
    },
  ]);
});

test("a slightly faster transfer is ranked below a direct route", () => {
  const transferPoint = {
    id: "transfer",
    name: "乗換駅",
  };
  const indirect = createItem({
    time: 20,
    distance: 2300,
    transitCount: 1,
    fare: 0,
    sections: [
      createPoint(asakusa.name, asakusa.id),
      createTrain({
        ...tobuSkytreeLine,
        to: transferPoint,
        destination: transferPoint,
      }),
      createPoint(transferPoint.name, transferPoint.id),
      createTrain({
        lineId: "second-line",
        lineName: "乗換路線",
        from: transferPoint,
        to: tokyoSkytree,
        destination: tokyoSkytree,
      }),
      createPoint(tokyoSkytree.name, tokyoSkytree.id),
    ],
  });
  const direct = createItem({
    time: 22,
    distance: 2224,
    transitCount: 0,
    fare: 0,
    sections: [
      createPoint(asakusa.name, asakusa.id),
      createTrain(tobuSkytreeLine),
      createPoint(tokyoSkytree.name, tokyoSkytree.id),
    ],
  });

  const selection = selectBestNavitimeItem({
    items: [indirect, direct],
  });
  const route = normalizeNavitimeRoute({
    items: [indirect, direct],
  });

  assert.equal(selection.index, 1);
  assert.equal(selection.transitSummary.transferCount, 0);
  assert.equal(route.durationSeconds, 22 * 60);
  assert.equal(route.transitSummary.transitLegs[0].lineId, "00000798");
});

test("walk-only candidates remain unavailable as transit", () => {
  const walkOnly = createItem({
    time: 25,
    distance: 1769,
    transitCount: 0,
    sections: [
      createPoint("start"),
      createWalk(25, 1769),
      createPoint("goal"),
    ],
  });

  assert.throws(
    () => normalizeNavitimeRoute({ items: [walkOnly] }),
    (error) =>
      error instanceof TransitProviderError &&
      error.code === "TRANSIT_WALK_ONLY"
  );
});

test("NAVITIME requests multiple candidates without adding lang", async () => {
  const originalFetch = global.fetch;
  const direct = createItem({
    time: 22,
    distance: 2224,
    transitCount: 0,
    sections: [
      createPoint(asakusa.name, asakusa.id),
      createTrain(tobuSkytreeLine),
      createPoint(tokyoSkytree.name, tokyoSkytree.id),
    ],
  });
  let requestedUrl = null;

  global.fetch = async (url) => {
    requestedUrl = new URL(url);

    return {
      ok: true,
      status: 200,
      json: async () => ({ items: [direct] }),
    };
  };

  try {
    await requestNavitimeTransitRoute(
      {
        origin: {
          latitude: 35.7147651,
          longitude: 139.7966553,
        },
        destination: {
          latitude: 35.7100627,
          longitude: 139.8107004,
        },
        departureTime: "2026-10-22T09:25:00.000Z",
      },
      {
        apiKey: "test-key",
        host: "example.test",
      }
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(
    requestedUrl.searchParams.get("limit"),
    String(NAVITIME_ROUTE_LIMIT)
  );
  assert.equal(requestedUrl.searchParams.has("lang"), false);
});
