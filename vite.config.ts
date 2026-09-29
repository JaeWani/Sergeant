import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub project Pages is served below the repository name, while local
  // development remains available from the root URL.
  base: mode === 'github-pages' ? '/Sergeant/' : '/',
}));
