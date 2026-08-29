import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // Explicitly ignore database JSON files, backups, and runtime logs from triggering page reloads
        ignored: [
          '**/data.json',
          '**/data-test.json',
          '**/data-seed.json',
          '**/data*.json',
          '**/backups/**',
          '**/*.log',
          '**/cookies*.txt',
          '**/.system_generated/**',
        ],
      },
    },
  };
});
