import {
    router,
    useLocalSearchParams,
} from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    Text,
    View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import {
    getSchedule,
    updateSchedule,
} from "../../lib/storage";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(true);

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
      setDate(schedule.date);
      setTime(schedule.time);
      setLoading(false);
    }

    loadSchedule();
  }, [id]);

  async function handleUpdate() {
    if (!id) return;

    if (!title || !location || !date || !time) {
      Alert.alert("알림", "모든 항목을 입력해주세요.");
      return;
    }

    await updateSchedule({
      id,
      title,
      location,
      date,
      time,
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
          title="수정 내용 저장"
          onPress={handleUpdate}
        />
      </View>
    </ScrollView>
  );
}