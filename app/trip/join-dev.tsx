import {
  useRef,
  useState,
} from "react";

import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  Redirect,
  Stack,
  router,
} from "expo-router";

import AppButton from "../../components/AppButton";

import {
  joinTripAsMember,
} from "../../services/join-trip";

export default function JoinTripDevScreen() {
  const [tripId, setTripId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  async function handleJoin() {
    if (joiningRef.current) {
      return;
    }

    if (!tripId.trim() || !memberId.trim()) {
      Alert.alert(
        "입력 확인",
        "tripId와 placeholder memberId를 입력해주세요."
      );
      return;
    }

    joiningRef.current = true;
    setJoining(true);

    try {
      const result = await joinTripAsMember(
        tripId,
        memberId
      );

      Alert.alert(
        "참여 완료",
        `${result.trip.tripName}의 ${result.member.displayName} 멤버로 연결되었습니다.`,
        [
          {
            text: "확인",
            onPress: () => router.replace("/"),
          },
        ]
      );
    } catch (error) {
      console.error("여행 참여 실패:", error);
      Alert.alert(
        "여행 참여 실패",
        error instanceof Error
          ? error.message
          : "여행 멤버를 연결하지 못했습니다."
      );
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: "#F5F7FB",
      }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: 32,
      }}
    >
      <Stack.Screen
        options={{ title: "개발용 여행 참여" }}
      />

      <Text
        style={{
          color: "#111827",
          fontSize: 28,
          fontWeight: "bold",
        }}
      >
        여행 멤버 연결 테스트
      </Text>

      <Text
        style={{
          marginTop: 10,
          color: "#6B7280",
          lineHeight: 21,
        }}
      >
        개발 빌드에서만 보이는 임시 화면입니다. 기존 여행의 tripId와
        placeholder memberId를 입력하세요.
      </Text>

      <View style={{ marginTop: 28 }}>
        <TextInput
          value={tripId}
          onChangeText={setTripId}
          editable={!joining}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="tripId"
          placeholderTextColor="#9CA3AF"
          style={{
            backgroundColor: "white",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
            fontSize: 16,
          }}
        />

        <TextInput
          value={memberId}
          onChangeText={setMemberId}
          editable={!joining}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="placeholder memberId"
          placeholderTextColor="#9CA3AF"
          style={{
            marginTop: 12,
            backgroundColor: "white",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
            fontSize: 16,
          }}
        />
      </View>

      <View style={{ marginTop: 22 }}>
        <AppButton
          title={joining ? "참여 중..." : "멤버로 참여"}
          onPress={handleJoin}
          disabled={joining}
        />
      </View>
    </ScrollView>
  );
}
