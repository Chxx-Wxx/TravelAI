import { Pressable, ScrollView, Text, View } from "react-native";

export default function ScheduleScreen() {
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
          }}
        >
          📅 일정
        </Text>

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
            }}
          >
            아직 일정이 없습니다.
          </Text>

          <Text
            style={{
              marginTop: 10,
              color: "#666",
            }}
          >
            아래 버튼을 눌러 첫 일정을 추가해보세요.
          </Text>

          <Pressable
            style={{
              marginTop: 20,
              backgroundColor: "#3B82F6",
              borderRadius: 12,
              padding: 15,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                fontSize: 17,
              }}
            >
              + 일정 추가
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}