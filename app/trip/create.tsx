import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { saveTrip } from "../../lib/storage";

export default function CreateTripScreen() {
  const [tripName, setTripName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [people, setPeople] = useState("");

  async function handleSave() {
    if (!tripName || !country || !city) {
      Alert.alert("알림", "필수 정보를 입력해주세요.");
      return;
    }

    const trip = {
      tripName,
      country,
      city,
      startDate,
      endDate,
      people,
    };

    await saveTrip(trip);

    Alert.alert("완료", "여행이 저장되었습니다.");

    router.replace("/");
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: "#F5F7FB",
      }}
    >
      <View
        style={{
          padding: 20,
          paddingTop: 70,
        }}
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight: "bold",
            marginBottom: 30,
          }}
        >
          ✈️ 여행 만들기
        </Text>

        <TextInput
          placeholder="여행 이름"
          value={tripName}
          onChangeText={setTripName}
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <TextInput
          placeholder="국가"
          value={country}
          onChangeText={setCountry}
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <TextInput
          placeholder="도시"
          value={city}
          onChangeText={setCity}
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <TextInput
          placeholder="시작일 (예: 2027-02-13)"
          value={startDate}
          onChangeText={setStartDate}
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <TextInput
          placeholder="종료일 (예: 2027-02-16)"
          value={endDate}
          onChangeText={setEndDate}
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <TextInput
          placeholder="인원"
          value={people}
          onChangeText={setPeople}
          keyboardType="numeric"
          style={input}
          placeholderTextColor="#9CA3AF"
        />

        <Pressable
          onPress={handleSave}
          style={{
            marginTop: 20,
            backgroundColor: "#3B82F6",
            padding: 16,
            borderRadius: 14,
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
            여행 저장
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const input = {
  backgroundColor: "white",
  color: "#111827",
  padding: 15,
  borderRadius: 12,
  marginBottom: 15,
  fontSize: 16,
};