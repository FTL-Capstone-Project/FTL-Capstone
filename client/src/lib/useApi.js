// ============================================================
// useApi() — returns the api client with the Clerk session token
// automatically attached. Components call:
//   const api = useApi();
//   const data = await api.get("/api/history?mine=1");
// …and never touch tokens or fetch() directly.
// ============================================================
import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";
import { api } from "./api.js";

export const useApi = () => {
  const { getToken } = useAuth();
  return useMemo(
    () => ({
      get: (path) => api.get(path, { getToken }),
      post: (path, body) => api.post(path, body, { getToken }),
      patch: (path, body) => api.patch(path, body, { getToken }),
    }),
    [getToken]
  );
}
