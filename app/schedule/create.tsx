import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import {
    getSchedules,
    getTrip,
    saveSchedules,
} from "../../lib/storage";
import { Schedule } from "../../types";

export default function CreateScheduleScreen() {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  function formatDate(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function formatTime(value: Date) {
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
  }

  function parseDateString(value: string) {
    const trimmed = value.trim();
    const [year, month, day] = trimmed.split("-").map(Number);

    if (!year || !month || !day) {
      return null;
    }

    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);

    return parsed;
  }

  function handleDateChange(
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event.type === "dismissed") {
      return;
    }

    if (selectedDate) {
      setDate(selectedDate);
    }
  }

  function handleTimeChange(
    event: DateTimePickerEvent,
    selectedTime?: Date
  ) {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }

    if (event.type === "dismissed") {
      return;
    }

    if (selectedTime) {
      setTime(selectedTime);
    }
  }

  async function handleSave() {
    if (!title.trim() || !location.trim()) {
      Alert.alert("알림", "일정 이름과 장소를 입력해주세요.");
      return;
    }

    const trip = await getTrip();

    if (!trip) {
      Alert.alert(
        "여행 정보 없음",
        "먼저 여행을 생성해주세요."
      );
      return;
    }

    const tripStart = parseDateString(trip.startDate);
    const tripEnd = parseDateString(trip.endDate);

    if (!tripStart || !tripEnd) {
      Alert.alert(
        "여행 날짜 오류",
        "여행 시작일 또는 종료일이 올바르지 않습니다. 여행을 다시 생성해주세요."
      );
      return;
    }

    const selectedDateObject = new Date(date);
    selectedDateObject.setHours(0, 0, 0, 0);

    if (
      selectedDateObject < tripStart ||
      selectedDateObject > tripEnd
    ) {
      Alert.alert(
        "여행 기간 확인",
        `일정은 ${trip.startDate}부터 ${trip.endDate} 사이에만 추가할 수 있습니다.`
      );
      return;
    }

    const newSchedule: Schedule = {
      id: Date.now().toString(),
      title: title.trim(),
      location: location.trim(),
      date: formatDate(date),
      time: formatTime(time),
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
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 70,
        paddingBottom: 60,
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

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#374151",
        }}
      >
        날짜
      </Text>

      <Pressable
        onPress={() => setShowDatePicker(true)}
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 15,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            color: "#111827",
          }}
        >
          📅 {formatDate(date)}
        </Text>
      </Pressable>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant="light"
          textColor="#111827"
          onChange={handleDateChange}
        />
      )}

      {Platform.OS === "ios" && showDatePicker && (
        <Pressable
          onPress={() => setShowDatePicker(false)}
          style={{
            alignSelf: "flex-end",
            marginBottom: 15,
          }}
        >
          <Text
            style={{
              color: "#2563EB",
              fontWeight: "bold",
            }}
          >
            날짜 선택 완료
          </Text>
        </Pressable>
      )}

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#374151",
        }}
      >
        시간
      </Text>

      <Pressable
        onPress={() => setShowTimePicker(true)}
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 15,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            color: "#111827",
          }}
        >
          🕐 {formatTime(time)}
        </Text>
      </Pressable>

      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          is24Hour={true}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          themeVariant="light"
          textColor="#111827"
          onChange={handleTimeChange}
        />
      )}

      {Platform.OS === "ios" && showTimePicker && (
        <Pressable
          onPress={() => setShowTimePicker(false)}
          style={{
            alignSelf: "flex-end",
            marginBottom: 25,
          }}
        >
          <Text
            style={{
              color: "#2563EB",
              fontWeight: "bold",
            }}
          >
            시간 선택 완료
          </Text>
        </Pressable>
      )}

      <View style={{ marginTop: 10 }}>
        <AppButton
          title="일정 저장"
          onPress={handleSave}
        />
      </View>
    </ScrollView>
  );
}