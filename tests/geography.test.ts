/**
 * Milestone 2B: painted geography. Pins down (a) that atlas features never contradict or masquerade as
 * canon, (b) that the terrain fields really produce forests with extent, ranges, a pass, sea and rivers,
 * and (c) the player's control over proposed additions, including the Markdown export.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuthorizedSources, resolveSourceDir } from '../server/readSources';
import { GRID, buildFields, fbm, lineDist, polySigned, ridged, sample, toneAt, vnoise } from '../src/atlas/fields';
import { ATLAS_FEATURES, emptyAtlasEdits, exportProposalsMarkdown, resolveFeatures, type AtlasFeature } from '../src/atlas/geography';
import { riverCourse, shadeGround, treeSpacing } from '../src/atlas/paint';
import { GAZETTEER } from '../src/campaign/gazetteer';
import { stripMd } from '../src/domain/text';
import { AUTHORIZED_DOCS } from '../src/importer/sourcePolicy';
import { DEFAULT_LAYERS, initialMapState, mapReducer, restoreMapState } from '../src/map/mapState';
import { matchesBearing } from '../src/map/viewport';
import {
  editAtlasFeature, emptyUserLayer, normalizeUserLayer, removeAtlasFeature, restoreAtlasFeature, setMarkerPosition,
} from '../src/storage/userLayer';

const byId = (id: string) => ATLAS_FEATURES.find((f) => f.id === id)!;
const place = (slug: string) => {
  const g = GAZETTEER.find((x) => x.id === slug)!;
  return { x: g.at[0], y: g.at[1] };
};
const pointsOf = (f: AtlasFeature) => (f.shape.kind === 'point' ? [f.shape.at] : f.shape.points);
const centroid = (f: AtlasFeature) => {
  const p = pointsOf(f);
  return { x: p.reduce((a, q) => a + q[0], 0) / p.length, y: p.reduce((a, q) => a + q[1], 0) / p.length };
};

describe('atlas feature data', () => {
  const slugs = new Set(GAZETTEER.map((g) => g.id));

  it('has unique stable ids and well-formed entries', () => {
    expect(new Set(ATLAS_FEATURES.map((f) => f.id)).size).toBe(ATLAS_FEATURES.length);
    for (const f of ATLAS_FEATURES) {
      expect(f.id).toMatch(/^atlas:[a-z0-9-]+$/);
      expect(f.description.length).toBeGreaterThan(20);
      for (const n of f.near ?? []) expect(slugs.has(n), `${f.id} near ${n}`).toBe(true);
      expect(pointsOf(f).length).toBeGreaterThan(f.shape.kind === 'point' ? 0 : 1);
    }
  });

  it('every proposed feature is named, located in words, and tied to established geography', () => {
    const proposed = ATLAS_FEATURES.filter((f) => f.status === 'proposed');
    expect(proposed.length).toBeGreaterThanOrEqual(12);
    for (const f of proposed) {
      expect(f.name, f.id).toBeTruthy();
      expect(f.relation, f.id).toBeTruthy();
      expect(f.near?.length, f.id).toBeGreaterThan(0);
      expect(f.basis, `${f.id} must not claim a source`).toBeUndefined();
    }
  });

  it('every interpreted feature declares its basis and points at the established place it draws', () => {
    for (const f of ATLAS_FEATURES.filter((x) => x.status === 'interpreted')) {
      expect(f.basis, f.id).toBeDefined();
      expect(f.near?.length, f.id).toBeGreaterThan(0);
      expect(f.name, `${f.id}: interpreted features take their name from the gazetteer`).toBeUndefined();
    }
  });

  it('no proposed feature reuses the name of an established place', () => {
    const canon = new Set(GAZETTEER.flatMap((g) => [g.name, ...(g.aliases ?? [])]).map((n) => n.toLowerCase().replace(/^the /, '')));
    for (const f of ATLAS_FEATURES) if (f.name) expect(canon.has(f.name.toLowerCase().replace(/^the /, '')), f.name).toBe(false);
  });

  it('proposals contain no events, politics or forces', () => {
    for (const f of ATLAS_FEATURES.filter((x) => x.status === 'proposed')) {
      expect(`${f.name} ${f.description}`, f.id).not.toMatch(/\b(army|armies|garrison|battle|war|rules?|ruled|owns?|claimed|allied|enemy|secret|king|queen|baron|slain|killed)\b/i);
    }
  });

  it('painted geography agrees with the stated directions', () => {
    const heart = place('heart-of-uchkeken');
    // Stated: Kharûn north of Harrowmere; the ice north of Kharûn; the waste between them.
    expect(matchesBearing(place('harrowmere'), centroid(byId('atlas:kharun-massif')), 'N')).toBe(true);
    expect(centroid(byId('atlas:whispering-ice')).y).toBeLessThan(centroid(byId('atlas:ashen-waste')).y);
    expect(centroid(byId('atlas:ashen-waste')).y).toBeLessThan(centroid(byId('atlas:kharun-massif')).y);
    // Stated: the high fells north-east of the Tree; the long hills between the Tree and Ennor-Lûth; the sea by the south-west fens.
    expect(matchesBearing(heart, centroid(byId('atlas:northern-fells')), 'NE')).toBe(true);
    const hills = centroid(byId('atlas:long-hills')).y;
    expect(hills).toBeGreaterThan(heart.y);
    expect(hills).toBeLessThan(place('ennor-luth').y);
    expect(matchesBearing(heart, centroid(byId('atlas:calanor-fens')), 'SW')).toBe(true);
    // Stated: north-east up the Nindor from the Grey Step to the Three Cairns.
    const nindor = pointsOf(byId('atlas:nindor'));
    expect(lineDist(place('grey-step').x, place('grey-step').y, nindor)).toBeLessThan(12);
    expect(lineDist(place('three-cairns').x, place('three-cairns').y, nindor)).toBeLessThan(12);
  });

  const dir = resolveSourceDir(process.cwd());
  const present = AUTHORIZED_DOCS.every((d) => existsSync(join(dir, d.fileName)));
  it.skipIf(!present)('every basis quote is verbatim in the authorized documents', async () => {
    const bundle = await readAuthorizedSources(dir);
    const lines = bundle.documents.flatMap((d) => d.text.split(/\r?\n/).map(stripMd));
    for (const f of ATLAS_FEATURES) {
      for (const q of f.basis ?? []) expect(lines.some((l) => l.includes(q)), `${f.id}: “${q}”`).toBe(true);
    }
  });
});

describe('terrain fields', () => {
  const fields = buildFields([...ATLAS_FEATURES]);
  const at = (grid: Float32Array, p: { x: number; y: number }) => sample(grid, p.x, p.y);

  it('noise is deterministic and bounded', () => {
    for (const fn of [vnoise, fbm, ridged]) {
      const v = fn(12.3, 45.6, 7);
      expect(v).toBe(fn(12.3, 45.6, 7));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(buildFields([...ATLAS_FEATURES]).elev).toEqual(fields.elev);
  });

  it('computes signed distances', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(polySigned(5, 5, square)).toBe(5);
    expect(polySigned(15, 5, square)).toBe(-5);
    expect(lineDist(5, 3, [[0, 0], [10, 0]])).toBe(3);
  });

  it('forests have extent: dense inside, open outside, thinning across the edge', () => {
    const wood = byId('atlas:silverwood');
    const centre = centroid(wood);
    expect(at(fields.forest, centre)).toBeGreaterThan(0.85);
    expect(toneAt(fields, centre.x, centre.y)).toBe(2);
    // A continuous mass, not scattered icons: most of the interior is tree-covered.
    let inside = 0;
    let covered = 0;
    for (let gy = 0; gy < GRID; gy += 3) {
      for (let gx = 0; gx < GRID; gx += 3) {
        if (polySigned(gx * 2, gy * 2, pointsOf(wood)) < 14) continue;
        inside++;
        if (fields.forest[gy * GRID + gx] > 0.6) covered++;
      }
    }
    expect(inside).toBeGreaterThan(400);
    expect(covered / inside).toBeGreaterThan(0.9);
    // Across the boundary the cover falls away gradually rather than at a line.
    const samples = Array.from({ length: 60 }, (_, i) => sample(fields.forest, centre.x, centre.y - i * 3));
    expect(samples[0]).toBeGreaterThan(samples[samples.length - 1]);
    expect(samples.filter((v) => v > 0.15 && v < 0.85).length).toBeGreaterThanOrEqual(2);
  });

  it('draws Uchkeken as a fire-scarred wood, not a green one', () => {
    const c = centroid(byId('atlas:uchkeken-wood'));
    expect(at(fields.forest, c)).toBeGreaterThan(0.8);
    expect(toneAt(fields, c.x, c.y)).toBe(3);
  });

  it('raises continuous ranges with a pass between the shoulders', () => {
    const kharun = place('kharun');
    expect(at(fields.elev, kharun)).toBeGreaterThan(0.45);
    // Elevation stays high all along the massif's spine (a range, not isolated peaks).
    const spine = pointsOf(byId('atlas:kharun-massif'));
    for (let i = 1; i < spine.length; i++) {
      for (let t = 0; t <= 1; t += 0.25) {
        const x = spine[i - 1][0] + (spine[i][0] - spine[i - 1][0]) * t;
        const y = spine[i - 1][1] + (spine[i][1] - spine[i - 1][1]) * t;
        let best = 0;
        for (let dy = -14; dy <= 14; dy += 7) for (let dx = -14; dx <= 14; dx += 7) best = Math.max(best, sample(fields.elev, x + dx, y + dy));
        expect(best, `spine at ${x.toFixed(0)},${y.toFixed(0)}`).toBeGreaterThan(0.38);
      }
    }
    const pass = sample(fields.elev, 407, 331);
    expect(pass).toBeLessThan(sample(fields.elev, 352, 327));
    expect(pass).toBeLessThan(sample(fields.elev, 470, 322));
    expect(at(fields.elev, place('harrowmere'))).toBeLessThan(0.25);
    expect(at(fields.forest, kharun)).toBeLessThan(0.1);
  });

  it('puts sea, ice, waste, fen and heath where their features are', () => {
    expect(sample(fields.sea, 5, 800)).toBeGreaterThan(5);
    expect(sample(fields.elev, 5, 800)).toBeLessThan(0);
    expect(sample(fields.forest, 5, 800)).toBe(0);
    expect(at(fields.sea, place('harrowmere'))).toBeLessThan(-50);
    expect(at(fields.ice, place('whispering-ice'))).toBeGreaterThan(0.8);
    expect(at(fields.waste, place('ashen-waste'))).toBeGreaterThan(0.8);
    expect(at(fields.heath, place('harrow'))).toBeGreaterThan(0.6);
    expect(sample(fields.fen, 150, 945)).toBeGreaterThan(0.6);
    expect(at(fields.ice, place('harrowmere')) + at(fields.waste, place('harrowmere')) + at(fields.fen, place('harrowmere'))).toBeLessThan(0.05);
  });

  it('removing the proposed additions repaints the land without them and leaves canon-based terrain alone', () => {
    const bare = buildFields(resolveFeatures(emptyAtlasEdits(), false));
    const alder = centroid(byId('atlas:alderwilds'));
    expect(at(fields.forest, alder)).toBeGreaterThan(0.8);
    expect(at(bare.forest, alder)).toBeLessThan(0.65);
    const frost = centroid(byId('atlas:frostwall'));
    expect(sample(bare.elev, frost.x, 40)).toBeLessThan(sample(fields.elev, frost.x, 40));
    const silver = centroid(byId('atlas:silverwood'));
    expect(at(bare.forest, silver)).toBe(at(fields.forest, silver));
    expect(at(bare.elev, place('kharun'))).toBe(at(fields.elev, place('kharun')));
  });
});

describe('ground painting', () => {
  const R = 128;
  const fields = buildFields([...ATLAS_FEATURES]);
  const px = shadeGround(fields, R);
  const rgba = (x: number, y: number) => {
    const o = (Math.round((y / 1000) * R) * R + Math.round((x / 1000) * R)) * 4;
    return [px[o], px[o + 1], px[o + 2], px[o + 3]];
  };

  it('covers the whole world: land green, sea blue, heights pale, with a soft edge', () => {
    expect(px.length).toBe(R * R * 4);
    const [r, g, b, a] = rgba(700, 700);
    expect(a).toBe(255);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    const sea = rgba(8, 800);
    expect(sea[2]).toBeGreaterThan(sea[0]);
    const peak = rgba(405, 228);
    expect(peak[0] + peak[1] + peak[2]).toBeGreaterThan(r + g + b);
    expect(rgba(0, 500)[3]).toBeLessThan(40);
    // No empty parchment inside the world: every interior pixel is painted.
    let opaque = 0;
    for (let y = 60; y < 940; y += 20) for (let x = 60; x < 940; x += 20) if (rgba(x, y)[3] === 255) opaque++;
    expect(opaque).toBe(44 * 44);
  });

  it('gives rivers a smooth course that keeps their recorded ends', () => {
    const pts = pointsOf(byId('atlas:nindor'));
    const course = riverCourse(pts, 'atlas:nindor');
    expect(course.length).toBeGreaterThan(pts.length * 6);
    expect(Math.hypot(course[0][0] - pts[0][0], course[0][1] - pts[0][1])).toBeLessThan(1);
    expect(course[course.length - 1]).toEqual(pts[pts.length - 1]);
    for (const q of course) expect(lineDist(q[0], q[1], pts)).toBeLessThan(14);
    expect(riverCourse(pts, 'atlas:nindor')).toEqual(course);
  });

  it('adds individual trees only when the camera is close enough', () => {
    expect(treeSpacing(1)).toBeNull();
    expect(treeSpacing(2.7)).toBe(3.6);
    expect(treeSpacing(3.5)).toBe(2.6);
    expect(treeSpacing(8)).toBe(1.7);
  });
});

describe('managing proposed additions', () => {
  const id = 'atlas:alderwilds';

  it('renames, re-describes, removes and restores without touching the atlas data', () => {
    const frozen = JSON.stringify(ATLAS_FEATURES);
    let layer = editAtlasFeature(emptyUserLayer(), id, { name: 'Alder Deeps', description: 'A drowned wood.' });
    let view = resolveFeatures(layer.atlas, true);
    expect(view.find((f) => f.id === id)).toMatchObject({ name: 'Alder Deeps', description: 'A drowned wood.', status: 'proposed' });
    layer = editAtlasFeature(layer, id, { name: '' });
    expect(resolveFeatures(layer.atlas, true).find((f) => f.id === id)!.name).toBe('The Alderwilds');

    layer = removeAtlasFeature(layer, id);
    view = resolveFeatures(layer.atlas, true);
    expect(view.some((f) => f.id === id)).toBe(false);
    expect(view.length).toBe(ATLAS_FEATURES.length - 1);
    expect(resolveFeatures(restoreAtlasFeature(layer, id).atlas, true).some((f) => f.id === id)).toBe(true);
    expect(JSON.stringify(ATLAS_FEATURES)).toBe(frozen);
  });

  it('never lets an edit or removal alter interpreted (canon-based) geography', () => {
    let layer = editAtlasFeature(emptyUserLayer(), 'atlas:silverwood', { name: 'Mine', description: 'Changed.' });
    layer = removeAtlasFeature(layer, 'atlas:kharun-massif');
    const view = resolveFeatures(layer.atlas, true);
    expect(view.find((f) => f.id === 'atlas:silverwood')).toEqual(byId('atlas:silverwood'));
    expect(view.some((f) => f.id === 'atlas:kharun-massif')).toBe(true);
  });

  it('hides every proposed feature when the layer is off, keeping all interpretations', () => {
    const view = resolveFeatures(emptyAtlasEdits(), false);
    expect(view.every((f) => f.status === 'interpreted')).toBe(true);
    expect(view.length).toBe(ATLAS_FEATURES.filter((f) => f.status === 'interpreted').length);
  });

  it('stores the edits in the user layer and survives old or damaged data', () => {
    const layer = setMarkerPosition(removeAtlasFeature(editAtlasFeature(emptyUserLayer(), id, { name: 'X' }), 'atlas:eastrun'), 'atlas:reedhaven', { x: 1, y: 2 });
    expect(normalizeUserLayer(JSON.parse(JSON.stringify(layer)))).toEqual(layer);
    const v1 = { version: 1, markerOverrides: { 'location:a': { x: 1, y: 1 } }, annotations: [], mergeDecisions: [], dismissedIssueIds: [] };
    expect(normalizeUserLayer(v1).atlas).toEqual(emptyAtlasEdits());
    expect(normalizeUserLayer(v1).markerOverrides).toEqual({ 'location:a': { x: 1, y: 1 } });
    expect(normalizeUserLayer({ atlas: { removed: 'x', edits: { a: 5, b: { name: 7, description: 'ok' } } } }).atlas).toEqual({ removed: [], edits: { b: { name: undefined, description: 'ok' } } });
  });
});

describe('export for the Dungeon Master', () => {
  const md = exportProposalsMarkdown(emptyAtlasEdits(), '2026-11-16');

  it('is clearly marked as proposals, not campaign fact', () => {
    expect(md.startsWith('# Proposed atlas additions')).toBe(true);
    expect(md).toContain('These are proposals, not campaign facts.');
    expect(md).toContain('prepared 2026-11-16');
    expect(md).toContain('Decision: ☐ accept ☐ change ☐ reject');
  });

  it('lists every proposed feature once, by region then feature type, with its relationships', () => {
    const proposed = ATLAS_FEATURES.filter((f) => f.status === 'proposed');
    for (const f of proposed) {
      expect(md.split(`\`${f.id}\``).length - 1, f.id).toBe(1);
      expect(md).toContain(`**${f.name}** — ${f.description}`);
    }
    expect(md).toContain(`${proposed.length} proposed features`);
    const order = ['## The North', '## The West', '## The Heartlands', '## The East', '## The South'].map((h) => md.indexOf(h));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const north = md.slice(md.indexOf('## The North'), md.indexOf('## The West'));
    expect(north).toContain('### Mountains');
    expect(north).toContain('Near established places: The Whispering Ice');
    expect(north).toContain('Where: North of the Whispering Ice');
  });

  it('keeps interpretations in a separate, clearly labelled section with their basis', () => {
    const tail = md.slice(md.indexOf('## For information'));
    expect(tail).toContain('These are not additions.');
    expect(tail).toContain('“hidden elven wood”');
    expect(tail).toContain('the place’s name only');
    expect(md.slice(0, md.indexOf('## For information'))).not.toContain('hidden elven wood');
  });

  it('reflects the player’s edits and omits what they removed', () => {
    let layer = editAtlasFeature(emptyUserLayer(), 'atlas:reedhaven', { name: 'Reedmouth' });
    layer = removeAtlasFeature(layer, 'atlas:eastrun');
    const edited = exportProposalsMarkdown(layer.atlas);
    expect(edited).toContain('**Reedmouth**');
    expect(edited).not.toContain('Reedhaven');
    expect(edited).not.toContain('atlas:eastrun');
  });
});

describe('layer controls', () => {
  it('every layer toggles independently', () => {
    const s0 = initialMapState();
    for (const key of Object.keys(DEFAULT_LAYERS) as (keyof typeof DEFAULT_LAYERS)[]) {
      const s1 = mapReducer(s0, { type: 'toggle-layer', layer: key });
      expect(s1.layers).toEqual({ ...DEFAULT_LAYERS, [key]: false });
      expect(mapReducer(s1, { type: 'toggle-layer', layer: key })).toEqual(s0);
    }
  });

  it('sets several layers at once and a highlight, and persists both', () => {
    let s = mapReducer(initialMapState(), { type: 'set-layers', layers: { heroes: false, factions: false, reports: false } });
    s = mapReducer(s, { type: 'set-highlight', highlight: 'mystical' });
    expect(s.layers).toEqual({ ...DEFAULT_LAYERS, heroes: false, factions: false, reports: false });
    expect(restoreMapState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreMapState({ highlight: 'everything' }).highlight).toBe('none');
  });

  it('keeps a setting saved before the new layers existed', () => {
    const old = { layers: { terrain: false, routes: true, heroes: false, factions: true, silences: true } };
    expect(restoreMapState(old).layers).toEqual({ ...DEFAULT_LAYERS, terrain: false, heroes: false });
  });
});
