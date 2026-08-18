import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
} from "../../lib/storage";
import { Schedule } from "../../types";

export default function ScheduleScreen() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const loadSchedules = useCallback(async () => {
    const data = await getSchedules();

    const sorted = [...data].sort((a, b) => {
      const first = `${a.date} ${a.time}`;
      const second = `${b.date} ${b.time}`;

      return first.localeCompare(second);
    });

    setSchedules(sorted);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSchedules();
    }, [loadSchedules])
  );

  function handleDelete(id: string, title: string) {
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
          onPress: async () => {
            await deleteSchedule(id);
            await loadSchedules();
          },
        },
      ]
    );
  }

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
        schedules.map((schedule) => (
          <View
            key={schedule.id}
            style={{
              marginTop: 15,
              backgroundColor: "white",
              borderRadius: 16,
              padding: 18,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
              }}
            >
              {schedule.title}
            </Text>

            <Text
              style={{
                marginTop: 10,
                fontSize: 15,
                color: "#555",
              }}
            >
              📍 {schedule.location}
            </Text>

            <Text
              style={{
                marginTop: 7,
                fontSize: 15,
                color: "#555",
              }}
            >
              📅 {schedule.date}
            </Text>

            <Text
              style={{
                marginTop: 7,
                fontSize: 15,
                color: "#555",
              }}
            >
              🕐 {schedule.time}
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 18,
              }}
            >
              <Pressable
                onPress={() =>
                  router.push(`/schedule/${schedule.id}` as any)
                }
                style={{
                  flex: 1,
                  backgroundColor: "#E8F1FF",
                  paddingVertical: 12,
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
                  handleDelete(schedule.id, schedule.title)
                }
                style={{
                  flex: 1,
                  backgroundColor: "#FEECEC",
                  paddingVertical: 12,
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
        ))
      )}
    </ScrollView>
  );
}