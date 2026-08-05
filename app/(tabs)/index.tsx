import { router, useFocusEffect } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getTrip } from "../../lib/storage";

export default function HomeScreen() {
  const [trip, setTrip] = useState<any>(null);

  async function loadTrip() {
    const data = await getTrip();
    setTrip(data);
  }

  useFocusEffect(() => {
    loadTrip();
  });

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: "#F5F7FB",
      }}
    >
      <View
        style={{
          paddingTop: 70,
          paddingHorizontal: 20,
          paddingBottom: 30,
        }}
      >
        <Text
          style={{
            fontSize: 34,
            fontWeight: "bold",
          }}
        >
          🗼 TravelAI
        </Text>

        <Text
          style={{
            marginTop: 8,
            fontSize: 18,
            color: "#666",
          }}
        >
          나만의 스마트 여행 플래너
        </Text>

        {!trip && (
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
        )}

        {trip && (
          <View
            style={{
              marginTop: 25,
              backgroundColor: "white",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 24, fontWeight: "bold" }}>
              ✈️ {trip.tripName}
            </Text>

            <Text style={{ marginTop: 8 }}>
              📍 {trip.country} · {trip.city}
            </Text>

            <Text style={{ marginTop: 8 }}>
              📅 {trip.startDate} ~ {trip.endDate}
            </Text>

            <Text style={{ marginTop: 8 }}>
              👥 {trip.people}명
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}