import {
  useFocusEffect,
} from "expo-router";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import MapView, {
  Marker,
} from "react-native-maps";

import {
  getTrip,
} from "../../lib/storage";

import {
  hasValidScheduleLocation,
} from "../../lib/schedule-location";

import {
  fetchSchedules,
} from "../../services/schedule";

import {
  Schedule,
  Trip,
} from "../../types";

export default function MapScreen() {
  const mapRef =
    useRef<MapView | null>(
      null
    );

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
    selectedDate,
    setSelectedDate,
  ] =
    useState<
      string | null
    >(null);

  // 여행 / 일정 불러오기
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

            setSelectedDate(
              null
            );

            return;
          }

          const scheduleData =
            await fetchSchedules(
              tripData.id
            );

          const sorted = [
            ...scheduleData,
          ].sort(
            (
              a,
              b
            ) =>
              `${a.date} ${a.time}`.localeCompare(
                `${b.date} ${b.time}`
              )
          );

          setSchedules(
            sorted
          );

          if (
            sorted.length >
            0
          ) {
            setSelectedDate(
              (
                current
              ) => {
                if (
                  current &&
                  sorted.some(
                    (
                      schedule
                    ) =>
                      schedule.date ===
                      current
                  )
                ) {
                  return current;
                }

                return sorted[0]
                  .date;
              }
            );
          } else {
            setSelectedDate(
              null
            );
          }
        } catch (error) {
          console.error(
            "지도 데이터 불러오기 실패:",
            error
          );

          setSchedules(
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

  // 일정이 있는 날짜
  const dates =
    useMemo(() => {
      return [
        ...new Set(
          schedules.map(
            (
              schedule
            ) =>
              schedule.date
          )
        ),
      ];
    }, [schedules]);

  // 선택 날짜 일정
  const selectedSchedules =
    useMemo(() => {
      if (
        !selectedDate
      ) {
        return [];
      }

      return schedules.filter(
        (
          schedule
        ) =>
          schedule.date ===
          selectedDate
      );
    }, [
      schedules,
      selectedDate,
    ]);

  // 좌표가 있는 일정
  const schedulesWithCoordinates =
    useMemo(() => {
      return selectedSchedules.filter(
        hasValidScheduleLocation
      );
    }, [
      selectedSchedules,
    ]);

  // 여행 몇 일차인지 계산
  function calculateDayNumber(
    date: string
  ) {
    if (!trip) {
      return null;
    }

    const [
      startYear,
      startMonth,
      startDay,
    ] =
      trip.startDate
        .split("-")
        .map(Number);

    const [
      year,
      month,
      day,
    ] =
      date
        .split("-")
        .map(Number);

    const start =
      new Date(
        startYear,
        startMonth - 1,
        startDay
      );

    const target =
      new Date(
        year,
        month - 1,
        day
      );

    const difference =
      target.getTime() -
      start.getTime();

    return (
      Math.floor(
        difference /
          (
            1000 *
            60 *
            60 *
            24
          )
      ) + 1
    );
  }

  // 체류시간 표시
  function formatDuration(
    minutes?: number
  ) {
    if (!minutes) {
      return null;
    }

    if (
      minutes < 60
    ) {
      return `${minutes}분`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const remainingMinutes =
      minutes % 60;

    if (
      remainingMinutes ===
      0
    ) {
      return `${hours}시간`;
    }

    return `${hours}시간 ${remainingMinutes}분`;
  }

  // 일정 좌표에 맞춰 지도 조정
  function focusSchedules(
    schedulesToFocus: Schedule[]
  ) {
    const coordinates =
      schedulesToFocus
        .filter(
          hasValidScheduleLocation
        )
        .map(
          (
            schedule
          ) => ({
            latitude:
              schedule.latitude as number,

            longitude:
              schedule.longitude as number,
          })
        );

    if (
      coordinates.length ===
      0
    ) {
      return;
    }

    if (
      coordinates.length ===
      1
    ) {
      mapRef.current?.animateToRegion(
        {
          latitude:
            coordinates[0]
              .latitude,

          longitude:
            coordinates[0]
              .longitude,

          latitudeDelta:
            0.03,

          longitudeDelta:
            0.03,
        },
        500
      );

      return;
    }

    mapRef.current?.fitToCoordinates(
      coordinates,
      {
        edgePadding: {
          top: 80,
          right: 55,
          bottom: 80,
          left: 55,
        },

        animated: true,
      }
    );
  }

  function handleSelectDate(
    date: string
  ) {
    setSelectedDate(
      date
    );

    const daySchedules =
      schedules.filter(
        (
          schedule
        ) =>
          schedule.date ===
          date
      );

    setTimeout(
      () => {
        focusSchedules(
          daySchedules
        );
      },
      100
    );
  }

  const selectedDayNumber =
    selectedDate
      ? calculateDayNumber(
          selectedDate
        )
      : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 70,
          paddingHorizontal: 20,
          paddingBottom: 120,
        }}
      >
        {/* 제목 */}

        <Text
          style={{
            fontSize: 32,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          🗺️ 지도
        </Text>

        <Text
          style={{
            marginTop: 7,
            color: "#6B7280",
            fontSize: 15,
          }}
        >
          {trip
            ? `${trip.tripName}의 이동 경로를 확인하세요.`
            : "여행 일정을 지도에서 확인하세요."}
        </Text>

        {/* 날짜 선택 */}

        {dates.length >
          0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            style={{
              marginHorizontal:
                -20,
              marginTop: 24,
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 8,
            }}
          >
            {dates.map(
              (
                date
              ) => {
                const selected =
                  date ===
                  selectedDate;

                const dayNumber =
                  calculateDayNumber(
                    date
                  );

                return (
                  <Pressable
                    key={
                      date
                    }
                    onPress={() =>
                      handleSelectDate(
                        date
                      )
                    }
                    style={{
                      backgroundColor:
                        selected
                          ? "#3B82F6"
                          : "white",

                      borderRadius: 14,

                      paddingHorizontal: 16,

                      paddingVertical: 11,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight:
                          "bold",

                        color:
                          selected
                            ? "white"
                            : "#111827",
                      }}
                    >
                      {dayNumber
                        ? `${dayNumber}일차`
                        : date}
                    </Text>

                    <Text
                      style={{
                        marginTop: 3,
                        fontSize: 12,

                        color:
                          selected
                            ? "#DBEAFE"
                            : "#6B7280",
                      }}
                    >
                      {date.slice(
                        5
                      )}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </ScrollView>
        )}

        {/* 선택 날짜 요약 */}

        {selectedDate && (
          <View
            style={{
              marginTop: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: "#111827",
              }}
            >
              {selectedDayNumber
                ? `${selectedDayNumber}일차`
                : "선택 날짜"}
              {" · "}
              {selectedDate}
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: "#6B7280",
              }}
            >
              {
                selectedSchedules.length
              }
              개 일정
            </Text>
          </View>
        )}

        {/* 지도 */}

        <View
          style={{
            height: 390,
            marginTop: 14,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor:
              "#E5E7EB",
          }}
        >
          <MapView
            ref={mapRef}
            style={{
              width: "100%",
              height: "100%",
            }}
            initialRegion={{
              latitude:
                35.6762,

              longitude:
                139.6503,

              latitudeDelta:
                0.15,

              longitudeDelta:
                0.15,
            }}
            onMapReady={() => {
              focusSchedules(
                schedulesWithCoordinates
              );
            }}
          >
            {schedulesWithCoordinates.map(
              (
                schedule,
                index
              ) => (
                <Marker
                  key={
                    schedule.id
                  }
                  coordinate={{
                    latitude:
                      schedule.latitude as number,

                    longitude:
                      schedule.longitude as number,
                  }}
                  title={`${index + 1}. ${schedule.title}`}
                  description={
                    schedule.location
                  }
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,

                      backgroundColor:
                        "#3B82F6",

                      borderWidth: 3,

                      borderColor:
                        "white",

                      justifyContent:
                        "center",

                      alignItems:
                        "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight:
                          "bold",
                        fontSize: 15,
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                </Marker>
              )
            )}
          </MapView>
        </View>

        {/* 좌표 없음 안내 */}

        {selectedSchedules.length >
          0 &&
          schedulesWithCoordinates.length ===
            0 && (
            <Text
              style={{
                marginTop: 10,
                paddingHorizontal: 4,
                color: "#9CA3AF",
                fontSize: 12,
              }}
            >
              아직 지도 위치가 연결된 일정이 없습니다.
            </Text>
          )}

        {/* 이동 순서 */}

        <View
          style={{
            marginTop: 30,
            flexDirection: "row",
            justifyContent:
              "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            오늘의 이동 순서
          </Text>

          {selectedSchedules.length >
            1 && (
            <View
              style={{
                backgroundColor:
                  "#EFF6FF",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: "#3B82F6",
                  fontSize: 11,
                  fontWeight: "bold",
                }}
              >
                자동 최적화 예정
              </Text>
            </View>
          )}
        </View>

        {selectedSchedules.length ===
        0 ? (
          <View
            style={{
              marginTop: 14,
              padding: 20,
              backgroundColor:
                "white",
              borderRadius: 16,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
              }}
            >
              이 날짜에는 아직 일정이 없습니다.
            </Text>
          </View>
        ) : (
          selectedSchedules.map(
            (
              schedule,
              index
            ) => {
              const hasCoordinates =
                hasValidScheduleLocation(
                  schedule
                );

              const duration =
                formatDuration(
                  schedule.durationMinutes
                );

              return (
                <Pressable
                  key={
                    schedule.id
                  }
                  onPress={() => {
                    if (
                      !hasCoordinates
                    ) {
                      return;
                    }

                    mapRef.current?.animateToRegion(
                      {
                        latitude:
                          schedule.latitude as number,

                        longitude:
                          schedule.longitude as number,

                        latitudeDelta:
                          0.02,

                        longitudeDelta:
                          0.02,
                      },
                      400
                    );
                  }}
                  style={{
                    flexDirection:
                      "row",

                    marginTop: 14,

                    alignItems:
                      "flex-start",
                  }}
                >
                  {/* 순서 번호 */}

                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,

                      backgroundColor:
                        hasCoordinates
                          ? "#3B82F6"
                          : "#CBD5E1",

                      justifyContent:
                        "center",

                      alignItems:
                        "center",

                      marginTop: 5,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight:
                          "bold",
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  {/* 일정 카드 */}

                  <View
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      backgroundColor:
                        "white",
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    {/* 시간 */}

                    <Text
                      style={{
                        fontSize: 13,
                        color: "#3B82F6",
                        fontWeight:
                          "bold",
                      }}
                    >
                      {schedule.time}
                    </Text>

                    {/* 일정 이름 */}

                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 18,
                        fontWeight:
                          "bold",
                        color: "#111827",
                      }}
                    >
                      {schedule.title}
                    </Text>

                    {/* 장소 */}

                    <Text
                      style={{
                        marginTop: 7,
                        color: "#4B5563",
                        fontSize: 14,
                      }}
                    >
                      📍 {schedule.location}
                    </Text>

                    {/* 실제 주소 */}

                    {schedule.address ? (
                      <Text
                        numberOfLines={
                          2
                        }
                        style={{
                          marginTop: 5,
                          color: "#9CA3AF",
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        {schedule.address}
                      </Text>
                    ) : null}

                    {/* 카테고리 / 체류시간 */}

                    {(schedule.category ||
                      duration) && (
                      <View
                        style={{
                          marginTop: 10,
                          flexDirection:
                            "row",
                          flexWrap:
                            "wrap",
                          gap: 6,
                        }}
                      >
                        {schedule.category && (
                          <View
                            style={{
                              backgroundColor:
                                "#EFF6FF",

                              borderRadius: 8,

                              paddingHorizontal: 8,

                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  "#2563EB",

                                fontSize: 11,

                                fontWeight:
                                  "bold",
                              }}
                            >
                              {
                                schedule.category
                              }
                            </Text>
                          </View>
                        )}

                        {duration && (
                          <View
                            style={{
                              backgroundColor:
                                "#F3F4F6",

                              borderRadius: 8,

                              paddingHorizontal: 8,

                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  "#6B7280",

                                fontSize: 11,

                                fontWeight:
                                  "bold",
                              }}
                            >
                              ⏱ {duration}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* 지도 상태 */}

                    {!hasCoordinates && (
                      <Text
                        style={{
                          marginTop: 9,
                          fontSize: 11,
                          color: "#9CA3AF",
                        }}
                      >
                        지도 위치 미등록
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }
          )
        )}
      </ScrollView>
    </View>
  );
}
