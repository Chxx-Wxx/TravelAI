import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  logStartup,
  STARTUP_DIAGNOSTIC_MODE,
} from '@/lib/startup-diagnostics';

logStartup('root.module-evaluated', {
  diagnosticMode: STARTUP_DIAGNOSTIC_MODE,
});

export const unstable_settings = {
  anchor: '(tabs)',
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logStartup('root.javascript-error-boundary', {
      errorName: error.name,
      message: error.message.slice(0, 240),
    });
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#F9FAFB',
      }}
    >
      <Text
        style={{
          color: '#111827',
          fontSize: 20,
          fontWeight: '700',
        }}
      >
        앱 화면을 불러오지 못했습니다.
      </Text>
      <Text
        selectable
        style={{
          marginTop: 12,
          color: '#4B5563',
          fontSize: 14,
          lineHeight: 21,
        }}
      >
        {error.message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={retry}
        style={{
          alignSelf: 'flex-start',
          marginTop: 20,
          minHeight: 44,
          justifyContent: 'center',
          borderRadius: 6,
          backgroundColor: '#2563EB',
          paddingHorizontal: 18,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
          다시 시도
        </Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    logStartup('root.mounted', {
      diagnosticMode: STARTUP_DIAGNOSTIC_MODE,
    });

    return () => {
      logStartup('root.unmounted');
    };
  }, []);

  if (STARTUP_DIAGNOSTIC_MODE === 'shell') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#F9FAFB',
        }}
      >
        <Text
          style={{
            color: '#111827',
            fontSize: 20,
            fontWeight: '700',
          }}
        >
          TravelAI 진단 셸
        </Text>
        <Text
          style={{
            marginTop: 10,
            color: '#4B5563',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          루트 React Native 화면이 정상적으로 마운트되었습니다.
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
