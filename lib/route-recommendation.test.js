const test = require("node:test");
const assert = require("node:assert/strict");

const recommendationModule = import(
  "./route-recommendation.ts"
);

function createRoute(
  travelMode,
  durationMinutes,
  transitSummary
) {
  return {
    distanceMeters: 1000,
    durationSeconds: durationMinutes * 60,
    coordinates: [
      { latitude: 35.7, longitude: 139.7 },
      { latitude: 35.71, longitude: 139.71 },
    ],
    travelMode,
    ...(transitSummary ? { transitSummary } : {}),
  };
}

test("Sensoji to Skytree burden score recommends walking", async () => {
  const { recommendRouteMode } =
    await recommendationModule;
  const walk = createRoute("WALK", 25);
  const transit = createRoute("TRANSIT", 22, {
    vehicleTypes: ["TRAIN"],
    transitLegCount: 1,
    transferCount: 0,
    walkDistanceMeters: 1124,
    fare: {
      ic: 157,
      currency: "JPY",
    },
  });

  const result = recommendRouteMode(walk, transit);

  assert.equal(result.recommendedMode, "WALK");
  assert.equal(result.savedMinutes, 3);
  assert.ok(result.transitScore > result.walkScore);
});

test("transit needs a meaningful score advantage", async () => {
  const { recommendRouteMode } =
    await recommendationModule;
  const walk = createRoute("WALK", 25);
  const borderlineTransit = createRoute("TRANSIT", 19, {
    vehicleTypes: ["TRAIN"],
    transitLegCount: 1,
    transferCount: 0,
    walkDistanceMeters: 0,
  });
  const clearlyBetterTransit = createRoute("TRANSIT", 16, {
    vehicleTypes: ["TRAIN"],
    transitLegCount: 1,
    transferCount: 0,
    walkDistanceMeters: 0,
  });

  assert.equal(
    recommendRouteMode(walk, borderlineTransit)
      .recommendedMode,
    "WALK"
  );
  assert.equal(
    recommendRouteMode(walk, clearlyBetterTransit)
      .recommendedMode,
    "TRANSIT"
  );
});

test("a transfer remains a meaningful travel burden", async () => {
  const { recommendRouteMode } =
    await recommendationModule;
  const walk = createRoute("WALK", 25);
  const transferTransit = createRoute("TRANSIT", 15, {
    vehicleTypes: ["TRAIN"],
    transitLegCount: 2,
    transferCount: 1,
    walkDistanceMeters: 0,
  });

  assert.equal(
    recommendRouteMode(walk, transferTransit).recommendedMode,
    "WALK"
  );
});
