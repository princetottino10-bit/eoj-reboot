import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: parseInt(process.env.PORT || '5173'),
    strictPort: false,
  },
});
