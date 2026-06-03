import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project page at https://gstranger.github.io/graffiti/ needs assets
// resolved under /graffiti/. Local dev keeps base='/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/graffiti/' : '/',
  plugins: [react()],
}));
