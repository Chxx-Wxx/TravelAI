import type {
  AiBudgetSummary,
} from "../lib/ai-context";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const AI_MAX_QUESTION_LENGTH = 1000;
export const AI_MAX_HISTORY_MESSAGES = 6;

export type AiChatHistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiResponseType =
  | "general"
  | "situation_alternatives";

export type AiRouteVerification =
  | "not_checked"
  | "not_available";

export type AiSituationAlternative = {
  id: string;
  title: string;
  priority: number;
  reason: string;
  keep: string[];
  change: string[];
  advantages: string[];
  disadvantages: string[];
  routeVerification: AiRouteVerification;
};

export type AiSituationRecommendation = {
  situationSummary: string;
  recommendedOptionId: string;
  recommendationReason: string;
  alternatives: AiSituationAlternative[];
  unverifiedInformation: string[];
  followUpQuestions: string[];
};

export type AiChatResponse = {
  answer: string;
  responseType: AiResponseType;
  recommendation?: AiSituationRecommendation;
  usage: AiUsage;
};

type AiErrorResponse = {
  message?: string;
  code?: string;
  retryAfterSeconds?: number;
};

export class AiChatError extends Error {
  code?: string;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    details?: {
      code?: string;
      retryAfterSeconds?: number;
    }
  ) {
    super(message);
    this.name = "AiChatError";
    this.code = details?.code;
    this.retryAfterSeconds = details?.retryAfterSeconds;
  }
}

function requireApiUrl() {
  if (!API_URL) {
    throw new AiChatError(
      "서버 주소가 설정되지 않았습니다. EXPO_PUBLIC_API_URL을 확인해주세요.",
      { code: "API_URL_MISSING" }
    );
  }

  return API_URL.replace(/\/$/, "");
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isSituationRecommendation(
  value: unknown
): value is AiSituationRecommendation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const recommendation = value as AiSituationRecommendation;

  return (
    typeof recommendation.situationSummary === "string" &&
    typeof recommendation.recommendedOptionId === "string" &&
    typeof recommendation.recommendationReason === "string" &&
    Array.isArray(recommendation.alternatives) &&
    recommendation.alternatives.length >= 2 &&
    recommendation.alternatives.length <= 3 &&
    recommendation.alternatives.every(
      (alternative) =>
        alternative &&
        typeof alternative.id === "string" &&
        typeof alternative.title === "string" &&
        Number.isInteger(alternative.priority) &&
        typeof alternative.reason === "string" &&
        isStringArray(alternative.keep) &&
        isStringArray(alternative.change) &&
        isStringArray(alternative.advantages) &&
        isStringArray(alternative.disadvantages) &&
        (alternative.routeVerification === "not_checked" ||
          alternative.routeVerification === "not_available")
    ) &&
    recommendation.alternatives.some(
      (alternative) =>
        alternative.id === recommendation.recommendedOptionId
    ) &&
    isStringArray(recommendation.unverifiedInformation) &&
    isStringArray(recommendation.followUpQuestions)
  );
}

export async function sendAiChat(
  input: {
    tripId: string;
    question: string;
    history: AiChatHistoryMessage[];
    budgetSummary: AiBudgetSummary;
    responseMode?: AiResponseType;
  },
  signal?: AbortSignal
): Promise<AiChatResponse> {
  const apiUrl = requireApiUrl();

  let response: Response;

  try {
    response = await fetch(`${apiUrl}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tripId: input.tripId,
        question: input.question,
        history: input.history.slice(
          -AI_MAX_HISTORY_MESSAGES
        ),
        budgetSummary: input.budgetSummary,
        ...(input.responseMode === "situation_alternatives"
          ? { responseMode: input.responseMode }
          : {}),
      }),
      signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new AiChatError(
      "AI 서버에 연결하지 못했습니다. Express와 ngrok 연결을 확인해주세요.",
      { code: "NETWORK_ERROR" }
    );
  }

  const contentType =
    response.headers.get("content-type") ?? "";
  const data: AiErrorResponse &
    Partial<AiChatResponse> = contentType
    .toLowerCase()
    .includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new AiChatError(
      data.message ??
        `AI 응답을 받지 못했습니다. (HTTP ${response.status})`,
      {
        code: data.code,
        retryAfterSeconds: data.retryAfterSeconds,
      }
    );
  }

  if (
    typeof data.answer !== "string" ||
    !data.answer.trim() ||
    !data.usage
  ) {
    throw new AiChatError(
      "AI 서버가 올바른 응답을 반환하지 않았습니다.",
      { code: "INVALID_RESPONSE" }
    );
  }

  const responseType: AiResponseType =
    data.responseType === "situation_alternatives"
      ? "situation_alternatives"
      : "general";

  if (
    responseType === "situation_alternatives" &&
    !isSituationRecommendation(data.recommendation)
  ) {
    throw new AiChatError(
      "AI 서버가 올바른 일정 대안을 반환하지 않았습니다.",
      { code: "INVALID_RECOMMENDATION" }
    );
  }

  return {
    answer: data.answer.trim(),
    responseType,
    ...(responseType === "situation_alternatives"
      ? { recommendation: data.recommendation }
      : {}),
    usage: data.usage,
  };
}
