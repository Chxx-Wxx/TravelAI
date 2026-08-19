import { TextInput } from "react-native";

type Props = {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: "default" | "numeric";
};

export default function AppInput({
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
}: Props) {
  return (
    <TextInput
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      selectionColor="#3B82F6"
      style={{
        backgroundColor: "white",
        color: "#111827",
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        fontSize: 16,
      }}
    />
  );
}