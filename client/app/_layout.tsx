import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, usePathname, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { SnackbarProvider } from "@/context/SnackbarContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem("token");

      // allow login & signup without token
      if (!token && pathname !== "/login" && pathname !== "/signup") {
        router.replace("/login");
      }

      setIsLoggedIn(!!token);
    };

    checkAuth();
  }, [pathname]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SnackbarProvider>
        <Stack screenOptions={{ headerShown: false }}>
          {isLoggedIn && (
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          )}
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="report" />
          <Stack.Screen name="registerReport" />
          <Stack.Screen name="reportHistory" />
          <Stack.Screen name="nearbyPotholes" />
          <Stack.Screen name="realtimeDetection" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </SnackbarProvider>
    </ThemeProvider>
  );
}
