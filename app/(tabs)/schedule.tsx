import { Text, View } from "react-native";

export default function ScheduleScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: "bold" }}>
        📅 일정
      </Text>
    </View>
  );
}