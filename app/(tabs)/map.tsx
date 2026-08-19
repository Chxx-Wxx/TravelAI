import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import {
  getSchedules,
  getTrip,
} from "../../lib/storage";

import {
  Schedule,
  Trip,
} from "../../types";

export default function MapScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    null
  );

  const loadData = useCallback(async () => {
    const tripData = await getTrip();
    const scheduleData = await getSchedules();

    const sorted = [...scheduleData].sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(
        `${b.date} ${b.time}`
      )
    );

    setTrip(tripData);
    setSchedules(sorted);

    if (sorted.length > 0) {
      setSelectedDate((current) => current ?? sorted[0].date);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const dates = useMemo(() => {
    return [...new Set(schedules.map((schedule) => schedule.date))];
  }, [schedules]);

  const selectedSchedules = useMemo(() => {
    if (!selectedDate) {
      return [];
    }

    return schedules.filter(
      (schedule) => schedule.date === selectedDate
    );
  }, [schedules, selectedDate]);

  const schedulesWithCoordinates = useMemo(() => {
    return selectedSchedules.filter(
      (schedule) =>
        typeof schedule.latitude === "number" &&
        typeof schedule.Longitude === "number"
    );
  }, [selectedSchedules]);

  function calculateDayNumber(date: string) {
    if (!trip) return null;

    const [startYear, startMonth, startDay] =
      trip.startDate.split("-").map(Number);

    const [year, month, day] =
      date.split("-").map(Number);

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
            📍 {trip.city}
          </Text>
        )}

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
                  onPress={() => setSelectedDate(date)}
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

        <View
          style={{
            height: 330,
            marginTop: 20,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#E5E7EB",
          }}
        >
          <MapView
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
          >
            {schedulesWithCoordinates.map((schedule, index) => (
              <Marker
                key={schedule.id}
                coordinate={{
                  latitude: schedule.latitude!,
                  longitude: schedule.Longitude!,
                }}
                title={`${index + 1}. ${schedule.title}`}
                description={schedule.location}
              />
            ))}
          </MapView>
        </View>

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
              아직 일정에 장소 좌표가 없습니다. 다음 단계에서 장소
              검색을 연결하면 지도에 번호 마커가 자동으로 표시됩니다.
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
          selectedSchedules.map((schedule, index) => (
            <View
              key={schedule.id}
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
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}