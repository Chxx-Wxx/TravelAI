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

export type AiChatResponse = {
  answer: string;
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

export async function sendAiChat(
  input: {
    tripId: string;
    question: string;
    history: AiChatHistoryMessage[];
    budgetSummary: AiBudgetSummary;
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

  return {
    answer: data.answer.trim(),
    usage: data.usage,
  };
}
