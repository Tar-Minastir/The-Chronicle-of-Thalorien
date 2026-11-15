import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { campaignSourcesPlugin } from './server/sourcesPlugin.ts';

export default defineConfig({
  plugins: [react(), campaignSourcesPlugin()],
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
