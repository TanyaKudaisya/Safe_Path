import axios from "axios";
import { API_BASE_URL } from "./Api";
import * as SecureStore from "expo-secure-store";

export const AuthService = {
  // ✅ SIGNUP
  signup: async (data: { name: string; email: string; password: string }) => {
    const response = await axios.post(`${API_BASE_URL}/auth/signup`, data);
    return response;
  },

  // ✅ LOGIN (FIXED)
  login: async (data: { email: string; password: string }) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, data);

      if (response.status === 200) {
        const token = response.data?.token;
        const user = response.data?.user;

        // 🔥 SAFETY CHECKS (VERY IMPORTANT)
        if (!token || !user) {
          throw new Error("Invalid login response");
        }

        // ✅ ALWAYS STORE AS STRING
        await SecureStore.setItemAsync("token", String(token));
        await SecureStore.setItemAsync("user_id", String(user._id));
        await SecureStore.setItemAsync("role", String(user.role));

        console.log("✅ Login successful, data stored");
      }

      return response;
    } catch (error: any) {
      console.log("❌ Login Error:", error?.response?.data || error.message);
      throw error;
    }
  },

  // ✅ UPDATE PROFILE
  updateProfile: async (
    data: { name: string; avatar: string },
    token: string
  ) => {
    try {
      const response = await axios.put(`${API_BASE_URL}/auth/update`, data, {
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