import DateTimePicker, {
    DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
    router,
    useLocalSearchParams,
} from "expo-router";
import { useEffect, useState } from "react";
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
    getSchedule,
    getTrip,
    updateSchedule,
} from "../../lib/storage";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [loading, setLoading] = useState(true);

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

  function parseDate(dateString: string) {
    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day);
  }

  function parseTime(timeString: string) {
    const [hour, minute] = timeString.split(":").map(Number);

    const value = new Date();
    value.setHours(hour, minute, 0, 0);

    return value;
  }

  useEffect(() => {
    async function loadSchedule() {
      if (!id) {
        setLoading(false);
        return;
      }

      const schedule = await getSchedule(id);

      if (!schedule) {
        Alert.alert("오류", "일정을 찾을 수 없습니다.", [
          {
            text: "확인",
            onPress: () => router.back(),
          },
        ]);

        return;
      }

      setTitle(schedule.title);
      setLocation(schedule.location);
      setDate(parseDate(schedule.date));
      setTime(parseTime(schedule.time));

      setLoading(false);
    }

    loadSchedule();
  }, [id]);

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

  async function handleUpdate() {
    if (!id) return;

    if (!title.trim() || !location.trim()) {
      Alert.alert("알림", "일정 이름과 장소를 입력해주세요.");
      return;
    }

    const trip = await getTrip();

    if (!trip) {
      Alert.alert("여행 정보 없음", "먼저 여행을 생성해주세요.");
      return;
    }

    const tripStart = parseDate(trip.startDate);
    const tripEnd = parseDate(trip.endDate);

    tripStart.setHours(0, 0, 0, 0);
    tripEnd.setHours(0, 0, 0, 0);

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    if (
      selectedDate < tripStart ||
      selectedDate > tripEnd
    ) {
      Alert.alert(
        "여행 기간 확인",
        `일정은 ${trip.startDate}부터 ${trip.endDate} 사이에만 설정할 수 있습니다.`
      );
      return;
    }

    await updateSchedule({
      id,
      title: title.trim(),
      location: location.trim(),
      date: formatDate(date),
      time: formatTime(time),
    });

    Alert.alert("완료", "일정이 수정되었습니다.", [
      {
        text: "확인",
        onPress: () => router.back(),
      },
    ]);
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#F5F7FB",
        }}
      >
        <Text>일정을 불러오는 중...</Text>
      </View>
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
        일정 수정
      </Text>

      <AppInput
        placeholder="일정 이름"
        value={title}
        onChangeText={setTitle}
      />

      <AppInput
        placeholder="장소"
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
          title="수정 내용 저장"
          onPress={handleUpdate}
        />
      </View>
    </ScrollView>
  );
}