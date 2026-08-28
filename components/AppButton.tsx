import { Pressable, Text } from "react-native";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
};

export default function AppButton({
  title,
  onPress,
  disabled = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: "#3B82F6",
        paddingVertical: 15,
        borderRadius: 14,
        alignItems: "center",
        opacity: disabled ? 0.6 : 1,
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
