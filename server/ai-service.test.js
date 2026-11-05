const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AiServiceError,
  buildResponsesRequest,
  buildTravelContext,
  parseSituationRecommendation,
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

const situationRecommendation = {
  situationSummary:
    "16:20 시부야에서 일정이 지연됐고 19:00 예약은 유지해야 합니다.",
  recommendedOptionId: "option-b",
  recommendationReason:
    "휴식과 예약 시간을 함께 지킬 가능성이 가장 높습니다.",
  alternatives: [
    {
      id: "option-b",
      title: "짧은 방문 후 예약 장소로 이동",
      priority: 1,
      reason: "하라주쿠 희망을 일부 유지합니다.",
      keep: ["19:00 저녁 예약"],
      change: ["하라주쿠 체류 시간을 줄이기"],
      advantages: ["희망 장소를 방문할 수 있음"],
      disadvantages: ["이동 시간이 빠듯할 수 있음"],
      routeVerification: "not_checked",
    },
    {
      id: "option-a",
      title: "휴식 후 예약 장소로 바로 이동",
      priority: 2,
      reason: "동행자의 피로를 가장 적게 만듭니다.",
      keep: ["19:00 저녁 예약"],
      change: ["하라주쿠를 다른 날로 미루기"],
      advantages: ["충분히 쉴 수 있음"],
      disadvantages: ["하라주쿠를 오늘 방문하지 못함"],
      routeVerification: "not_checked",
    },
  ],
  unverifiedInformation: ["실제 이동 시간과 운행 상황"],
  followUpQuestions: ["저녁 식당 위치는 어디인가요?"],
};

test("AI context excludes ids and member details but keeps safe place coordinates", () => {
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
  assert.equal(context.schedules[0].title, "센소지");
  assert.deepEqual(context.schedules[0].coordinate, {
    latitude: 35.7,
    longitude: 139.7,
  });
  assert.equal(context.schedules[0].reservationStatus, "not_stored");
  assert.equal(context.schedules[0].completionStatus, "not_stored");
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
  assert.equal("text" in request, false);
});

test("situation context separates clock status without claiming completion", () => {
  const context = buildTravelContext({
    trip,
    schedules: [
      schedules[0],
      {
        ...schedules[0],
        id: "dinner-id",
        time: "19:00",
        title: "저녁 식사",
        location: "시부야",
        durationMinutes: 60,
      },
    ],
    budgetSummary: null,
    question: "일정이 꼬였어. 대안을 알려줘",
    responseType: "situation_alternatives",
    now: new Date("2026-10-22T07:20:00.000Z"),
  });

  assert.equal(context.timeContext.timeZone, "Asia/Tokyo");
  assert.equal(context.timeContext.localDate, "2026-10-22");
  assert.equal(context.timeContext.localTime, "16:20");
  assert.equal(context.timeContext.tripTiming, "active");
  assert.equal(context.schedules[0].timeRelation, "past_by_clock");
  assert.equal(context.schedules[1].timeRelation, "upcoming");
  assert.equal(context.dataLimitations.completionTrackingAvailable, false);
  assert.equal(context.dataLimitations.reservationFieldAvailable, false);
});

test("situation request uses strict Responses structured output", () => {
  const question =
    "지금 시부야이고 19시에 식당을 예약했어. 일정 대안을 추천해 줘.";
  const request = buildResponsesRequest({
    model: config.model,
    maxOutputTokens: config.maxOutputTokens,
    trip,
    schedules,
    budgetSummary: null,
    question,
    history: [],
    responseMode: "situation_alternatives",
    now: new Date("2026-10-22T07:20:00.000Z"),
  });
  const input = JSON.parse(request.input);

  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.equal(
    request.text.format.schema.additionalProperties,
    false
  );
  assert.equal(input.userQuestion, question);
  assert.equal(input.travelData.schedules.length, 1);
  assert.match(request.instructions, /예약이라고 추측하지 않는다/);
  assert.match(request.instructions, /routeVerification/);
  assert.match(request.instructions, /GPS 현재 위치는 이 요청에 포함되지 않는다/);
});

test("situation output is parsed only when 2-3 valid alternatives exist", () => {
  const parsed = parseSituationRecommendation(
    JSON.stringify(situationRecommendation)
  );

  assert.equal(parsed.alternatives.length, 2);
  assert.equal(parsed.alternatives[0].id, "option-b");
  assert.equal(parsed.recommendedOptionId, "option-b");

  assert.throws(
    () =>
      parseSituationRecommendation(
        JSON.stringify({
          ...situationRecommendation,
          alternatives: situationRecommendation.alternatives.slice(0, 1),
        })
      ),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "AI_INVALID_STRUCTURED_RESPONSE"
  );
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
  assert.equal(result.responseType, "general");
  assert.equal(result.usage.totalTokens, 150);
});

test("structured situation response is normalized without a second provider call", async () => {
  let providerCalls = 0;
  const result = await requestAiResponse({
    config,
    trip,
    schedules,
    budgetSummary: null,
    question:
      "지금 시부야이고 친구가 발이 아파. 19시 예약을 지킬 대안을 알려줘.",
    history: [],
    responseMode: "situation_alternatives",
    fetchImpl: async (_url, options) => {
      providerCalls += 1;
      const body = JSON.parse(options.body);
      assert.equal(body.text.format.type, "json_schema");

      return new Response(
        JSON.stringify({
          model: "gpt-6-luna-2026-09-01",
          output_text: JSON.stringify(situationRecommendation),
          usage: {
            input_tokens: 220,
            output_tokens: 180,
            total_tokens: 400,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(result.responseType, "situation_alternatives");
  assert.equal(result.recommendation.alternatives.length, 2);
  assert.match(result.answer, /가장 추천/);
});

test("malformed structured response fails safely", async () => {
  await assert.rejects(
    requestAiResponse({
      config,
      trip,
      schedules,
      question: "일정이 꼬였어. 대안을 알려줘.",
      responseMode: "situation_alternatives",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              situationSummary: "불완전한 응답",
              alternatives: [],
            }),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        ),
    }),
    (error) =>
      error instanceof AiServiceError &&
      error.code === "AI_INVALID_STRUCTURED_RESPONSE"
  );
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
