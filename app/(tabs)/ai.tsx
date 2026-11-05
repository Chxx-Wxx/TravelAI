import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useFocusEffect,
} from "expo-router";

import {
  getExpenseSettings,
  getExpenses,
  getTrip,
} from "../../lib/storage";

import {
  AiBudgetSummary,
  buildAiBudgetSummary,
} from "../../lib/ai-context";

import {
  AI_MAX_HISTORY_MESSAGES,
  AI_MAX_QUESTION_LENGTH,
  AiChatError,
  AiUsage,
  sendAiChat,
} from "../../services/ai";

import {
  fetchSchedules,
} from "../../services/schedule";

import {
  Schedule,
  Trip,
} from "../../types";

import { logStartup } from "../../lib/startup-diagnostics";

logStartup("ai.module-evaluated");

type ChatMessage = {
  id: string;

  role:
    | "user"
    | "assistant";

  text: string;

  isError?: boolean;
  usage?: AiUsage;
};

type FailedRequest = {
  question: string;
};

const EMPTY_BUDGET_SUMMARY: AiBudgetSummary = {
  budgetKrw: null,
  totalSpentKrw: 0,
  remainingBudgetKrw: null,
};

const quickQuestions = [
  "내 여행 일정 정리해 줘",
  "첫째 날 일정이 너무 빡빡하지 않아?",
  "예산은 얼마나 남았어?",
  "일정 순서를 개선할 방법이 있어?",
];

