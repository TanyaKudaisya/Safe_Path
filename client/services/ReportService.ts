import axios from "axios";
import { API_BASE_URL } from "./Api";
import { AuthService } from "./AuthService";

export const ReportService = {
  registerReport: async (data: FormData) => {
    const response = await axios.post(`${API_BASE_URL}/report/register`, data, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response;
  },

  getReportsByUserId: async (user_id: string | null) => {
    const response = await axios.get(`${API_BASE_URL}/report/user/${user_id}`);
    return response;
  },

  // ✅ ADMIN FUNCTIONS
  getAllReports: async () => {
    const token = await AuthService.getToken();
    const response = await axios.get(`${API_BASE_URL}/report`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  },

  deleteReport: async (id: string) => {
    const token = await AuthService.getToken();
    await axios.delete(`${API_BASE_URL}/report/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  resolveReport: async (id: string) => {
    const token = await AuthService.getToken();
    await axios.put(
      `${API_BASE_URL}/report/${id}/resolve`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  },
};