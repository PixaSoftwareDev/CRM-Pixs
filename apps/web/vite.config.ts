import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // En el VPS la app se sirve bajo /crm (BASE_PATH=/crm/ al compilar).
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // La API (Fastify) corre aparte; en desarrollo se le habla por el mismo origen.
    proxy: { "/api": "http://localhost:3001" },
  },
});
