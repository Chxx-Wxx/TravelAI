import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import { getTrip } from "../../lib/storage";
import { fetchSchedules } from "../../services/schedule";
import { Schedule, Trip } from "../../types";

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    null
  );

  // 저장된 여행 / 일정 불러오기
  const loadData = useCallback(async () => {
  const tripData =
  await getTrip();

if (!tripData?.id) {
  setTrip(tripData);
  setSchedules([]);
  return;
}

  const scheduleData =
  await fetchSchedules(
    tripData.id
  );

    const sorted = [...scheduleData].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    );

    setTrip(tripData);
    setSchedules(sorted);

    if (sorted.length > 0) {
      setSelectedDate((current) => {
        if (
          current &&
          sorted.some((schedule) => schedule.date === current)
        ) {
          return current;
        }

        return sorted[0].date;
      });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 일정이 존재하는 날짜 목록
  const dates = useMemo(() => {
    return [...new Set(schedules.map((schedule) => schedule.date))];
  }, [schedules]);

  // 현재 선택된 날짜의 일정
  const selectedSchedules = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    return schedules.filter(
      (schedule) => schedule.date === selectedDate
    );
  }, [schedules, selectedDate]);

  // 좌표가 실제로 저장되어 있는 일정만 지도에 표시
  const schedulesWithCoordinates = useMemo(() => {
    return selectedSchedules.filter(
      (schedule) =>
        typeof schedule.latitude === "number" &&
        typeof schedule.longitude === "number"
    );
  }, [selectedSchedules]);

  // 여행 시작일 기준 몇 일차인지 계산
  function calculateDayNumber(date: string) {
    if (!trip) {
      return null;
    }

    const [startYear, startMonth, startDay] = trip.startDate
      .split("-")
      .map(Number);

    const [year, month, day] = date.split("-").map(Number);

    const start = new Date(
      startYear,
      startMonth - 1,
      startDay
    );

    const target = new Date(
      year,
      month - 1,
      day
    );

    const difference =
      target.getTime() - start.getTime();

    return (
      Math.floor(
        difference / (1000 * 60 * 60 * 24)
      ) + 1
    );
  }

  // 일정 좌표들에 맞춰 지도 확대/축소
  function focusSchedules(schedulesToFocus: Schedule[]) {
    const coordinates = schedulesToFocus
      .filter(
        (schedule) =>
          typeof schedule.latitude === "number" &&
          typeof schedule.longitude === "number"
      )
      .map((schedule) => ({
        latitude: schedule.latitude as number,
        longitude: schedule.longitude as number,
      }));

    if (coordinates.length === 0) {
      return;
    }

    // 장소가 하나뿐이면 그 장소 중심으로 이동
    if (coordinates.length === 1) {
      mapRef.current?.animateToRegion(
        {
          latitude: coordinates[0].latitude,
          longitude: coordinates[0].longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        },
        500
      );

      return;
    }

    // 여러 장소면 모든 마커가 화면 안에 들어오도록 자동 조정
    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 70,
        right: 50,
        bottom: 70,
        left: 50,
      },
      animated: true,
    });
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);

    const daySchedules = schedules.filter(
      (schedule) => schedule.date === date
    );

    setTimeout(() => {
      focusSchedules(daySchedules);
    }, 100);
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#F5F7FB",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 70,
          paddingHorizontal: 20,
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
          지도
        </Text>

        {trip && (
          <Text
            style={{
              marginTop: 8,
              color: "#6B7280",
              fontSize: 15,
            }}
          >
            여행 지도
          </Text>
        )}

        {/* 날짜 선택 */}
        {dates.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              marginHorizontal: -20,
              marginTop: 24,
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 8,
            }}
          >
            {dates.map((date) => {
              const selected = date === selectedDate;
              const dayNumber = calculateDayNumber(date);

              return (
                <Pressable
                  key={date}
                  onPress={() => handleSelectDate(date)}
                  style={{
                    backgroundColor: selected
                      ? "#3B82F6"
                      : "white",
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 11,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "bold",
                      color: selected
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
                      color: selected
                        ? "#DBEAFE"
                        : "#6B7280",
                    }}
                  >
                    {date.slice(5)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* 지도 */}
        <View
          style={{
            height: 350,
            marginTop: 20,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <MapView
            ref={mapRef}
            style={{
              width: "100%",
              height: "100%",
            }}
            initialRegion={{
              latitude: 35.6762,
              longitude: 139.6503,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            onMapReady={() => {
              focusSchedules(schedulesWithCoordinates);
            }}
          >
            {schedulesWithCoordinates.map(
              (schedule, index) => (
                <Marker
                  key={schedule.id}
                  coordinate={{
                    latitude: schedule.latitude as number,
                    longitude: schedule.longitude as number,
                  }}
                  title={`${index + 1}. ${schedule.title}`}
                  description={schedule.location}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: "#3B82F6",
                      borderWidth: 3,
                      borderColor: "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "bold",
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

        {/* 아직 좌표가 없는 경우 */}
        {schedulesWithCoordinates.length === 0 && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: "#EFF6FF",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#2563EB",
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              이 날짜의 일정에는 아직 지도 위치가
              연결되지 않았습니다.
            </Text>
          </View>
        )}

        <Text
          style={{
            marginTop: 28,
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          오늘의 이동 순서
        </Text>

        {selectedSchedules.length === 0 ? (
          <View
            style={{
              marginTop: 14,
              padding: 20,
              backgroundColor: "white",
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
          selectedSchedules.map((schedule, index) => {
            const hasCoordinates =
              typeof schedule.latitude === "number" &&
              typeof schedule.longitude === "number";

            return (
              <Pressable
                key={schedule.id}
                onPress={() => {
                  if (!hasCoordinates) {
                    return;
                  }

                  mapRef.current?.animateToRegion(
                    {
                      latitude: schedule.latitude as number,
                      longitude: schedule.longitude as number,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    },
                    400
                  );
                }}
                style={{
                  flexDirection: "row",
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#3B82F6",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight: "bold",
                    }}
                  >
                    {index + 1}
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    backgroundColor: "white",
                    borderRadius: 14,
                    padding: 15,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "bold",
                      color: "#111827",
                    }}
                  >
                    {schedule.title}
                  </Text>

                  <Text
                    style={{
                      marginTop: 5,
                      color: "#6B7280",
                    }}
                  >
                    {schedule.time} · 📍 {schedule.location}
                  </Text>

                  {schedule.category && (
                    <Text
                      style={{
                        marginTop: 5,
                        color: "#2563EB",
                        fontSize: 13,
                        fontWeight: "bold",
                      }}
                    >
                      {schedule.category}
                    </Text>
                  )}

                  {hasCoordinates ? (
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#059669",
                        fontWeight: "bold",
                      }}
                    >
                      지도 위치 연결됨
                    </Text>
                  ) : (
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#9CA3AF",
                      }}
                    >
                      지도 위치 미등록
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}