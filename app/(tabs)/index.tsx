import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  deleteTrip,
  getTrip,
  saveSchedules,
} from "../../lib/storage";
import { Trip } from "../../types";

export default function HomeScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);

  const loadTrip = useCallback(async () => {
    const data = await getTrip();
    setTrip(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrip();
    }, [loadTrip])
  );

  function handleDeleteTrip() {
    if (!trip) return;

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
          style: "destructive",
          onPress: async () => {
            await deleteTrip();

            // 현재 여행에 저장되어 있던 일정도 초기화
            await saveSchedules([]);

            setTrip(null);

            Alert.alert("완료", "여행이 삭제되었습니다.");
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
        paddingTop: 70,
        paddingHorizontal: 20,
        paddingBottom: 120,
      }}
    >
      <Text
        style={{
          fontSize: 34,
          fontWeight: "bold",
          color: "#111827",
        }}
      >
        🗼 TravelAI
      </Text>

      <Text
        style={{
          marginTop: 8,
          fontSize: 18,
          color: "#6B7280",
        }}
      >
        나만의 스마트 여행 플래너
      </Text>

      {!trip ? (
        <Pressable
          onPress={() => router.push("/trip/create")}
          style={{
            marginTop: 25,
            backgroundColor: "#3B82F6",
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 18,
              fontWeight: "bold",
            }}
          >
            + 새로운 여행 만들기
          </Text>
        </Pressable>
      ) : (
        <View
          style={{
            marginTop: 25,
            backgroundColor: "white",
            borderRadius: 18,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            ✈️ {trip.tripName}
          </Text>

          <Text
            style={{
              marginTop: 12,
              fontSize: 16,
              color: "#4B5563",
            }}
          >
            📍 {trip.country} · {trip.city}
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 16,
              color: "#4B5563",
            }}
          >
            📅 {trip.startDate} ~ {trip.endDate}
          </Text>

          <Text
            style={{
              marginTop: 8,
              fontSize: 16,
              color: "#4B5563",
            }}
          >
            👥 {trip.people}명
          </Text>

          <Pressable
            onPress={handleDeleteTrip}
            style={{
              marginTop: 20,
              backgroundColor: "#FEECEC",
              borderRadius: 12,
              paddingVertical: 13,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#DC2626",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              여행 삭제
            </Text>
          </Pressable>
        </View>
      )}

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
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          📅 오늘 일정
        </Text>

        <Text
          style={{
            marginTop: 10,
            color: "#777",
          }}
        >
          {trip
            ? "일정 탭에서 여행 일정을 확인할 수 있습니다."
            : "아직 일정이 없습니다."}
        </Text>
      </View>

      <View
        style={{
          marginTop: 20,
          backgroundColor: "white",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          💴 예산
        </Text>

        <Text
          style={{
            marginTop: 10,
            color: "#777",
          }}
        >
          {trip
            ? "지출 관리 기능을 연결할 예정입니다."
            : "여행을 생성하면 예산이 표시됩니다."}
        </Text>
      </View>

      <View
        style={{
          marginTop: 20,
          backgroundColor: "white",
          borderRadius: 16,
          padding: 20,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
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