export default function AIScreen() {
  const nextMessageIdRef = useRef(0);
  const requestVersionRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);
  const sendingLockRef = useRef(false);
  const screenActiveRef = useRef(false);
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const [
    trip,
    setTrip,
  ] =
    useState<Trip | null>(
      null
    );

  const [
    schedules,
    setSchedules,
  ] =
    useState<Schedule[]>(
      []
    );

  const [
    input,
    setInput,
  ] =
    useState("");

  const [
    budgetSummary,
    setBudgetSummary,
  ] = useState<AiBudgetSummary>(EMPTY_BUDGET_SUMMARY);

  const [
    isSending,
    setIsSending,
  ] = useState(false);

  const [
    failedRequest,
    setFailedRequest,
  ] = useState<FailedRequest | null>(null);

  const [
    messages,
    setMessages,
  ] =
    useState<ChatMessage[]>(
      [
        {
          id: "welcome",

          role:
            "assistant",

          text:
            "여행 일정이나 장소에 대해 궁금한 걸 물어보세요.",
        },
      ]
    );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      screenActiveRef.current = true;
      logStartup("ai.focused");

      async function loadData() {
        logStartup("ai.data-load-started");

        try {
          const tripData = await getTrip();

          if (cancelled) {
            return;
          }

          setTrip(tripData);

          logStartup("ai.current-trip-resolved", {
            hasTrip: Boolean(tripData),
          });

          if (!tripData?.id) {
            setSchedules([]);
            setBudgetSummary(EMPTY_BUDGET_SUMMARY);
            logStartup("ai.data-load-completed", {
              hasTrip: false,
            });
            return;
          }

          const [scheduleData, expenses, settings] =
            await Promise.all([
              fetchSchedules(tripData.id),
              getExpenses(tripData.id),
              getExpenseSettings(tripData.id),
            ]);

          if (cancelled) {
            return;
          }

          setSchedules(scheduleData);
          setBudgetSummary(
            buildAiBudgetSummary(expenses, settings)
          );
          logStartup("ai.data-load-completed", {
            hasTrip: true,
            scheduleCount: scheduleData.length,
            expenseCount: expenses.length,
          });
        } catch (error) {
          if (!cancelled) {
            logStartup("ai.data-load-failed");
            console.error(
              "AI 화면 데이터 불러오기 실패:",
              error
            );
          }
        }
      }

      loadData();

      return () => {
        cancelled = true;
        logStartup("ai.blurred");
        screenActiveRef.current = false;
        requestVersionRef.current += 1;
        activeRequestRef.current?.abort();
        activeRequestRef.current = null;
        sendingLockRef.current = false;
        setIsSending(false);
      };
    }, [])
  );

  const sortedSchedules =
    useMemo(() => {
      return [
        ...schedules,
      ].sort(
        (
          a,
          b
        ) =>
          `${a.date} ${a.time}`.localeCompare(
            `${b.date} ${b.time}`
          )
      );
    }, [schedules]);

  const schedulePreview =
    sortedSchedules.slice(
      0,
      3
    );

  const submitQuestion = useCallback(
    async (
      question: string,
      options?: { appendUser?: boolean }
    ) => {
      const message = question.trim();

      if (!message || sendingLockRef.current) {
        return;
      }

      if (!trip?.id) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${++nextMessageIdRef.current}`,
            role: "assistant",
            text: "먼저 홈에서 여행을 생성해주세요.",
            isError: true,
          },
        ]);
        return;
      }

      if (message.length > AI_MAX_QUESTION_LENGTH) {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${++nextMessageIdRef.current}`,
            role: "assistant",
            text: `질문은 ${AI_MAX_QUESTION_LENGTH}자 이내로 입력해주세요.`,
            isError: true,
          },
        ]);
        return;
      }

      const appendUser = options?.appendUser !== false;
      const historyCandidates = messages
        .filter(
          (item) =>
            item.id !== "welcome" &&
            !item.isError
        )
        .map((item) => ({
          role: item.role,
          text: item.text,
        }));
      const lastHistoryMessage =
        historyCandidates[historyCandidates.length - 1];
      const history = (
        !appendUser &&
        lastHistoryMessage?.role === "user" &&
        lastHistoryMessage.text === message
          ? historyCandidates.slice(0, -1)
          : historyCandidates
      ).slice(-AI_MAX_HISTORY_MESSAGES);
      const messageId = ++nextMessageIdRef.current;
      const requestVersion = ++requestVersionRef.current;
      const controller = new AbortController();

      sendingLockRef.current = true;
      activeRequestRef.current = controller;
      setIsSending(true);
      setFailedRequest(null);
      setInput("");

      if (appendUser) {
        setMessages((current) => [
          ...current,
          {
            id: `user-${messageId}`,
            role: "user",
            text: message,
          },
        ]);
      }

      try {
        const result = await sendAiChat(
          {
            tripId: trip.id,
            question: message,
            history,
            budgetSummary,
          },
          controller.signal
        );

        if (
          !screenActiveRef.current ||
          requestVersionRef.current !== requestVersion
        ) {
          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: `assistant-${messageId}`,
            role: "assistant",
            text: result.answer,
            usage: result.usage,
          },
        ]);
      } catch (error) {
        if (
          !screenActiveRef.current ||
          requestVersionRef.current !== requestVersion
        ) {
          return;
        }

        const wasCancelled =
          error instanceof Error &&
          error.name === "AbortError";
        const errorMessage = wasCancelled
          ? "AI 요청을 취소했습니다."
          : error instanceof AiChatError
            ? error.retryAfterSeconds
              ? `${error.message} ${error.retryAfterSeconds}초 후 다시 시도해주세요.`
              : error.message
            : "AI 답변을 받지 못했습니다. 잠시 후 다시 시도해주세요.";

        setFailedRequest({ question: message });
        setMessages((current) => [
          ...current,
          {
            id: `assistant-error-${messageId}`,
            role: "assistant",
            text: errorMessage,
            isError: true,
          },
        ]);
      } finally {
        if (
          screenActiveRef.current &&
          requestVersionRef.current === requestVersion
        ) {
          sendingLockRef.current = false;
          activeRequestRef.current = null;
          setIsSending(false);
        }
      }
    },
    [budgetSummary, messages, trip]
  );

  function handleSend(text?: string) {
    void submitQuestion(text ?? input);
  }

  function handleCancel() {
    activeRequestRef.current?.abort();
  }

  return (
    <KeyboardAvoidingView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      behavior={
        Platform.OS ===
        "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        ref={scrollRef}
        style={{
          flex: 1,
        }}
        contentContainerStyle={{
          paddingTop: 70,
          paddingHorizontal: 20,
          paddingBottom: 170,
        }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({
            animated: true,
          })
        }
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight:
              "bold",
            color:
              "#111827",
          }}
        >
          🤖 AI 여행 도우미
        </Text>

        <Text
          style={{
            marginTop: 8,
            color:
              "#6B7280",
            fontSize: 15,
          }}
        >
          일정, 장소, 동선, 예산을 편하게 물어보세요.
        </Text>

        {/* 현재 여행 요약 */}

        <View
          style={{
            marginTop: 24,
            backgroundColor:
              "white",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight:
                "bold",
              color:
                "#111827",
            }}
          >
            현재 여행
          </Text>

          {!trip ? (
            <Text
              style={{
                marginTop: 10,
                color:
                  "#9CA3AF",
              }}
            >
              아직 생성된 여행이 없습니다.
            </Text>
          ) : (
            <>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 16,
                  fontWeight:
                    "bold",
                  color:
                    "#111827",
                }}
              >
                ✈️{" "}
                {
                  trip.tripName
                }
              </Text>

              <Text
                style={{
                  marginTop: 6,
                  color:
                    "#6B7280",
                }}
              >
                📍{" "}
                {
                  trip.country
                }{" "}
                ·{" "}
                {
                  trip.city
                }
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  color:
                    "#6B7280",
                }}
              >
                📅{" "}
                {
                  trip.startDate
                }{" "}
                ~{" "}
                {
                  trip.endDate
                }
              </Text>
            </>
          )}
        </View>

        {/* 일정 미리보기 */}

        <View
          style={{
            marginTop: 16,
            backgroundColor:
              "white",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontWeight:
                "bold",
              color:
                "#111827",
            }}
          >
            일정 요약
          </Text>

          {schedulePreview.length ===
          0 ? (
            <Text
              style={{
                marginTop: 10,
                color:
                  "#9CA3AF",
              }}
            >
              아직 저장된 일정이 없습니다.
            </Text>
          ) : (
            schedulePreview.map(
              (
                schedule,
                index
              ) => (
                <View
                  key={
                    schedule.id
                  }
                  style={{
                    marginTop: 12,
                    paddingBottom:
                      index ===
                      schedulePreview.length -
                        1
                        ? 0
                        : 12,

                    borderBottomWidth:
                      index ===
                      schedulePreview.length -
                        1
                        ? 0
                        : 1,

                    borderBottomColor:
                      "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color:
                        "#3B82F6",
                      fontWeight:
                        "bold",
                    }}
                  >
                    {
                      schedule.date
                    }{" "}
                    ·{" "}
                    {
                      schedule.time
                    }
                  </Text>

                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 15,
                      fontWeight:
                        "bold",
                      color:
                        "#111827",
                    }}
                  >
                    {
                      schedule.title
                    }
                  </Text>

                  <Text
                    style={{
                      marginTop: 3,
                      color:
                        "#6B7280",
                      fontSize: 13,
                    }}
                  >
                    📍{" "}
                    {
                      schedule.location
                    }
                  </Text>
                </View>
              )
            )
          )}
        </View>

        {/* 빠른 질문 */}

        <Text
          style={{
            marginTop: 26,
            fontSize: 18,
            fontWeight:
              "bold",
            color:
              "#111827",
          }}
        >
          빠른 질문
        </Text>

        <View
          style={{
            marginTop: 12,
            flexDirection:
              "row",
            flexWrap:
              "wrap",
            gap: 8,
          }}
        >
          {quickQuestions.map(
            (
              question
            ) => (
              <Pressable
                key={
                  question
                }
                disabled={isSending}
                onPress={() =>
                  handleSend(
                    question
                  )
                }
                style={{
                  backgroundColor:
                    isSending
                      ? "#F3F4F6"
                      : "#EFF6FF",

                  borderRadius: 18,

                  paddingHorizontal: 13,

                  paddingVertical: 9,
                }}
              >
                <Text
                  style={{
                    color:
                      isSending
                        ? "#9CA3AF"
                        : "#2563EB",
                    fontSize: 13,
                    fontWeight:
                      "bold",
                  }}
                >
                  {question}
                </Text>
              </Pressable>
            )
          )}
        </View>

        {/* 채팅 */}

        <Text
          style={{
            marginTop: 28,
            fontSize: 18,
            fontWeight:
              "bold",
            color:
              "#111827",
          }}
        >
          대화
        </Text>

        <View
          style={{
            marginTop: 12,
          }}
        >
          {messages.map(
            (
              message
            ) => {
              const isUser =
                message.role ===
                "user";

              return (
                <View
                  key={
                    message.id
                  }
                  style={{
                    alignItems:
                      isUser
                        ? "flex-end"
                        : "flex-start",

                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      maxWidth:
                        "85%",

                      backgroundColor:
                        isUser
                          ? "#3B82F6"
                          : message.isError
                            ? "#FEF2F2"
                            : "white",

                      borderWidth:
                        message.isError
                          ? 1
                          : 0,

                      borderColor:
                        message.isError
                          ? "#FECACA"
                          : "transparent",

                      borderRadius: 16,

                      paddingHorizontal: 14,

                      paddingVertical: 11,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          isUser
                            ? "white"
                            : message.isError
                              ? "#991B1B"
                              : "#374151",

                        lineHeight: 20,
                      }}
                    >
                      {
                        message.text
                      }
                    </Text>

                    {message.usage ? (
                      <Text
                        style={{
                          marginTop: 7,
                          color: "#9CA3AF",
                          fontSize: 11,
                        }}
                      >
                        {message.usage.model} · 입력 {message.usage.inputTokens.toLocaleString()} · 출력 {message.usage.outputTokens.toLocaleString()} 토큰
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }
          )}

          {isSending ? (
            <View
              style={{
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  maxWidth: "85%",
                  backgroundColor: "white",
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <ActivityIndicator
                  size="small"
                  color="#2563EB"
                />
                <Text style={{ color: "#4B5563" }}>
                  여행 정보를 확인하고 있어요.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleCancel}
                  hitSlop={8}
                >
                  <Text
                    style={{
                      color: "#DC2626",
                      fontWeight: "bold",
                    }}
                  >
                    취소
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {!isSending && failedRequest ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void submitQuestion(
                  failedRequest.question,
                  { appendUser: false }
                )
              }
              style={{
                alignSelf: "flex-start",
                borderWidth: 1,
                borderColor: "#BFDBFE",
                backgroundColor: "#EFF6FF",
                borderRadius: 14,
                paddingHorizontal: 13,
                paddingVertical: 9,
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: "#1D4ED8",
                  fontWeight: "bold",
                }}
              >
                다시 시도
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {/* 입력창 */}

      <View
        style={{
          position:
            "absolute",

          left: 0,
          right: 0,
          bottom: 0,

          backgroundColor:
            "#F5F7FB",

          paddingHorizontal: 16,
          paddingTop: 10,

          paddingBottom:
            Platform.OS ===
            "ios"
              ? 28
              : 14,

          borderTopWidth: 1,
          borderTopColor:
            "#E5E7EB",
        }}
      >
        <View
          style={{
            flexDirection:
              "row",
            gap: 8,
          }}
        >
          <TextInput
            value={input}
            onChangeText={
              setInput
            }
            placeholder="여행에 대해 물어보세요"
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isSending}
            maxLength={AI_MAX_QUESTION_LENGTH}
            style={{
              flex: 1,

              maxHeight: 100,

              backgroundColor:
                "white",

              borderRadius: 18,

              paddingHorizontal: 15,

              paddingVertical: 12,

              fontSize: 15,

              color:
                "#111827",
            }}
          />

          <Pressable
            disabled={
              isSending ||
              !input.trim()
            }
            onPress={() =>
              handleSend()
            }
            style={{
              alignSelf:
                "flex-end",

              backgroundColor:
                isSending ||
                !input.trim()
                  ? "#93C5FD"
                  : "#3B82F6",

              borderRadius: 18,

              paddingHorizontal: 17,

              paddingVertical: 12,
            }}
          >
            <Text
              style={{
                color:
                  "white",
                fontWeight:
                  "bold",
              }}
            >
              {isSending
                ? "전송 중"
                : "전송"}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
