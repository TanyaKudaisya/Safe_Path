import { api } from "./Api";
import * as SecureStore from "expo-secure-store";
import { registerForPush } from "./PushNotifications";

export const AuthService = {
  // ✅ SIGNUP
  signup: async (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => {
    const response = await api.post("/auth/signup", data);
    return response;
  },

  // ✅ LOGIN (FIXED)
  login: async (data: { email: string; password: string }) => {
    try {
      const response = await api.post("/auth/login", data);

      if (response.status === 200) {
        // Spring backend returns a flat body: { id, name, email, avatar, role, token }
        const { token, ...user } = response.data ?? {};

        if (!token || !user.id) {
          throw new Error("Invalid login response");
        }

        await SecureStore.setItemAsync("token", String(token));
        await SecureStore.setItemAsync("user_id", String(user.id));
        await SecureStore.setItemAsync("role", String(user.role));

        // Re-shape so callers keep using response.data.token / response.data.user
        response.data = { token, user };

        console.log("✅ Login successful, data stored");

        // fire-and-forget: ask for notification permission + register this phone
        registerForPush();
      }

      return response;
    } catch (error: any) {
      console.log("❌ Login Error:", error?.response?.data || error.message);
      throw error;
    }
  },

  // ✅ FORGOT PASSWORD: emails a 6-digit code (same answer whether or not the email exists)
  forgotPassword: async (email: string) => {
    return api.post("/auth/forgot-password", { email });
  },

  // ✅ RESET PASSWORD with the emailed code
  resetPassword: async (data: {
    email: string;
    code: string;
    newPassword: string;
  }) => {
    return api.post("/auth/reset-password", data);
  },

  // ✅ UPDATE PROFILE
  updateProfile: async (
    data: { name: string; avatar: string; phone?: string },
    token: string
  ) => {
    try {
      const response = await api.put("/auth/update", data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response;
    } catch (error: any) {
      console.log("❌ Update Profile Error:", error?.response?.data || error.message);
      throw error;
    }
  },

  // ✅ GET TOKEN
  getToken: async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      console.log("TOKEN:", token); // 🔍 debug
      return token;
    } catch (error) {
      console.log("Error getting token:", error);
      return null;
    }
  },

  // ✅ CLEAR TOKEN
  clearToken: async () => {
    await SecureStore.deleteItemAsync("token");
  },

  // ✅ GET USER ID
  getUserId: async () => {
    return await SecureStore.getItemAsync("user_id");
  },

  // ✅ CLEAR USER ID
  clearUserId: async () => {
    await SecureStore.deleteItemAsync("user_id");
  },

  // ✅ GET ROLE (NEW)
  getRole: async () => {
    return await SecureStore.getItemAsync("role");
  },

  // ✅ CLEAR ALL (BEST FOR DEBUG)
  clearAll: async () => {
    await SecureStore.deleteItemAsync("token");
    await SecureStore.deleteItemAsync("user_id");
    await SecureStore.deleteItemAsync("role");
  },
};