const diagnosticMode =
  process.env.EXPO_PUBLIC_STARTUP_DIAGNOSTIC_MODE;

console.info(
  `[TravelAI entry] mode=${diagnosticMode || "normal"}`
);

if (diagnosticMode === "entry") {
  const React = require("react");
  const { registerRootComponent } = require("expo");
  const { Text, View } = require("react-native");

  function EntryDiagnosticApp() {
    React.useEffect(() => {
      console.info("[TravelAI entry] diagnostic root mounted");
    }, []);

    return React.createElement(
      View,
      {
        style: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#F9FAFB",
        },
      },
      React.createElement(
        Text,
        {
          style: {
            color: "#111827",
            fontSize: 20,
            fontWeight: "700",
          },
        },
        "TravelAI 엔트리 진단"
      ),
      React.createElement(
        Text,
        {
          style: {
            marginTop: 10,
            color: "#4B5563",
            fontSize: 14,
            textAlign: "center",
          },
        },
        "Expo Router를 제외한 기본 React Native 화면이 마운트되었습니다."
      )
    );
  }

  registerRootComponent(EntryDiagnosticApp);
} else {
  require("expo-router/entry");
}
