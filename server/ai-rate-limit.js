class AiLimitError extends Error {
  constructor(message, code, retryAfterSeconds) {
    super(message);
    this.name = "AiLimitError";
    this.code = code;
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readLimit(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function createAiLimitConfig() {
  return {
    globalRequestsPerMinute: readLimit(
      "AI_GLOBAL_RPM",
      20,
      1,
      1000
    ),
    ipRequestsPerMinute: readLimit(
      "AI_IP_RPM",
      5,
      1,
      100
    ),
    globalDailyRequests: readLimit(
      "AI_GLOBAL_DAILY_REQUEST_LIMIT",
      100,
      1,
      100000
    ),
    ipDailyRequests: readLimit(
      "AI_IP_DAILY_REQUEST_LIMIT",
      30,
      1,
      10000
    ),
    globalConcurrentRequests: readLimit(
      "AI_MAX_CONCURRENT",
      2,
      1,
      20
    ),
    ipConcurrentRequests: readLimit(
      "AI_IP_MAX_CONCURRENT",
      1,
      1,
      10
    ),
    dailyTokenBudget: readLimit(
      "AI_DAILY_TOKEN_BUDGET",
      200000,
      1000,
      100000000
    ),
  };
}

function minuteKey(now) {
  return Math.floor(now / 60000);
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function secondsUntilNextMinute(now) {
  return Math.max(1, Math.ceil((60000 - (now % 60000)) / 1000));
}

function secondsUntilNextUtcDay(now) {
  const date = new Date(now);
  const next = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1
  );

  return Math.max(1, Math.ceil((next - now) / 1000));
}

function createAiUsageGuard(options = {}) {
  const config = options.config ?? createAiLimitConfig();
  const now = options.now ?? (() => Date.now());
  const state = {
    minute: null,
    day: null,
    globalMinuteRequests: 0,
    globalDailyRequests: 0,
    dailyTokens: 0,
    globalConcurrent: 0,
    ip: new Map(),
  };

  function resetWindows(timestamp) {
    const currentMinute = minuteKey(timestamp);
    const currentDay = dayKey(timestamp);

    if (state.minute !== currentMinute) {
      state.minute = currentMinute;
      state.globalMinuteRequests = 0;

      for (const value of state.ip.values()) {
        value.minuteRequests = 0;
      }
    }

    if (state.day !== currentDay) {
      state.day = currentDay;
      state.globalDailyRequests = 0;
      state.dailyTokens = 0;

      for (const [key, value] of state.ip.entries()) {
        if (value.concurrent === 0) {
          state.ip.delete(key);
        } else {
          value.dailyRequests = 0;
        }
      }
    }
  }

  function getIpState(clientKey) {
    let value = state.ip.get(clientKey);

    if (!value) {
      value = {
        minuteRequests: 0,
        dailyRequests: 0,
        concurrent: 0,
      };
      state.ip.set(clientKey, value);
    }

    return value;
  }

  function begin({ clientKey, reservedTokens }) {
    const timestamp = now();
    resetWindows(timestamp);
    const ipState = getIpState(clientKey || "unknown");
    const minuteRetry = secondsUntilNextMinute(timestamp);
    const dayRetry = secondsUntilNextUtcDay(timestamp);

    if (
      state.globalMinuteRequests >=
      config.globalRequestsPerMinute
    ) {
      throw new AiLimitError(
        "AI 요청이 잠시 많습니다. 잠시 후 다시 시도해주세요.",
        "AI_GLOBAL_RATE_LIMIT",
        minuteRetry
      );
    }

    if (
      ipState.minuteRequests >=
      config.ipRequestsPerMinute
    ) {
      throw new AiLimitError(
        "이 기기의 AI 요청이 잠시 많습니다. 잠시 후 다시 시도해주세요.",
        "AI_IP_RATE_LIMIT",
        minuteRetry
      );
    }

    if (
      state.globalDailyRequests >=
        config.globalDailyRequests ||
      ipState.dailyRequests >= config.ipDailyRequests
    ) {
      throw new AiLimitError(
        "오늘 사용할 수 있는 AI 요청 한도에 도달했습니다.",
        "AI_DAILY_REQUEST_LIMIT",
        dayRetry
      );
    }

    if (
      state.globalConcurrent >=
        config.globalConcurrentRequests ||
      ipState.concurrent >= config.ipConcurrentRequests
    ) {
      throw new AiLimitError(
        "이전 AI 요청이 처리 중입니다. 완료 후 다시 시도해주세요.",
        "AI_CONCURRENT_LIMIT",
        2
      );
    }

    const reservation = Math.max(
      1,
      Math.round(Number(reservedTokens) || 1)
    );

    if (
      state.dailyTokens + reservation >
      config.dailyTokenBudget
    ) {
      throw new AiLimitError(
        "오늘의 AI 사용량 예산에 도달했습니다.",
        "AI_DAILY_TOKEN_BUDGET",
        dayRetry
      );
    }

    state.globalMinuteRequests += 1;
    state.globalDailyRequests += 1;
    state.globalConcurrent += 1;
    state.dailyTokens += reservation;
    ipState.minuteRequests += 1;
    ipState.dailyRequests += 1;
    ipState.concurrent += 1;

    let settled = false;

    function release(actualTokens) {
      if (settled) {
        return;
      }

      settled = true;
      state.globalConcurrent = Math.max(
        0,
        state.globalConcurrent - 1
      );
      ipState.concurrent = Math.max(
        0,
        ipState.concurrent - 1
      );
      state.dailyTokens = Math.max(
        0,
        state.dailyTokens - reservation + actualTokens
      );
    }

    return {
      finish(actualTokens) {
        release(
          Math.max(0, Math.round(Number(actualTokens) || 0))
        );
      },
      cancel() {
        // Upstream가 이미 요청을 처리했을 수 있으므로 실패/취소도
        // 예상 토큰을 보수적으로 일일 예산에 남긴다.
        release(reservation);
      },
    };
  }

  return {
    begin,
    config,
    getSnapshot() {
      return {
        globalDailyRequests: state.globalDailyRequests,
        dailyTokens: state.dailyTokens,
        globalConcurrent: state.globalConcurrent,
      };
    },
  };
}

module.exports = {
  AiLimitError,
  createAiLimitConfig,
  createAiUsageGuard,
};
