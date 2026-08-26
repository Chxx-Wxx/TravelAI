import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  useCallback,
  useState,
} from "react";

import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  deleteTrip,
  getExpenses,
  getExpenseSettings,
  getTrip,
  saveSchedules,
} from "../../lib/storage";

import {
  fetchSchedules,
} from "../../services/schedule";

import {
  deleteServerTrip,
} from "../../services/trip";

import {
  fetchWeather,
  WeatherData,
} from "../../services/weather";

import {
  Expense,
  ExpenseSettings,
  Schedule,
  Trip,
} from "../../types";

export default function HomeScreen() {
  const [
    trip,
    setTrip,
  ] =
    useState<Trip | null>(
      null
    );

  const [
    todaySchedules,
    setTodaySchedules,
  ] =
    useState<Schedule[]>(
      []
    );

  const [
    expenses,
    setExpenses,
  ] =
    useState<Expense[]>(
      []
    );

  const [
    expenseSettings,
    setExpenseSettings,
  ] =
    useState<
      ExpenseSettings | null
    >(null);

  const [
    weather,
    setWeather,
  ] =
    useState<
      WeatherData | null
    >(null);

  const [
    weatherLoading,
    setWeatherLoading,
  ] =
    useState(false);

  function getTodayString() {
    const today =
      new Date();

    const year =
      today.getFullYear();

    const month =
      String(
        today.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        today.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

  function formatWon(
    value: number
  ) {
    return `${Math.round(
      value
    ).toLocaleString()}원`;
  }

  const loadData =
    useCallback(
      async () => {
        try {
          const [
            tripData,
            expenseData,
            settingsData,
          ] =
            await Promise.all([
              getTrip(),
              getExpenses(),
              getExpenseSettings(),
            ]);

          setTrip(
            tripData
          );

          setExpenses(
            expenseData
          );

          setExpenseSettings(
            settingsData
          );

          // 여행이 없으면
          // 일정과 날씨도 초기화
          if (!tripData) {
            setTodaySchedules(
              []
            );

            setWeather(
              null
            );

            return;
          }

          // 날씨 불러오기
          if (
            tripData.city
          ) {
            setWeatherLoading(
              true
            );

            try {
              const weatherData =
                await fetchWeather(
                  tripData.city,
                  tripData.country
                );

              setWeather(
                weatherData
              );
            } catch (
              error
            ) {
              console.error(
                "날씨 불러오기 실패:",
                error
              );

              setWeather(
                null
              );
            } finally {
              setWeatherLoading(
                false
              );
            }
          }

          // 서버 여행 ID가 없으면
          // 일정은 불러오지 않음
          if (
            !tripData.id
          ) {
            setTodaySchedules(
              []
            );

            return;
          }

          const schedules =
            await fetchSchedules(
              tripData.id
            );

          const today =
            getTodayString();

          const filtered =
            schedules
              .filter(
                (
                  schedule:
                    Schedule
                ) =>
                  schedule.date ===
                  today
              )
              .sort(
                (
                  a:
                    Schedule,
                  b:
                    Schedule
                ) =>
                  a.time.localeCompare(
                    b.time
                  )
              );

          setTodaySchedules(
            filtered
          );
        } catch (error) {
          console.error(
            "홈 데이터 불러오기 실패:",
            error
          );

          setTodaySchedules(
            []
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

  function handleDeleteTrip() {
    if (!trip) {
      return;
    }

    if (!trip.id) {
      Alert.alert(
        "삭제 실패",
        "서버 여행 ID가 없어 여행을 삭제할 수 없습니다. 여행 정보를 다시 확인해주세요."
      );

      return;
    }

    const tripId =
      trip.id;

    Alert.alert(
      "여행 삭제",
      `"${trip.tripName}"을 삭제할까요?\n저장된 일정도 함께 삭제됩니다.`,
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "삭제",
          style:
            "destructive",

          onPress:
            async () => {
              try {
                // 서버에서 여행과 소속 일정을 먼저 삭제한다.
                await deleteServerTrip(
                  tripId
                );

                // 서버 삭제 성공 후 기존 로컬 데이터도 정리한다.
                await deleteTrip();

                await saveSchedules(
                  []
                );

                setTrip(
                  null
                );

                setTodaySchedules(
                  []
                );

                setWeather(
                  null
                );

                Alert.alert(
                  "완료",
                  "여행과 저장된 일정이 삭제되었습니다."
                );
              } catch (error) {
                console.error(
                  "여행 삭제 실패:",
                  error
                );

                Alert.alert(
                  "삭제 실패",
                  error instanceof Error
                    ? error.message
                    : "여행을 삭제하지 못했습니다. 서버와 네트워크 연결을 확인해주세요."
                );
              }
            },
        },
      ]
    );
  }

  const previewSchedules =
    todaySchedules.slice(
      0,
      3
    );

  const totalSpent =
    expenses.reduce(
      (
        sum,
        expense
      ) =>
        sum +
        (
          expense.krwAmount ??
          0
        ),
      0
    );

  const budget =
    expenseSettings
      ?.budgetKrw ??
    0;

  const remainingBudget =
    Math.max(
      budget -
        totalSpent,
      0
    );

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      contentContainerStyle={{
        paddingTop: 70,
        paddingHorizontal: 20,
        paddingBottom: 120,
      }}
    >
      {/* 상단 */}

      <View
        style={{
          flexDirection:
            "row",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",
        }}
      >
        <View
          style={{
            flex: 1,
            paddingRight: 12,
          }}
        >
          <Text
            style={{
              fontSize: 34,
              fontWeight:
                "bold",
              color:
                "#111827",
            }}
          >
            🗼 TravelAI
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 18,
              color:
                "#6B7280",
            }}
          >
            나만의 스마트 여행 플래너
          </Text>
        </View>

        {/* 준비물 */}

        <Pressable
          onPress={() =>
            router.push(
              "/packing"
            )
          }
          style={{
            marginTop: 2,

            backgroundColor:
              "white",

            borderRadius: 14,

            paddingHorizontal: 13,

            paddingVertical: 10,

            alignItems:
              "center",

            justifyContent:
              "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
            }}
          >
            🎒
          </Text>

          <Text
            style={{
              marginTop: 2,
              fontSize: 11,

              fontWeight:
                "bold",

              color:
                "#6B7280",
            }}
          >
            준비물
          </Text>
        </Pressable>
      </View>

      {/* 여행 정보 */}

      {!trip ? (
        <Pressable
          onPress={() =>
            router.push(
              "/trip/create"
            )
          }
          style={{
            marginTop: 25,

            backgroundColor:
              "#3B82F6",

            borderRadius: 14,

            paddingVertical: 15,

            alignItems:
              "center",
          }}
        >
          <Text
            style={{
              color: "white",

              fontSize: 18,

              fontWeight:
                "bold",
            }}
          >
            + 새로운 여행 만들기
          </Text>
        </Pressable>
      ) : (
        <View
          style={{
            marginTop: 25,

            backgroundColor:
              "white",

            borderRadius: 18,

            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 24,

              fontWeight:
                "bold",

              color:
                "#111827",
            }}
          >
            ✈️ {trip.tripName}
          </Text>

          <Text
            style={{
              marginTop: 12,

              fontSize: 16,

              color:
                "#4B5563",
            }}
          >
            📍 {trip.country} ·{" "}
            {trip.city}
          </Text>

          <Text
            style={{
              marginTop: 8,

              fontSize: 16,

              color:
                "#4B5563",
            }}
          >
            📅 {trip.startDate} ~{" "}
            {trip.endDate}
          </Text>

          <Text
            style={{
              marginTop: 8,

              fontSize: 16,

              color:
                "#4B5563",
            }}
          >
            👥 {trip.people}명
          </Text>

          <Pressable
            onPress={
              handleDeleteTrip
            }
            style={{
              marginTop: 20,

              backgroundColor:
                "#FEECEC",

              borderRadius: 12,

              paddingVertical: 13,

              alignItems:
                "center",
            }}
          >
            <Text
              style={{
                color:
                  "#DC2626",

                fontSize: 16,

                fontWeight:
                  "bold",
              }}
            >
              여행 삭제
            </Text>
          </Pressable>
        </View>
      )}

      {/* 실제 날씨 */}

      {trip && (
        <View
          style={{
            marginTop: 20,

            backgroundColor:
              "white",

            borderRadius: 16,

            padding: 20,
          }}
        >
          <View
            style={{
              flexDirection:
                "row",

              justifyContent:
                "space-between",

              alignItems:
                "center",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 20,

                  fontWeight:
                    "bold",

                  color:
                    "#111827",
                }}
              >
                🌤 {trip.city} 날씨
              </Text>

              <Text
                style={{
                  marginTop: 7,

                  fontSize: 13,

                  color:
                    "#9CA3AF",
                }}
              >
                오늘의 여행 날씨
              </Text>
            </View>

            <Text
              style={{
                fontSize: 38,
              }}
            >
              {weather?.icon ??
                "🌤️"}
            </Text>
          </View>

          <View
            style={{
              marginTop: 18,

              flexDirection:
                "row",

              alignItems:
                "flex-end",
            }}
          >
            <Text
              style={{
                fontSize: 36,

                fontWeight:
                  "bold",

                color:
                  "#111827",
              }}
            >
              {weather
                ? Math.round(
                    weather.temperature
                  )
                : "--"}
            </Text>

            <Text
              style={{
                marginLeft: 4,

                marginBottom: 4,

                fontSize: 18,

                color:
                  "#6B7280",
              }}
            >
              °C
            </Text>
          </View>

          <Text
            style={{
              marginTop: 8,

              fontSize: 15,

              color:
                "#6B7280",
            }}
          >
            {weatherLoading
              ? "날씨 정보를 불러오는 중입니다."
              : weather
                ? weather.description
                : "날씨 정보를 불러오지 못했습니다."}
          </Text>

          <View
            style={{
              marginTop: 18,

              paddingTop: 16,

              borderTopWidth: 1,

              borderTopColor:
                "#F3F4F6",

              flexDirection:
                "row",

              justifyContent:
                "space-between",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 12,

                  color:
                    "#9CA3AF",
                }}
              >
                최고
              </Text>

              <Text
                style={{
                  marginTop: 4,

                  fontSize: 15,

                  fontWeight:
                    "bold",

                  color:
                    "#374151",
                }}
              >
                {weather
                  ? `${Math.round(
                      weather.maxTemperature
                    )}°`
                  : "--°"}
              </Text>
            </View>

            <View>
              <Text
                style={{
                  fontSize: 12,

                  color:
                    "#9CA3AF",
                }}
              >
                최저
              </Text>

              <Text
                style={{
                  marginTop: 4,

                  fontSize: 15,

                  fontWeight:
                    "bold",

                  color:
                    "#374151",
                }}
              >
                {weather
                  ? `${Math.round(
                      weather.minTemperature
                    )}°`
                  : "--°"}
              </Text>
            </View>

            <View>
              <Text
                style={{
                  fontSize: 12,

                  color:
                    "#9CA3AF",
                }}
              >
                강수확률
              </Text>

              <Text
                style={{
                  marginTop: 4,

                  fontSize: 15,

                  fontWeight:
                    "bold",

                  color:
                    "#374151",
                }}
              >
                {weather
                  ? `${Math.round(
                      weather.precipitationProbability
                    )}%`
                  : "--%"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 오늘 일정 */}

      <View
        style={{
          marginTop: 25,

          backgroundColor:
            "white",

          borderRadius: 16,

          padding: 20,
        }}
      >
        <View
          style={{
            flexDirection:
              "row",

            justifyContent:
              "space-between",

            alignItems:
              "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,

              fontWeight:
                "bold",

              color:
                "#111827",
            }}
          >
            📅 오늘 일정 ·{" "}
            {todaySchedules.length}개
          </Text>

          {trip && (
            <Pressable
              onPress={() =>
                router.push(
                  "/schedule"
                )
              }
            >
              <Text
                style={{
                  color:
                    "#3B82F6",

                  fontSize: 13,

                  fontWeight:
                    "bold",
                }}
              >
                전체 보기 ›
              </Text>
            </Pressable>
          )}
        </View>

        {!trip ? (
          <Text
            style={{
              marginTop: 12,

              color:
                "#9CA3AF",
            }}
          >
            여행을 생성하면 일정이 표시됩니다.
          </Text>
        ) : previewSchedules.length ===
          0 ? (
          <Text
            style={{
              marginTop: 12,

              color:
                "#9CA3AF",
            }}
          >
            오늘 등록된 일정이 없습니다.
          </Text>
        ) : (
          <View
            style={{
              marginTop: 8,
            }}
          >
            {previewSchedules.map(
              (
                schedule,
                index
              ) => (
                <Pressable
                  key={
                    schedule.id
                  }
                  onPress={() =>
                    router.push(
                      `/schedule/${schedule.id}` as any
                    )
                  }
                  style={{
                    flexDirection:
                      "row",

                    paddingVertical: 12,

                    borderBottomWidth:
                      index ===
                      previewSchedules.length -
                        1
                        ? 0
                        : 1,

                    borderBottomColor:
                      "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      width: 58,

                      fontSize: 15,

                      fontWeight:
                        "bold",

                      color:
                        "#3B82F6",
                    }}
                  >
                    {schedule.time}
                  </Text>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,

                        fontWeight:
                          "bold",

                        color:
                          "#111827",
                      }}
                    >
                      {schedule.title}
                    </Text>

                    <Text
                      numberOfLines={
                        1
                      }
                      style={{
                        marginTop: 4,

                        color:
                          "#6B7280",

                        fontSize: 13,
                      }}
                    >
                      📍{" "}
                      {schedule.location}
                    </Text>
                  </View>
                </Pressable>
              )
            )}

            {todaySchedules.length >
              3 && (
              <Pressable
                onPress={() =>
                  router.push(
                    "/schedule"
                  )
                }
                style={{
                  marginTop: 6,

                  paddingVertical: 8,

                  alignItems:
                    "center",
                }}
              >
                <Text
                  style={{
                    color:
                      "#6B7280",

                    fontSize: 13,
                  }}
                >
                  외{" "}
                  {todaySchedules.length -
                    3}
                  개 일정 더 보기
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* 예산 */}

      <View
        style={{
          marginTop: 20,

          backgroundColor:
            "white",

          borderRadius: 16,

          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 20,

            fontWeight:
              "bold",

            color:
              "#111827",
          }}
        >
          💴 예산
        </Text>

        {!expenseSettings ? (
          <Text
            style={{
              marginTop: 10,

              color:
                "#9CA3AF",
            }}
          >
            아직 예산이 설정되지 않았습니다.
          </Text>
        ) : (
          <View
            style={{
              marginTop: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection:
                  "row",

                justifyContent:
                  "space-between",
              }}
            >
              <Text
                style={{
                  color:
                    "#6B7280",
                }}
              >
                총 예산
              </Text>

              <Text
                style={{
                  fontWeight:
                    "bold",

                  color:
                    "#111827",
                }}
              >
                {formatWon(
                  budget
                )}
              </Text>
            </View>

            <View
              style={{
                flexDirection:
                  "row",

                justifyContent:
                  "space-between",
              }}
            >
              <Text
                style={{
                  color:
                    "#6B7280",
                }}
              >
                사용
              </Text>

              <Text
                style={{
                  fontWeight:
                    "bold",

                  color:
                    "#DC2626",
                }}
              >
                {formatWon(
                  totalSpent
                )}
              </Text>
            </View>

            <View
              style={{
                height: 1,

                backgroundColor:
                  "#E5E7EB",
              }}
            />

            <View
              style={{
                flexDirection:
                  "row",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",
              }}
            >
              <Text
                style={{
                  color:
                    "#374151",

                  fontWeight:
                    "bold",
                }}
              >
                남은 예산
              </Text>

              <Text
                style={{
                  fontSize: 18,

                  fontWeight:
                    "bold",

                  color:
                    "#2563EB",
                }}
              >
                {formatWon(
                  remainingBudget
                )}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* AI 추천 */}

      <View
        style={{
          marginTop: 20,

          backgroundColor:
            "white",

          borderRadius: 16,

          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 20,

            fontWeight:
              "bold",

            color:
              "#111827",
          }}
        >
          🤖 AI 추천
        </Text>

        <Text
          style={{
            marginTop: 10,

            color: "#777",
          }}
        >
          {trip
            ? "AI 여행 추천 기능을 연결할 예정입니다."
            : "여행을 생성하면 AI 추천이 표시됩니다."}
        </Text>
      </View>
    </ScrollView>
  );
}
