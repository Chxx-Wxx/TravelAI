const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-6-luna";

const nativeFetch = global.fetch;
const { app } = require("./server");

async function request(baseUrl, path, options) {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const data = await response.json();

  return { response, data };
}

test("POST /ai/chat loads server travel data and returns AI usage", async (t) => {
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });

  t.after(
    () =>
      new Promise((resolve, reject) => {
        global.fetch = nativeFetch;
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const missingKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  const notConfigured = await request(baseUrl, "/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      tripId: "missing",
      question: "질문",
    }),
  });
  process.env.OPENAI_API_KEY = missingKey;

  assert.equal(notConfigured.response.status, 503);
  assert.equal(notConfigured.data.code, "AI_NOT_CONFIGURED");

  const missingTrip = await request(baseUrl, "/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      tripId: "missing",
      question: "질문",
    }),
  });

  assert.equal(missingTrip.response.status, 404);
  assert.equal(missingTrip.data.code, "AI_TRIP_NOT_FOUND");

  const createTrip = await request(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "AI 테스트 여행",
      country: "일본",
      city: "도쿄",
      startDate: "2026-10-22",
      endDate: "2026-10-23",
      people: "1",
      members: [{ name: "나" }],
    }),
  });
  const trip = createTrip.data.trip;

  await request(baseUrl, "/schedules", {
    method: "POST",
    body: JSON.stringify({
      tripId: trip.id,
      title: "센소지",
      location: "아사쿠사",
      date: "2026-10-22",
      time: "10:00",
      memo: "천천히 보기",
    }),
  });

  let providerBody;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.openai.com/")) {
      providerBody = JSON.parse(options.body);
      const outputText = providerBody.text
        ? JSON.stringify({
            situationSummary:
              "현재 일정이 지연됐고 저녁 예약은 유지해야 합니다.",
            recommendedOptionId: "rest-first",
            recommendationReason:
              "동행자의 피로와 예약 시간을 함께 고려했습니다.",
            alternatives: [
              {
                id: "rest-first",
                title: "휴식 후 예약 장소로 이동",
                priority: 1,
                reason: "피로를 줄이고 예약을 지킵니다.",
                keep: ["저녁 예약"],
                change: ["남은 관광 일정 미루기"],
                advantages: ["여유가 생김"],
                disadvantages: ["관광지를 덜 봄"],
                routeVerification: "not_checked",
              },
              {
                id: "short-visit",
                title: "짧게 방문 후 이동",
                priority: 2,
                reason: "원하는 장소를 짧게 봅니다.",
                keep: ["저녁 예약"],
                change: ["체류 시간 줄이기"],
                advantages: ["방문 희망을 일부 충족"],
                disadvantages: ["이동이 빠듯할 수 있음"],
                routeVerification: "not_checked",
              },
            ],
            unverifiedInformation: ["실제 이동 시간"],
            followUpQuestions: ["저녁 식당 위치는 어디인가요?"],
          })
        : "저장된 첫 일정은 센소지입니다.";
      return new Response(
        JSON.stringify({
          model: "gpt-6-luna",
          output_text: outputText,
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    return nativeFetch(url, options);
  };

  const result = await request(baseUrl, "/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      tripId: trip.id,
      question: "내 여행 일정 정리해 줘",
      history: [],
      budgetSummary: {
        budgetKrw: 500000,
        totalSpentKrw: 100000,
        remainingBudgetKrw: 400000,
      },
      userId: "must-not-be-trusted",
    }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.data.answer, "저장된 첫 일정은 센소지입니다.");
  assert.equal(result.data.responseType, "general");
  assert.equal(result.data.usage.totalTokens, 120);
  assert.equal(providerBody.store, false);
  assert.equal(providerBody.input.includes(trip.id), false);
  assert.equal(providerBody.input.includes("must-not-be-trusted"), false);

  const situationResult = await request(baseUrl, "/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      tripId: trip.id,
      question:
        "일정이 지연됐고 친구가 피곤해. 저녁 예약을 지킬 대안을 알려줘.",
      responseMode: "situation_alternatives",
    }),
  });

  assert.equal(situationResult.response.status, 200);
  assert.equal(
    situationResult.data.responseType,
    "situation_alternatives"
  );
  assert.equal(
    situationResult.data.recommendation.alternatives.length,
    2
  );
  assert.equal(providerBody.text.format.type, "json_schema");

  const schedulesAfterAi = await request(
    baseUrl,
    `/schedules?tripId=${trip.id}`
  );
  assert.equal(schedulesAfterAi.data.schedules.length, 1);
  assert.equal(schedulesAfterAi.data.schedules[0].title, "센소지");

  const tooLong = await request(baseUrl, "/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      tripId: trip.id,
      question: "가".repeat(1001),
    }),
  });

  assert.equal(tooLong.response.status, 400);
  assert.equal(tooLong.data.code, "AI_INVALID_QUESTION");
});
