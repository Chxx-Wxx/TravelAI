import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import AppButton from "../../components/AppButton";

import {
  getCurrentTripWithRecovery,
} from "../../services/current-trip";

import {
  deleteServerSchedule,
  fetchSchedules,
} from "../../services/schedule";

import {
  Schedule,
  Trip,
} from "../../types";

function parseDate(
  dateString: string
) {
  const [
    year,
    month,
    day,
  ] =
    dateString
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}

function calculateDayNumber(
  tripStartDate: string,
  scheduleDate: string
) {
  const start =
    parseDate(
      tripStartDate
    );

  const target =
    parseDate(
      scheduleDate
    );

  const difference =
    target.getTime() -
    start.getTime();

  return (
    Math.floor(
      difference /
        (1000 *
          60 *
          60 *
          24)
    ) + 1
  );
}

function formatDuration(
  minutes?: number
) {
  if (!minutes) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes}분`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const remainingMinutes =
    minutes % 60;

  if (
    remainingMinutes === 0
  ) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${remainingMinutes}분`;
}

function timeToMinutes(
  time: string
) {
  const [
    hour,
    minute,
  ] =
    time
      .split(":")
      .map(Number);

  return (
    hour * 60 +
    minute
  );
}

function calculateEndTime(
  startTime: string,
  durationMinutes?: number
) {
  if (!durationMinutes) {
    return null;
  }

  const start =
    timeToMinutes(
      startTime
    );

  const end =
    start +
    durationMinutes;

  const endHour =
    Math.floor(
      end / 60
    ) % 24;

  const endMinute =
    end % 60;

  return `${String(
    endHour
  ).padStart(
    2,
    "0"
  )}:${String(
    endMinute
  ).padStart(
    2,
    "0"
  )}`;
}

function calculateGapMinutes(
  current: Schedule,
  next?: Schedule
) {
  if (
    !next ||
    !current.durationMinutes
  ) {
    return null;
  }

  const currentStart =
    timeToMinutes(
      current.time
    );

  const currentEnd =
    currentStart +
    current.durationMinutes;

  let nextStart =
    timeToMinutes(
      next.time
    );

  if (
    nextStart <
    currentStart
  ) {
    nextStart +=
      24 * 60;
  }

  return (
    nextStart -
    currentEnd
  );
}

function formatGap(
  minutes: number
) {
  if (minutes === 0) {
    return "바로 다음 일정";
  }

  if (minutes < 0) {
    return `${formatDuration(
      Math.abs(minutes)
    )} 겹침`;
  }

  return `${formatDuration(
    minutes
  )} 여유`;
}

