import { Pressable, Text } from "react-native";

type Props = {
  title: string;
  onPress: () => void;
};

export default function AppButton({ title, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "#3B82F6",
        paddingVertical: 15,
        borderRadius: 14,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 17,
          fontWeight: "bold",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}