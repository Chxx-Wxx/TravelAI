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
      return new Response(
        JSON.stringify({
          model: "gpt-6-luna",
          output_text: "저장된 첫 일정은 센소지입니다.",
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
  assert.equal(result.data.usage.totalTokens, 120);
  assert.equal(providerBody.store, false);
  assert.equal(providerBody.input.includes(trip.id), false);
  assert.equal(providerBody.input.includes("must-not-be-trusted"), false);

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
