import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes("firebase/app") ||
            id.includes("firebase/auth") ||
            id.includes("firebase/firestore") ||
            id.includes("firebase/analytics")
          )
            return "firebase";
        },
      },
    },
  },
});
