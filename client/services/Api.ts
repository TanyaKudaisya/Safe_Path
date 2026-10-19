import axios from "axios";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

// Address of the Spring Boot backend (port 8080).
// Override per machine with EXPO_PUBLIC_BACKEND_URL in client/.env,
// e.g. EXPO_PUBLIC_BACKEND_URL=http://192.168.1.29:8080
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://192.168.29.98:8080";



export const API_BASE_URL = `${BACKEND_URL}/api`;
export const STATIC_FILES_URL = BACKEND_URL;

console.log("BACKEND_URL =", BACKEND_URL);
console.log("API_BASE_URL =", API_BASE_URL);

// Realtime detection goes through the Java backend, which bridges to the YOLO service.
export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ?? `${BACKEND_URL.replace(/^http/, "ws")}/ws`;

export const GOOGLE_MAPS_API_KEY = "";

// Shared axios client: automatically attaches the JWT as a Bearer token.
export const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Photos are now Cloudinary URLs (absolute). Older reports may hold a relative path.
export const resolvePhotoUrl = (photo?: string | null): string | undefined => {
  if (!photo) return undefined;
  if (/^https?:\/\//i.test(photo)) return photo;
  return `${STATIC_FILES_URL}/${photo.replace(/^\/+/, "")}`;
};

// Spring's default error body is { status, error: "Internal Server Error", ... },
// so only trust an explicit message and otherwise fall back to a friendly text.
export const getErrorMessage = (error: any, fallback: string): string => {
  const data = error?.response?.data;
  const msg = (typeof data === "string" ? data : data?.message) as
    | string
    | undefined;
  if (msg && msg.trim()) return msg;
  const status = error?.response?.status;
  if (status === 401 || status === 403) return "Not authorised. Please log in again.";
  if (!error?.response) return "Cannot reach the server. Check your connection.";
  return fallback;
};

// ---- Expired / invalid token handling --------------------------------------
// The backend ignores an expired JWT and answers 403 as if you were logged out.
// If that happens, clear the saved login and send the user to the login screen.
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" && exp * 1000 <= Date.now();
  } catch {
    return true; // unreadable token -> treat as invalid
  }
};

let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    const isAuthCall = url.includes("/auth/");

    if ((status === 401 || status === 403) && !isAuthCall) {
      const token = await SecureStore.getItemAsync("token");
      // A 403 with a still-valid token means "not allowed" (e.g. not admin) -> keep session
      if (isTokenExpired(token) && !redirectingToLogin) {
        redirectingToLogin = true;
        try {
          await SecureStore.deleteItemAsync("token");
          await SecureStore.deleteItemAsync("user_id");
          await SecureStore.deleteItemAsync("role");
          await AsyncStorage.multiRemove(["token", "user"]);
          router.replace("/login");
        } finally {
          setTimeout(() => (redirectingToLogin = false), 1500);
        }
      }
    }
    return Promise.reject(error);
  }
);