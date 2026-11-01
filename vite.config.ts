import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the build works from a GitHub Pages sub-path (/voidspark/).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
