import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Na GitHub Pages běží aplikace na podadrese /albion-kalkulacka/.
  // Lokální vývoj i lokální build zůstávají na "/".
  base: process.env.GITHUB_ACTIONS ? "/albion-kalkulacka/" : "/",
  plugins: [react()],
  server: { port: 5180 },
  build: {
    // Herní data jsou 3,4 MB v jednom JSON. Vite by na to jinak nadával.
    chunkSizeWarningLimit: 4000,
  },
});
