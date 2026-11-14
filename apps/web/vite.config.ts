import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // En el VPS la app se sirve bajo /crm (BASE_PATH=/crm/ al compilar).
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    // La API (Fastify) corre aparte; en desarrollo se le habla por el mismo origen.
    // API_PROXY permite apuntar a otra API (p. ej. un segundo checkout en otro puerto).
    proxy: { "/api": process.env.API_PROXY ?? "http://localhost:3001" },
  },
});
