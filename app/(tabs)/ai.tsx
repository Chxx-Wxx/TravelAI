import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  useFocusEffect,
} from "expo-router";

import {
  getTrip,
} from "../../lib/storage";

import {
  fetchSchedules,
} from "../../services/schedule";

import {
  Schedule,
  Trip,
} from "../../types";

type ChatMessage = {
  id: string;

  role:
    | "user"
    | "assistant";

  text: string;
};

const quickQuestions = [
  "오늘 동선 어때?",
  "근처 맛집 추천해줘",
  "비 오면 일정 바꿔줘",
  "예산에 맞게 추천해줘",
];

export default function AIScreen() {
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

  const loadData =
    useCallback(
      async () => {
        try {
          const tripData =
            await getTrip();

          setTrip(
            tripData
          );

          if (
            !tripData?.id
          ) {
            setSchedules(
              []
            );

            return;
          }

          const scheduleData =
            await fetchSchedules(
              tripData.id
            );

          setSchedules(
            scheduleData
          );
        } catch (error) {
          console.error(
            "AI 화면 데이터 불러오기 실패:",
            error
          );
        }
      },
      []
    );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
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

  function makeTemporaryResponse(
    question: string
  ) {
    if (
      question.includes(
        "동선"
      )
    ) {
      return "현재 저장된 일정과 장소 좌표를 기준으로 동선을 분석하는 기능을 연결할 예정입니다.";
    }

    if (
      question.includes(
        "맛집"
      )
    ) {
      return "현재 일정 장소 주변의 식당을 Google Places에서 찾아 추천하도록 연결할 예정입니다.";
    }

    if (
      question.includes(
        "비"
      )
    ) {
      return "날씨 API를 연결하면 비가 오는 시간대를 확인해서 실내 일정 위주로 대체안을 추천할 수 있습니다.";
    }

    if (
      question.includes(
        "예산"
      )
    ) {
      return "현재 예산과 지출 내역을 함께 분석해서 남은 예산에 맞는 장소와 식당을 추천하도록 만들 예정입니다.";
    }

    return "아직 실제 AI API는 연결 전입니다. 나중에 현재 여행, 일정, 장소, 예산, 날씨 정보를 함께 전달해서 답변하도록 만들 예정입니다.";
  }

  function handleSend(
    text?: string
  ) {
    const message =
      (
        text ??
        input
      ).trim();

    if (!message) {
      return;
    }

    const userMessage:
      ChatMessage = {
        id:
          `user-${Date.now()}`,

        role:
          "user",

        text:
          message,
      };

    const assistantMessage:
      ChatMessage = {
        id:
          `assistant-${Date.now()}`,

        role:
          "assistant",

        text:
          makeTemporaryResponse(
            message
          ),
      };

    setMessages(
      (
        current
      ) => [
        ...current,
        userMessage,
        assistantMessage,
      ]
    );

    setInput("");
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
        style={{
          flex: 1,
        }}
        contentContainerStyle={{
          paddingTop: 70,
          paddingHorizontal: 20,
          paddingBottom: 170,
        }}
        keyboardShouldPersistTaps="handled"
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
                onPress={() =>
                  handleSend(
                    question
                  )
                }
                style={{
                  backgroundColor:
                    "#EFF6FF",

                  borderRadius: 18,

                  paddingHorizontal: 13,

                  paddingVertical: 9,
                }}
              >
                <Text
                  style={{
                    color:
                      "#2563EB",
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
                          : "white",

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
                            : "#374151",

                        lineHeight: 20,
                      }}
                    >
                      {
                        message.text
                      }
                    </Text>
                  </View>
                </View>
              );
            }
          )}
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
            onPress={() =>
              handleSend()
            }
            style={{
              alignSelf:
                "flex-end",

              backgroundColor:
                "#3B82F6",

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
              전송
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}