import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

// Keep the splash visible until the Candle fonts are ready — RN does not
// synthesize weights for custom faces, so the UI depends on these being loaded.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Family names must match `CandleFontFamilies` in `constants/theme.ts`.
    Inter: Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Geist Mono': GeistMono_400Regular,
    'Geist Mono-Medium': GeistMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="model-picker" />
          <Stack.Screen name="connection-lost" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="files" />
          <Stack.Screen name="skills" />
          <Stack.Screen name="skill-detail" />
          <Stack.Screen name="skill-suggestions" />
          <Stack.Screen name="mcp-servers" />
          <Stack.Screen name="add-mcp-server" />
          <Stack.Screen name="tasks" />
          <Stack.Screen name="new-task" />
          <Stack.Screen name="approval" />
          <Stack.Screen name="clarification" />
          <Stack.Screen name="memory" />
          <Stack.Screen name="artifact-viewer" />
          <Stack.Screen name="virtual-computer" />
          <Stack.Screen name="session-drawer" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="voice" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
