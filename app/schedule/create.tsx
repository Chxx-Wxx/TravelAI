import { useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import { getSchedules, saveSchedules } from "../../lib/storage";
import { Schedule } from "../../types";

export default function CreateScheduleScreen() {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  async function handleSave() {
    if (!title || !location || !date || !time) {
      Alert.alert("알림", "모든 항목을 입력해주세요.");
      return;
    }

    const newSchedule: Schedule = {
      id: Date.now().toString(),
      title,
      location,
      date,
      time,
    };

    const schedules = await getSchedules();

    await saveSchedules([...schedules, newSchedule]);

    Alert.alert("완료", "일정이 저장되었습니다.", [
      {
        text: "확인",
        onPress: () => router.replace("/schedule"),
      },
    ]);
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
          paddingHorizontal: 20,
          paddingTop: 70,
          paddingBottom: 40,
        }}
      >
        <Text
          style={{
            fontSize: 32,
            fontWeight: "bold",
            marginBottom: 30,
          }}
        >
          일정 추가
        </Text>

        <AppInput
          placeholder="일정 이름 (예: 센소지 관광)"
          value={title}
          onChangeText={setTitle}
        />

        <AppInput
          placeholder="장소 (예: 아사쿠사 센소지)"
          value={location}
          onChangeText={setLocation}
        />

        <AppInput
          placeholder="날짜 (예: 2027-02-13)"
          value={date}
          onChangeText={setDate}
        />

        <AppInput
          placeholder="시간 (예: 10:30)"
          value={time}
          onChangeText={setTime}
        />

        <AppButton
          title="일정 저장"
          onPress={handleSave}
        />
      </View>
    </ScrollView>
  );
}