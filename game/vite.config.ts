import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/analytics",
          ],
        },
      },
    },
  },
});
