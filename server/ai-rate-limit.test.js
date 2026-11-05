const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AiLimitError,
  createAiUsageGuard,
} = require("./ai-rate-limit");

const baseConfig = {
  globalRequestsPerMinute: 10,
  ipRequestsPerMinute: 2,
  globalDailyRequests: 10,
  ipDailyRequests: 10,
  globalConcurrentRequests: 2,
  ipConcurrentRequests: 1,
  dailyTokenBudget: 1000,
};

test("same IP cannot start duplicate concurrent AI requests", () => {
  const guard = createAiUsageGuard({ config: baseConfig });
  const lease = guard.begin({
    clientKey: "127.0.0.1",
    reservedTokens: 100,
  });

  assert.throws(
    () =>
      guard.begin({
        clientKey: "127.0.0.1",
        reservedTokens: 100,
      }),
    (error) =>
      error instanceof AiLimitError &&
      error.code === "AI_CONCURRENT_LIMIT"
  );

  lease.cancel();
  assert.equal(guard.getSnapshot().dailyTokens, 100);
  const nextLease = guard.begin({
    clientKey: "127.0.0.1",
    reservedTokens: 100,
  });
  nextLease.finish(80);
});

test("per-IP minute limit remains active after requests finish", () => {
  const guard = createAiUsageGuard({ config: baseConfig });

  guard.begin({ clientKey: "ip-a", reservedTokens: 10 }).finish(5);
  guard.begin({ clientKey: "ip-a", reservedTokens: 10 }).finish(5);

  assert.throws(
    () =>
      guard.begin({ clientKey: "ip-a", reservedTokens: 10 }),
    (error) => error.code === "AI_IP_RATE_LIMIT"
  );
});

test("daily token budget blocks unbounded provider usage", () => {
  const guard = createAiUsageGuard({
    config: {
      ...baseConfig,
      dailyTokenBudget: 150,
    },
  });

  guard.begin({ clientKey: "ip-a", reservedTokens: 100 }).finish(100);

  assert.throws(
    () =>
      guard.begin({ clientKey: "ip-b", reservedTokens: 60 }),
    (error) => error.code === "AI_DAILY_TOKEN_BUDGET"
  );
});