export default function ScheduleScreen() {
  const [
    schedules,
    setSchedules,
  ] =
    useState<
      Schedule[]
    >([]);

  const [
    trip,
    setTrip,
  ] =
    useState<
      Trip | null
    >(null);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const loadData =
  useCallback(
    async () => {
      try {
        setLoading(true);

        // 먼저 현재 여행 정보를 가져온다.
        const tripData =
          await getCurrentTripWithRecovery();

        setTrip(tripData);

        // 여행이 없으면 일정도 비운다.
        if (!tripData) {
          setSchedules([]);
          return;
        }

        // 서버에서 받은 여행 ID가 없으면
        // 해당 여행의 일정을 조회할 수 없다.
        if (!tripData.id) {
          console.error(
            "여행 ID가 없습니다."
          );

          setSchedules([]);

          return;
        }

        // 현재 여행 ID에 해당하는 일정만 조회한다.
        const scheduleData =
          await fetchSchedules(
            tripData.id
          );

        const sorted =
          [...scheduleData].sort(
            (a, b) => {
              const first =
                `${a.date} ${a.time}`;

              const second =
                `${b.date} ${b.time}`;

              return first.localeCompare(
                second
              );
            }
          );

        setSchedules(sorted);
      } catch (error) {
        console.error(
          "일정 불러오기 실패:",
          error
        );

        Alert.alert(
          "일정 불러오기 실패",
          "서버에서 일정을 불러오지 못했습니다. 백엔드와 ngrok 연결을 확인해주세요."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );
  
    useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleDelete(
    id: string,
    title: string
  ) {
    Alert.alert(
      "일정 삭제",
      `"${title}" 일정을 삭제할까요?`,
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "삭제",
          style: "destructive",

          onPress:
            async () => {
              try {
                await deleteServerSchedule(
                  id
                );

                await loadData();
              } catch (
                error
              ) {
                console.error(
                  "일정 삭제 실패:",
                  error
                );

                Alert.alert(
                  "삭제 실패",
                  "일정을 삭제하지 못했습니다."
                );
              }
            },
        },
      ]
    );
  }

  const groupedSchedules =
    useMemo(() => {
      const grouped: Record<
        string,
        Schedule[]
      > = {};

      schedules.forEach(
        (
          schedule
        ) => {
          if (
            !grouped[
              schedule.date
            ]
          ) {
            grouped[
              schedule.date
            ] = [];
          }

          grouped[
            schedule.date
          ].push(
            schedule
          );
        }
      );

      return Object.entries(
        grouped
      ).sort(
        (
          [dateA],
          [dateB]
        ) =>
          dateA.localeCompare(
            dateB
          )
      );
    }, [schedules]);

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 70,
        paddingBottom: 120,
      }}
    >
      <Text
        style={{
          fontSize: 32,
          fontWeight: "bold",
          color: "#111827",
        }}
      >
        일정
      </Text>

      {trip && (
        <Text
          style={{
            marginTop: 8,
            fontSize: 15,
            color: "#6B7280",
          }}
        >
          {trip.tripName} ·{" "}
          {trip.startDate} ~{" "}
          {trip.endDate}
        </Text>
      )}

      <View
        style={{
          marginTop: 25,
        }}
      >
        <AppButton
          title="+ 일정 추가"
          onPress={() =>
            router.push(
              "/schedule/create"
            )
          }
        />
      </View>

      {loading ? (
        <View
          style={{
            marginTop: 25,
            backgroundColor:
              "white",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <Text
            style={{
              color: "#6B7280",
            }}
          >
            서버에서 일정을 불러오는 중...
          </Text>
        </View>
      ) : schedules.length ===
        0 ? (
        <View
          style={{
            marginTop: 25,
            backgroundColor:
              "white",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            아직 일정이 없습니다.
          </Text>

          <Text
            style={{
              marginTop: 8,
              color: "#777",
            }}
          >
            첫 번째 여행 일정을 추가해보세요.
          </Text>
        </View>
      ) : (
        groupedSchedules.map(
          (
            [
              date,
              daySchedules,
            ]
          ) => {
            const dayNumber =
              trip
                ? calculateDayNumber(
                    trip.startDate,
                    date
                  )
                : null;

            return (
              <View
                key={
                  date
                }
                style={{
                  marginTop: 30,
                }}
              >
                <View
                  style={{
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "bold",
                      color: "#111827",
                    }}
                  >
                    {dayNumber &&
                    dayNumber >
                      0
                      ? `${dayNumber}일차`
                      : "여행 일정"}
                  </Text>

                  <Text
                    style={{
                      marginTop: 4,
                      fontSize: 15,
                      color: "#6B7280",
                    }}
                  >
                    {date}
                  </Text>
                </View>

                {daySchedules.map(
                  (
                    schedule,
                    index
                  ) => {
                    const endTime =
                      calculateEndTime(
                        schedule.time,
                        schedule.durationMinutes
                      );

                    const nextSchedule =
                      daySchedules[
                        index +
                          1
                      ];

                    const gapMinutes =
                      calculateGapMinutes(
                        schedule,
                        nextSchedule
                      );

                    return (
                      <View
                        key={
                          schedule.id
                        }
                      >
                        <View
                          style={{
                            flexDirection:
                              "row",
                            marginBottom: 8,
                          }}
                        >
                          <View
                            style={{
                              width: 65,
                              paddingTop: 4,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 16,
                                fontWeight:
                                  "bold",
                                color:
                                  "#2563EB",
                              }}
                            >
                              {
                                schedule.time
                              }
                            </Text>

                            {endTime && (
                              <Text
                                style={{
                                  marginTop: 4,
                                  fontSize: 13,
                                  color:
                                    "#9CA3AF",
                                }}
                              >
                                ~{" "}
                                {
                                  endTime
                                }
                              </Text>
                            )}
                          </View>

                          <View
                            style={{
                              width: 2,
                              backgroundColor:
                                "#D1D5DB",
                              marginRight: 14,
                              position:
                                "relative",
                            }}
                          >
                            <View
                              style={{
                                position:
                                  "absolute",
                                top: 6,
                                left: -5,
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor:
                                  "#3B82F6",
                              }}
                            />
                          </View>

                          <Pressable
                            onPress={() =>
                              router.push(
                                `/schedule/${schedule.id}` as any
                              )
                            }
                            style={{
                              flex: 1,
                              backgroundColor:
                                "white",
                              borderRadius: 16,
                              padding: 16,
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
                                gap: 10,
                              }}
                            >
                              <Text
                                style={{
                                  flex: 1,
                                  fontSize: 19,
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

                              {schedule.category && (
                                <View
                                  style={{
                                    backgroundColor:
                                      "#EFF6FF",
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 20,
                                  }}
                                >
                                  <Text
                                    style={{
                                      color:
                                        "#2563EB",
                                      fontWeight:
                                        "bold",
                                      fontSize: 13,
                                    }}
                                  >
                                    {
                                      schedule.category
                                    }
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text
                              style={{
                                marginTop: 8,
                                fontSize: 15,
                                color: "#6B7280",
                              }}
                            >
                              📍{" "}
                              {
                                schedule.location
                              }
                            </Text>

                            {schedule.address ? (
                              <Text
                                style={{
                                  marginTop: 5,
                                  fontSize: 13,
                                  color:
                                    "#9CA3AF",
                                  lineHeight: 18,
                                }}
                              >
                                {
                                  schedule.address
                                }
                              </Text>
                            ) : null}

                            {schedule.durationMinutes && (
                              <Text
                                style={{
                                  marginTop: 7,
                                  fontSize: 15,
                                  color:
                                    "#6B7280",
                                }}
                              >
                                ⏱ 예상 소요시간{" "}
                                {formatDuration(
                                  schedule.durationMinutes
                                )}
                              </Text>
                            )}

                            {endTime && (
                              <Text
                                style={{
                                  marginTop: 7,
                                  fontSize: 15,
                                  color:
                                    "#6B7280",
                                }}
                              >
                                🏁 예상 종료{" "}
                                {
                                  endTime
                                }
                              </Text>
                            )}

                            {schedule.memo?.trim() ? (
                              <View
                                style={{
                                  marginTop: 12,
                                  backgroundColor:
                                    "#F9FAFB",
                                  borderRadius: 10,
                                  padding: 12,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 14,
                                    color:
                                      "#4B5563",
                                    lineHeight: 20,
                                  }}
                                >
                                  📝{" "}
                                  {
                                    schedule.memo
                                  }
                                </Text>
                              </View>
                            ) : null}

                            <View
                              style={{
                                flexDirection:
                                  "row",
                                gap: 10,
                                marginTop: 16,
                              }}
                            >
                              <View
                                style={{
                                  flex: 1,
                                  backgroundColor:
                                    "#E8F1FF",
                                  paddingVertical: 11,
                                  borderRadius: 10,
                                  alignItems:
                                    "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontWeight:
                                      "bold",
                                    color:
                                      "#2563EB",
                                  }}
                                >
                                  수정
                                </Text>
                              </View>

                              <Pressable
                                onPress={(
                                  event
                                ) => {
                                  event.stopPropagation();

                                  handleDelete(
                                    schedule.id,
                                    schedule.title
                                  );
                                }}
                                style={{
                                  flex: 1,
                                  backgroundColor:
                                    "#FEECEC",
                                  paddingVertical: 11,
                                  borderRadius: 10,
                                  alignItems:
                                    "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontWeight:
                                      "bold",
                                    color:
                                      "#DC2626",
                                  }}
                                >
                                  삭제
                                </Text>
                              </Pressable>
                            </View>
                          </Pressable>
                        </View>

                        {gapMinutes !==
                          null && (
                          <View
                            style={{
                              marginLeft: 79,
                              marginBottom: 14,
                              paddingVertical: 10,
                              paddingHorizontal: 14,
                              borderRadius: 12,

                              backgroundColor:
                                gapMinutes <
                                0
                                  ? "#FEF2F2"
                                  : "#F3F4F6",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight:
                                  "bold",

                                color:
                                  gapMinutes <
                                  0
                                    ? "#DC2626"
                                    : "#6B7280",
                              }}
                            >
                              {gapMinutes <
                              0
                                ? "⚠️ "
                                : "↳ "}
                              다음 일정까지{" "}
                              {formatGap(
                                gapMinutes
                              )}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  }
                )}
              </View>
            );
          }
        )
      )}
    </ScrollView>
  );
}
