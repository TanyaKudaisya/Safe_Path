import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./Api";

// Show alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission, gets this phone's Expo push token and gives it to the backend.
 * Safe to call as often as you like; it never throws (push is a nice-to-have).
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // emulators cannot receive push

    const jwt = await SecureStore.getItemAsync("token");
    if (!jwt) return null; // not logged in

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Report updates",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const result = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const token = result.data;
    await api.post("/auth/push-token", { token });
    await SecureStore.setItemAsync("push_token", token);
    return token;
  } catch (e: any) {
    console.log("Push registration skipped:", e?.message ?? e);
    return null;
  }
}

/** Call BEFORE the login token is cleared, so this phone stops getting this user's alerts. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync("push_token");
    if (token) {
      await api.post("/auth/push-token/remove", { token });
      await SecureStore.deleteItemAsync("push_token");
    }
  } catch (e: any) {
    console.log("Push unregister skipped:", e?.message ?? e);
  }
}
