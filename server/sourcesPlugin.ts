/**
 * Vite plugin: exposes GET /__campaign/sources in `vite dev` and `vite preview`.
 * It returns the four authorized documents (and nothing else) so the app's
 * "Sync from disk" button can re-import after the Markdown files are edited.
 *
 * Hosted builds (GitHub Pages) have no server, so with `bundleSources: true` the same
 * bundle is emitted as the static file `campaign-sources.json`, which the app reads
 * instead. Off by default: an ordinary `vite build` never contains the documents.
 */
import type { Connect, Plugin } from 'vite';
import { readAuthorizedSources, resolveSourceDir } from './readSources.ts';

export const SOURCES_ENDPOINT = '/__campaign/sources';
export const BUNDLED_SOURCES_FILE = 'campaign-sources.json';

export function campaignSourcesPlugin(options: { bundleSources?: boolean } = {}): Plugin {
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
    async generateBundle() {
      if (!options.bundleSources) return;
      const bundle = await readAuthorizedSources(resolveSourceDir(root));
      this.emitFile({ type: 'asset', fileName: BUNDLED_SOURCES_FILE, source: JSON.stringify(bundle) });
    },
  };
}
