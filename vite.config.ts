import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { campaignSourcesPlugin } from './server/sourcesPlugin.ts';

// GitHub Pages build (set by .github/workflows/pages.yml): the site lives under /<repository>/ and, having no
// server, carries the four campaign documents as a static file. Local dev and ordinary builds are unchanged.
const pagesBase = process.env.PAGES_BASE;

export default defineConfig({
  base: pagesBase ?? '/',
  plugins: [react(), campaignSourcesPlugin({ bundleSources: Boolean(pagesBase) })],
  // 127.0.0.1, not "localhost": on this machine Vite otherwise listens on IPv6 (::1) only, and browsers that
  // try 127.0.0.1 for "localhost" get "connection refused". Local-only either way; nothing is exposed to the network.
  server: { port: 5173, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
