import { Tabs, useRouter } from "expo-router";
import React, { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { registerForPush } from "@/services/PushNotifications";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    // register this phone for push (no-op when logged out / on an emulator)
    registerForPush();

    // tapping a notification opens the user's report list
    const open = () => router.push("/reportHistory" as any);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) open();
      })
      .catch(() => {});
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="account" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
