import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Backend porti backend/.env dagi PORT bilan mos bo'lishi kerak.
 * API_TARGET muhit o'zgaruvchisi bilan bekor qilinadi.
 */
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * /api so'rovlari backend'ga proksilanadi — brauzer uchun
     * hammasi bitta origin, cookie'li sessiya CORS'siz ishlaydi.
     */
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
});
