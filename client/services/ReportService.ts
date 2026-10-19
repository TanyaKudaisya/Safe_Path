import { api } from "./Api";

export const ReportService = {
  // Requires login: the backend reads the user from the JWT (no user_id field any more).
  registerReport: async (data: FormData) => {
    const response = await api.post("/report/register", data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response;
  },

  getReportsByUserId: async (user_id: string | null) => {
    const response = await api.get(`/report/user/${user_id}`);
    return response;
  },

  // Any logged-in user can list reports (home map + nearby potholes use this).
  getAllReports: async () => {
    const response = await api.get("/report");
    return response.data;
  },

  // ADMIN functions (ROLE_ADMIN)
  deleteReport: async (id: string) => {
    await api.delete(`/report/${id}`);
  },

  resolveReport: async (id: string) => {
    await api.put(`/report/${id}/resolve`, {});
  },
};
