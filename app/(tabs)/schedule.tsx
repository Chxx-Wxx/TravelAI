import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import AppButton from "../../components/AppButton";
import {
  deleteSchedule,
  getSchedules,
  getTrip,
} from "../../lib/storage";
import { Schedule, Trip } from "../../types";

function parseDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function calculateDayNumber(
  tripStartDate: string,
  scheduleDate: string
) {
  const start = parseDate(tripStartDate);
  const target = parseDate(scheduleDate);

  const difference =
    target.getTime() - start.getTime();

  return Math.floor(difference / (1000 * 60 * 60 * 24)) + 1;
}

export default function ScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);

  const loadData = useCallback(async () => {
    const scheduleData = await getSchedules();
    const tripData = await getTrip();

    const sorted = [...scheduleData].sort((a, b) => {
      const first = `${a.date} ${a.time}`;
      const second = `${b.date} ${b.time}`;

      return first.localeCompare(second);
    });

    setSchedules(sorted);
    setTrip(tripData);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  function handleDelete(id: string, title: string) {
    Alert.alert("일정 삭제", `"${title}" 일정을 삭제할까요?`, [
      {
        text: "취소",
        style: "cancel",
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          await deleteSchedule(id);
          await loadData();
        },
      },
    ]);
  }

  const groupedSchedules = useMemo(() => {
    const grouped: Record<string, Schedule[]> = {};

    schedules.forEach((schedule) => {
      if (!grouped[schedule.date]) {
        grouped[schedule.date] = [];
      }

      grouped[schedule.date].push(schedule);
    });

    return Object.entries(grouped).sort(([dateA], [dateB]) =>
      dateA.localeCompare(dateB)
    );
  }, [schedules]);

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: "#F5F7FB",
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
          {trip.tripName} · {trip.startDate} ~ {trip.endDate}
        </Text>
      )}

      <View
        style={{
          marginTop: 25,
        }}
      >
        <AppButton
          title="+ 일정 추가"
          onPress={() => router.push("/schedule/create")}
        />
      </View>

      {schedules.length === 0 ? (
        <View
          style={{
            marginTop: 25,
            backgroundColor: "white",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
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
        groupedSchedules.map(([date, daySchedules]) => {
          const dayNumber = trip
            ? calculateDayNumber(trip.startDate, date)
            : null;

          return (
            <View
              key={date}
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
                  {dayNumber && dayNumber > 0
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

              {daySchedules.map((schedule) => (
                <View
                  key={schedule.id}
                  style={{
                    flexDirection: "row",
                    marginBottom: 14,
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
                        fontWeight: "bold",
                        color: "#2563EB",
                      }}
                    >
                      {schedule.time}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 2,
                      backgroundColor: "#D1D5DB",
                      marginRight: 14,
                      position: "relative",
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: 6,
                        left: -5,
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: "#3B82F6",
                      }}
                    />
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: "white",
                      borderRadius: 16,
                      padding: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 19,
                        fontWeight: "bold",
                        color: "#111827",
                      }}
                    >
                      {schedule.title}
                    </Text>

                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 15,
                        color: "#6B7280",
                      }}
                    >
                      📍 {schedule.location}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        marginTop: 16,
                      }}
                    >
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/schedule/${schedule.id}` as any
                          )
                        }
                        style={{
                          flex: 1,
                          backgroundColor: "#E8F1FF",
                          paddingVertical: 11,
                          borderRadius: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "bold",
                            color: "#2563EB",
                          }}
                        >
                          수정
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          handleDelete(
                            schedule.id,
                            schedule.title
                          )
                        }
                        style={{
                          flex: 1,
                          backgroundColor: "#FEECEC",
                          paddingVertical: 11,
                          borderRadius: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "bold",
                            color: "#DC2626",
                          }}
                        >
                          삭제
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}