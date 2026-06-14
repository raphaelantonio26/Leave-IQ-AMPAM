import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Split the heavy vendor libraries into separate, individually-cacheable chunks
// instead of one ~2.1 MB bundle, so field devices on weak connections fetch them
// in parallel and re-use cache across deploys. Paired with route-level lazy
// loading (App.jsx) so a route's own code + route-only deps (e.g. xlsx via the
// ADP import page) aren't fetched until that route is opened.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"],
          pdf: ["jspdf", "jszip"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
          icons: ["lucide-react"],
          xlsx: ["xlsx"],
        },
      },
    },
  },
});
