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
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      style={{
        backgroundColor: "white",
        padding: 15,
        borderRadius: 12,
        marginBottom: 15,
        fontSize: 16,
      }}
    />
  );
}