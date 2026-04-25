import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Configuración de Vite para StudyWeaver.
// - Plugin oficial de React (Fast Refresh).
// - Plugin oficial de Tailwind 4 (sin tailwind.config.js, los tokens viven en src/styles/index.css).
// - Alias '@' apuntando a src/ para imports cortos y refactor seguro.
// - Servidor en 5173 (debe coincidir con el origen permitido en DATA/cors.php).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
