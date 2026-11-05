import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useEffect } from "react";

import { logStartup } from "../../lib/startup-diagnostics";

logStartup("tabs.module-evaluated");

export default function TabLayout() {
  useEffect(() => {
    logStartup("tabs.mounted");

    return () => {
      logStartup("tabs.unmounted");
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#3B82F6",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          height: 65,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: "일정",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="calendar"
              size={size}
              color={typeof color === "number" ? undefined : color ?? undefined}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title: "지도",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="map"
              size={size}
              color={typeof color === "number" ? undefined : color ?? undefined}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="home"
              size={size}
              color={typeof color === "number" ? undefined : color ?? undefined}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="expense"
        options={{
          title: "지출",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="wallet"
              size={size}
              color={typeof color === "number" ? undefined : color ?? undefined}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="sparkles"
              size={size}
              color={typeof color === "number" ? undefined : color ?? undefined}
            />
          ),
        }}
      />
    </Tabs>
  );
}
