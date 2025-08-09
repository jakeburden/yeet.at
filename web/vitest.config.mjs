import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["**/__tests__/**/*.test.{js,jsx}", "**/?(*.)+(spec|test).{js,jsx}"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
});


