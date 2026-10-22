const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateLocationSample,
  getLocationAnimationDuration,
  getShortestHeadingTarget,
  shouldAnimateLocationSample,
} = require("./live-location.ts");

const baseSample = {
  latitude: 35.71476,
  longitude: 139.79665,
  accuracy: 8,
  speed: 1.2,
  timestamp: 1_000_000,
};

test("heading target crosses north through the shortest rotation", () => {
  assert.equal(getShortestHeadingTarget(359, 1), 361);
  assert.equal(getShortestHeadingTarget(1, 359), -1);
  assert.equal(getShortestHeadingTarget(725, 10), 730);
});

test("location samples reject stale and inaccurate readings", () => {
  assert.deepEqual(
    evaluateLocationSample(baseSample, null, baseSample.timestamp + 20_000),
    { accepted: false, reason: "stale" }
  );
  assert.deepEqual(
    evaluateLocationSample(
      { ...baseSample, accuracy: 500 },
      null,
      baseSample.timestamp
    ),
    { accepted: false, reason: "inaccurate" }
  );
});

test("location samples reject a short-interval gross GPS jump", () => {
  const jumped = {
    ...baseSample,
    latitude: baseSample.latitude + 0.01,
    timestamp: baseSample.timestamp + 1_000,
  };

  assert.deepEqual(
    evaluateLocationSample(jumped, baseSample, jumped.timestamp),
    { accepted: false, reason: "implausible-jump" }
  );
});

test("reported speed keeps a plausible fast movement sample", () => {
  const moving = {
    ...baseSample,
    latitude: baseSample.latitude + 0.0013,
    speed: 50,
    timestamp: baseSample.timestamp + 1_000,
  };

  assert.equal(
    evaluateLocationSample(moving, baseSample, moving.timestamp).accepted,
    true
  );
});

test("out-of-order location samples cannot move the marker backwards", () => {
  assert.deepEqual(
    evaluateLocationSample(
      { ...baseSample, timestamp: baseSample.timestamp - 1 },
      baseSample,
      baseSample.timestamp
    ),
    { accepted: false, reason: "out-of-order" }
  );
});

test("nearby accurate walking samples remain animatable", () => {
  const next = {
    ...baseSample,
    latitude: baseSample.latitude + 0.000015,
    timestamp: baseSample.timestamp + 1_000,
  };

  assert.equal(
    evaluateLocationSample(next, baseSample, next.timestamp).accepted,
    true
  );
  assert.equal(shouldAnimateLocationSample(baseSample, next), true);
  assert.equal(
    shouldAnimateLocationSample(
      baseSample,
      { ...next, accuracy: 90 }
    ),
    false
  );
});

test("location animation duration follows cadence within short bounds", () => {
  assert.equal(getLocationAnimationDuration(0, 100), 240);
  assert.equal(getLocationAnimationDuration(0, 1_000), 750);
  assert.equal(getLocationAnimationDuration(0, 5_000), 850);
});
