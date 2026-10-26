import { defineConfig,loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { validCrmBackend } from "./src/lib/backend-config";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = {...loadEnv(mode, process.cwd(), "VITE_"), ...process.env};
  if ((mode === "deployment" || env.VITE_SUPABASE_PUBLISHABLE_KEY) && !validCrmBackend(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, env.VITE_CRM_ENVIRONMENT)) {
    throw new Error("Configure um ambiente dedicado com URL válida e chave pública Supabase. Chaves privilegiadas não podem entrar no frontend.");
  }
  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
});
