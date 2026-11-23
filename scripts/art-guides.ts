/**
 * CLI: build the geographical reference package for an illustrated region.
 *
 *   npm run art:guides                                   every region in src/atlas/regions.ts
 *   npm run art:guides -- --region uchkeken-region
 *   npm run art:guides -- --user-layer my-layer.json     apply the player's marker moves / atlas edits
 *
 * Writes artwork-guides/<region>/{geography-guide.png, artwork-guide.png, region-manifest.json}.
 * Reads only the four authorized documents (through the same policy-checked reader as the importer)
 * to attach source references; it never lists the source directory and writes nothing there.
 *
 * The drawings are SVG; an installed Chromium browser (Edge or Chrome) rasterises them headlessly.
 * Set GUIDE_BROWSER to its path if it is not found. `--user-layer` takes a JSON file shaped like the
 * app's user layer: { "markerOverrides": { "location:slug": { "x": 1, "y": 2 } }, "atlas": { ... } }.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAuthorizedSources, resolveSourceDir } from '../server/readSources';
import { emptyAtlasEdits, resolveFeatures } from '../src/atlas/geography';
import { ART_REGIONS, regionPixelSize } from '../src/atlas/regions';
import { runImport } from '../src/importer';
import { normalizeUserLayer } from '../src/storage/userLayer';
import { artworkGuideSvg, buildManifest, classifyTerrain, gazetteerPlaces, geographyGuideSvg, pngSize, terrainPng } from './regionGuide';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

function findBrowser(): string | null {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean) as string[];
  const candidates = [
    process.env.GUIDE_BROWSER,
    ...pf.flatMap((p) => [join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome',
  ];
  return candidates.find((c) => c && existsSync(c)) ?? null;
}

const root = process.cwd();
const layerFile = arg('user-layer');
const layer = normalizeUserLayer(layerFile ? JSON.parse(await readFile(resolve(layerFile), 'utf8')) : null);
const features = resolveFeatures(layer.atlas ?? emptyAtlasEdits(), true);

// Source references: which lines of the authorized documents name each place.
const bundle = await readAuthorizedSources(resolveSourceDir(root));
const { world } = runImport(bundle.documents);
const blocks = new Map(world.blocks.map((b) => [b.id, b]));
const fileOf = new Map(world.sources.map((s) => [s.docId, s.fileName]));
const attested = new Set(world.geo.map((g) => g.id));
const places = gazetteerPlaces(layer.markerOverrides)
  .filter((p) => attested.has(`location:${p.slug}`))
  .map((p) => {
    const refs = (world.mentions[`location:${p.slug}`] ?? []).map((id) => blocks.get(id)).filter((b) => b !== undefined);
    return { ...p, mentionCount: refs.length, sources: refs.slice(0, 4).map((b) => ({ file: fileOf.get(b.docId) ?? b.docId, line: b.line, endLine: b.endLine })) };
  });
const provenance = {
  importerVersion: world.importerVersion,
  documents: world.sources.map((s) => ({ file: s.fileName, hash: s.hash })),
  userLayer: layerFile ? 'supplied with --user-layer' : 'none supplied: gazetteer positions and unedited atlas features',
};

const browser = findBrowser();
const only = arg('region');
const tmp = await mkdtemp(join(tmpdir(), 'thalorien-guides-'));
try {
  for (const region of ART_REGIONS.filter((r) => !only || r.id === only)) {
    const out = join(root, 'artwork-guides', region.id);
    await mkdir(out, { recursive: true });
    const size = regionPixelSize(region);
    console.log(`${region.id}: world x ${region.bounds.x0}..${region.bounds.x1}, y ${region.bounds.y0}..${region.bounds.y1} -> ${size.width} x ${size.height} px`);

    const raster = classifyTerrain(region, features);
    console.log('  terrain: ' + Object.entries(raster.coverage).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', '));
    await writeFile(join(tmp, 'terrain-geo.png'), terrainPng(raster, 'geo'));
    await writeFile(join(tmp, 'terrain-art.png'), terrainPng(raster, 'art'));

    const manifest = buildManifest(region, places, features, raster, provenance);
    await writeFile(join(out, 'region-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`  manifest: ${manifest.anchors.length} anchors, ${manifest.terrainRegions.length} terrain regions, ${manifest.ridgelines.length} ridgelines, ${manifest.rivers.length} rivers, ${manifest.proposedAdditions.length} proposed additions`);

    const drawings: [string, string][] = [
      ['geography-guide', geographyGuideSvg(region, places, features, raster, 'terrain-geo.png')],
      ['artwork-guide', artworkGuideSvg(region, places, features, 'terrain-art.png')],
    ];
    for (const [name, svg] of drawings) {
      const html = join(tmp, `${name}.html`);
      await writeFile(html, `<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;background:#fff">${svg}</body>`, 'utf8');
      if (!browser) {
        await writeFile(join(out, `${name}.svg`), svg, 'utf8');
        console.log(`  ${name}: no Edge/Chrome found (set GUIDE_BROWSER). Wrote the SVG only; the PNG was not produced.`);
        continue;
      }
      const png = join(out, `${name}.png`);
      await rm(png, { force: true });
      spawnSync(browser, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
        `--user-data-dir=${join(tmp, 'profile')}`, `--window-size=${size.width},${size.height}`, `--screenshot=${png}`,
        pathToFileURL(html).href,
      ], { stdio: 'ignore', timeout: 180_000 });
      if (!existsSync(png)) throw new Error(`${name}: the browser produced no screenshot`);
      const got = pngSize(await readFile(png));
      if (got.width !== size.width || got.height !== size.height) {
        throw new Error(`${name}: expected ${size.width} x ${size.height}, the browser wrote ${got.width} x ${got.height}`);
      }
      console.log(`  ${name}.png  ${got.width} x ${got.height}`);
    }
  }
} finally {
  await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => undefined);
}
