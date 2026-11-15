/**
 * Vite plugin: exposes GET /__campaign/sources in `vite dev` and `vite preview`.
 * It returns the four authorized documents (and nothing else) so the app's
 * "Sync from disk" button can re-import after the Markdown files are edited.
 * Local-only: it is served by the local dev/preview server, never bundled.
 */
import type { Connect, Plugin } from 'vite';
import { readAuthorizedSources, resolveSourceDir } from './readSources.ts';

export const SOURCES_ENDPOINT = '/__campaign/sources';

export function campaignSourcesPlugin(): Plugin {
  let root = process.cwd();
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== SOURCES_ENDPOINT) return next();
    readAuthorizedSources(resolveSourceDir(root))
      .then((bundle) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(bundle));
      })
      .catch((err: unknown) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      });
  };
  return {
    name: 'campaign-sources',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
