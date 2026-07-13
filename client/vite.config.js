import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 5173; the API base URL is read from VITE_API_URL (see .env.example).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
