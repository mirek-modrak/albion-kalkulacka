import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    // Herní data jsou 3,4 MB v jednom JSON. Vite by na to jinak nadával.
    chunkSizeWarningLimit: 4000,
  },
});
