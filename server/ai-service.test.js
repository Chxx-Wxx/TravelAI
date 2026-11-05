const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AiServiceError,
  buildResponsesRequest,
  buildTravelContext,
  requestAiResponse,
} = require("./ai-service");

const trip = {
  id: "secret-trip-id",
  tripName: "도쿄 여행",
  country: "일본",
  city: "도쿄",
  startDate: "2026-10-22",
  endDate: "2026-10-23",
  members: [{ id: "secret-member-id", name: "친구" }],
};

const schedules = [
  {
    id: "secret-schedule-id",
    tripId: "secret-trip-id",
    date: "2026-10-22",
    time: "10:00",
    title: "센소지",
    location: "아사쿠사",
    address: "secret-address",
    latitude: 35.7,
    longitude: 139.7,
    placeId: "secret-place-id",
    durationMinutes: 90,
    memo: "천천히 둘러보기",
  },
];

const config = {
  apiKey: "test-key",
  model: "gpt-6-luna",
  maxOutputTokens: 700,
  timeoutMs: 1000,
};

test("AI context excludes ids, coordinates, and member details", () => {
  const context = buildTravelContext({
    trip,
    schedules,
    budgetSummary: {
      budgetKrw: 1000000,
      totalSpentKrw: 200000,
      remainingBudgetKrw: 800000,
    },
    question: "내 여행 일정 정리해 줘",
  });
  const serialized = JSON.stringify(context);

  assert.equal(serialized.includes("secret-trip-id"), false);
  assert.equal(serialized.includes("secret-member-id"), false);
  assert.equal(serialized.includes("secret-schedule-id"), false);
  assert.equal(serialized.includes("secret-place-id"), false);
  assert.equal(serialized.includes("secret-address"), false);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(context.schedules[0].title, "센소지");
});

test("non-schedule questions receive a compact schedule overview", () => {
  const context = buildTravelContext({
    trip,
    schedules,
    budgetSummary: null,
    question: "예산은 얼마나 남았어?",
  });

  assert.equal(context.scheduleOverview.totalCount, 1);
  assert.equal("schedules" in context, false);
});

test("Responses request is read-only, bounded, and not stored", () => {
  const request = buildResponsesRequest({
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
    trip,
    schedules,
    budgetSummary: null,
    question: "일정 순서를 개선해 줘",
    history: [],
  });

  assert.equal(request.model, "gpt-6-luna");
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, 700);
  assert.match(request.instructions, /읽기 전용/);
  assert.match(request.instructions, /수정, 삭제를 실행했거나/);
  assert.equal("tools" in request, false);
});

test("Responses API output and usage are normalized", async () => {
  let capturedBody;
  const result = await requestAiResponse({
    config,
    trip,
    schedules,
    budgetSummary: null,
    question: "일정을 알려줘",
    history: [],
    fetchImpl: async (_url, options) => {
      capturedBody = JSON.parse(options.body);

      return new Response(
        JSON.stringify({
          model: "gpt-6-luna-2026-09-01",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "첫째 날에는 센소지 일정이 있습니다.",
                },
              ],
            },
          ],
          usage: {
            input_tokens: 120,
            output_tokens: 30,
            total_tokens: 150,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    },
  });

  assert.equal(capturedBody.store, false);
  assert.equal(result.answer, "첫째 날에는 센소지 일정이 있습니다.");
  assert.equal(result.usage.totalTokens, 150);
});

test("authentication and quota errors have stable app codes", async () => {
  await assert.rejects(
    requestAiResponse({
      config,
      trip,
      schedules,
      question: "질문",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { code: "invalid_api_key" } }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          }
        ),
    }),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "AI_AUTHENTICATION_ERROR"
  );

  await assert.rejects(
    requestAiResponse({
      config,
      trip,
      schedules,
      question: "질문",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: { code: "insufficient_quota" },
          }),
          {
            status: 429,
            headers: { "content-type": "application/json" },
          }
        ),
    }),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "AI_QUOTA_EXCEEDED"
  );
});

test("provider timeout aborts the upstream request", async () => {
  await assert.rejects(
    requestAiResponse({
      config: { ...config, timeoutMs: 5 },
      trip,
      schedules,
      question: "질문",
      fetchImpl: async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        }),
    }),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "AI_TIMEOUT"
  );
});
