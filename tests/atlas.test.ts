/**
 * Milestone 2: the illustrated atlas. These tests pin down the rules that keep the
 * artwork honest (terrain and routes must rest on quoted text; heroes are placed only
 * where the chronicle places them; force reports are never unit positions).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuthorizedSources, resolveSourceDir } from '../server/readSources';
import { bannerDevice, monogram, rng, routePath, scatter, wavyPath } from '../src/atlas/glyphs';
import { ROUTES, TERRAIN } from '../src/atlas/terrain';
import { GAZETTEER } from '../src/campaign/gazetteer';
import { factionStance, forceReports, heroPlacements, indexWorld, recordedInPlay, searchEntities } from '../src/domain/selectors';
import { stripMd } from '../src/domain/text';
import { runImport } from '../src/importer';
import { AUTHORIZED_DOCS } from '../src/importer/sourcePolicy';
import { allEffectivePositions, buildMapViewModel } from '../src/map/layers';
import { DEFAULT_LAYERS, initialMapState, mapReducer, restoreMapState, type MapState } from '../src/map/mapState';
import { emptyUserLayer, setMarkerPosition } from '../src/storage/userLayer';
import { ALL, CHRONICLE, TEST_OPTIONS } from './fixtures';

const ix = indexWorld(runImport(ALL, TEST_OPTIONS).world);
const at = (patch: Partial<MapState>): MapState => ({ ...initialMapState(), viewport: { cx: 500, cy: 500, zoom: 8 }, ...patch });
const withChronicle = (text: string) =>
  indexWorld(runImport(ALL.map((s) => (s.fileName === 'campaign-chronicle.md' ? { ...s, text } : s)), TEST_OPTIONS).world);

describe('procedural cartography', () => {
  it('is deterministic: the same key always draws the same thing', () => {
    expect(scatter('uchkeken', { x: 500, y: 600 }, 40, 30)).toEqual(scatter('uchkeken', { x: 500, y: 600 }, 40, 30));
    expect(scatter('a', { x: 0, y: 0 }, 40, 30)).not.toEqual(scatter('b', { x: 0, y: 0 }, 40, 30));
    expect(wavyPath('senn', { x: 1, y: 2 }, 50)).toBe(wavyPath('senn', { x: 1, y: 2 }, 50));
    expect(routePath('r', [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(routePath('r', [{ x: 0, y: 0 }, { x: 10, y: 0 }]));
    const r = rng('seed');
    expect([r(), r(), r()].every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('keeps glyphs inside their cluster, spaced, and ordered north to south', () => {
    const glyphs = scatter('k', { x: 100, y: 100 }, 30, 20);
    expect(glyphs.length).toBeGreaterThan(10);
    for (const g of glyphs) expect(Math.hypot(g.x - 100, g.y - 100)).toBeLessThanOrEqual(30.001);
    expect(glyphs.map((g) => g.y)).toEqual([...glyphs.map((g) => g.y)].sort((a, b) => a - b));
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) expect(Math.hypot(glyphs[i].x - glyphs[j].x, glyphs[i].y - glyphs[j].y)).toBeGreaterThan(3);
    }
  });

  it('routes start and end exactly on their stops; an aimed river points at its target', () => {
    expect(routePath('x', [{ x: 5, y: 6 }, { x: 50, y: 60 }, { x: 90, y: 10 }])).toMatch(/^M5\.0 6\.0Q.* 50\.0 60\.0Q.* 90\.0 10\.0$/);
    const nums = wavyPath('n', { x: 0, y: 0 }, 100, { x: 100, y: 0 }).match(/-?\d+\.\d/g)!.map(Number);
    expect(Math.abs(nums[0] - -50)).toBeLessThan(8);
    expect(Math.abs(nums[nums.length - 2] - 50)).toBeLessThan(8);
  });

  it('derives placeholder banners and monograms only from stable ids and names', () => {
    expect(bannerDevice('faction:house-vale', 'House Vale')).toEqual(bannerDevice('faction:house-vale', 'House Vale'));
    expect(bannerDevice('faction:x', 'The Laughing Mask').letter).toBe('L');
    expect(monogram('Riveria Ljos Alf')).toBe('RA');
    expect(monogram('Thalorien')).toBe('TH');
  });
});

describe('illustration data', () => {
  const slugs = new Set(GAZETTEER.map((g) => g.id));

  it('refers only to gazetteer places', () => {
    for (const t of TERRAIN) {
      expect(slugs.has(t.place), t.place).toBe(true);
      if (t.towards) expect(slugs.has(t.towards), t.towards).toBe(true);
    }
    for (const r of ROUTES) {
      expect(r.stops.length).toBeGreaterThan(1);
      for (const s of r.stops) expect(slugs.has(s), `${r.id}: ${s}`).toBe(true);
    }
    expect(new Set(TERRAIN.map((t) => t.place)).size).toBe(TERRAIN.length);
  });

  const dir = resolveSourceDir(process.cwd());
  const present = AUTHORIZED_DOCS.every((d) => existsSync(join(dir, d.fileName)));
  it.skipIf(!present)('every terrain quote and every route quote is verbatim in the authorized documents', async () => {
    const bundle = await readAuthorizedSources(dir);
    const lines = bundle.documents.flatMap((d) => d.text.split(/\r?\n/).map(stripMd));
    const found = (q: string) => lines.some((l) => l.includes(q));
    for (const t of TERRAIN) if (t.quote) expect(found(t.quote), `terrain ${t.place}: “${t.quote}”`).toBe(true);
    for (const r of ROUTES) expect(found(r.quote), `route ${r.id}: “${r.quote}”`).toBe(true);
  });
});

describe('heroes on the map', () => {
  it('places the hero at the chronicle’s current location and leaves unmentioned companions unplaced', () => {
    const heroes = heroPlacements(ix);
    expect(heroes.map((h) => [h.entity.id, h.role, h.locationId])).toEqual([
      ['character:tavin', 'player-character', 'location:northkeep'],
      ['character:mira-vale', 'companion', null],
      ['character:joss-reed', 'companion', null],
    ]);
    expect(heroes[0].ref).toMatchObject({ docId: 'chronicle' });
  });

  it('places a companion only when the Location line names them, and never places other people named there', () => {
    const custom = withChronicle(CHRONICLE.replace('in the hall. The horses', 'in the hall with Mira Vale, hiding from Hale Dorn. The horses'));
    const placed = heroPlacements(custom).filter((h) => h.locationId);
    expect(placed.map((h) => h.entity.id)).toEqual(['character:tavin', 'character:mira-vale']);
    expect(heroPlacements(custom).some((h) => h.entity.id === 'character:hale-dorn')).toBe(false);
  });

  it('gives no location when the chronicle has none', () => {
    const custom = withChronicle(CHRONICLE.replace(/- Location:.*\n/, ''));
    expect(heroPlacements(custom).every((h) => h.locationId === null)).toBe(true);
  });

  it('exposes heroes in the view-model, following a user-moved marker, and can hide the layer', () => {
    const vm = buildMapViewModel(ix, emptyUserLayer(), at({ selectedId: 'character:tavin' }));
    expect(vm.heroes.find((h) => h.id === 'character:tavin')).toMatchObject({ position: { x: 500, y: 500 }, selected: true });
    expect(vm.heroes.filter((h) => h.position === null).map((h) => h.id)).toEqual(['character:mira-vale', 'character:joss-reed']);
    const moved = buildMapViewModel(ix, setMarkerPosition(emptyUserLayer(), 'location:northkeep', { x: 9, y: 9 }), at({}));
    expect(moved.heroes[0].position).toEqual({ x: 9, y: 9 });
    expect(buildMapViewModel(ix, emptyUserLayer(), at({ layers: { ...DEFAULT_LAYERS, heroes: false } })).heroes).toEqual([]);
  });
});

describe('exploration and strategic derivations', () => {
  it('distinguishes places in the session log from places known only by report', () => {
    expect(recordedInPlay(ix, 'location:tollgate')).toBe(true);
    expect(recordedInPlay(ix, 'location:farholt')).toBe(false);
    const vm = buildMapViewModel(ix, emptyUserLayer(), at({}));
    const rec = Object.fromEntries(vm.markers.map((m) => [m.id.replace('location:', ''), m.recorded]));
    expect(rec).toEqual({ northkeep: 'here', eastwood: 'report', tollgate: 'in-play', farholt: 'report' });
  });

  it('reads a stance only where the faction entry states one', () => {
    const f = (id: string) => ix.entity.get(id)!;
    expect(factionStance(f('faction:house-vale'))).toBe('allied');
    expect(factionStance(f('faction:varn-and-his-riders'))).toBe('unknown');
  });

  it('collects quoted force reports without turning them into positions', () => {
    expect(forceReports(ix)).toEqual([]);
    const custom = withChronicle(CHRONICLE.replace('raiding near the Tollgate.', 'about 40 riders, raiding near the Tollgate.'));
    const reports = forceReports(custom);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ locationIds: ['location:tollgate'], ref: { docId: 'chronicle' } });
    expect(reports[0].text).toContain('about 40 riders');
    const strategic = buildMapViewModel(custom, emptyUserLayer(), at({ mode: 'strategic' }));
    expect(strategic.markers.find((m) => m.id === 'location:tollgate')!.forceReports).toBe(1);
    const exploration = buildMapViewModel(custom, emptyUserLayer(), at({}));
    expect(exploration.markers.every((m) => m.forceReports === 0 && m.factions.length === 0 && m.silence === undefined)).toBe(true);
    // The view-model has no notion of armies, borders or territory at all.
    expect(Object.keys(strategic).sort()).toEqual(['heroes', 'markers', 'orphanedUserData', 'pins', 'relationLines', 'timeline', 'unplaced']);
  });

  it('strategic layers can be switched off independently', () => {
    const off = buildMapViewModel(ix, emptyUserLayer(), at({ mode: 'strategic', layers: { ...DEFAULT_LAYERS, factions: false, silences: false } }));
    expect(off.markers.every((m) => m.factions.length === 0 && m.silence === undefined)).toBe(true);
    const on = buildMapViewModel(ix, emptyUserLayer(), at({ mode: 'strategic' }));
    expect(on.markers.find((m) => m.id === 'location:northkeep')!.factions[0]).toMatchObject({ name: 'House Vale', stance: 'allied' });
  });

  it('searches places, people and factions by name or alias, ignoring accents and case', () => {
    expect(searchEntities(ix, 'north').map((e) => e.id)).toEqual(['location:northkeep']);
    expect(searchEntities(ix, 'greycloak').map((e) => e.id)).toEqual(['character:tavin']);
    expect(searchEntities(ix, 'TOLLG')[0].id).toBe('location:tollgate');
    expect(searchEntities(ix, 'vale').map((e) => e.id).sort()).toEqual(['character:mira-vale', 'faction:house-vale']);
    expect(searchEntities(ix, '   ')).toEqual([]);
    expect(searchEntities(ix, 'zzz')).toEqual([]);
  });

  it('gives illustration layers the effective position of every placed location', () => {
    const layer = setMarkerPosition(emptyUserLayer(), 'location:the-sunken-chapel', { x: 3, y: 4 });
    expect(Object.keys(allEffectivePositions(ix, emptyUserLayer())).sort()).toEqual(['location:eastwood', 'location:farholt', 'location:northkeep', 'location:tollgate']);
    expect(allEffectivePositions(ix, layer)['location:the-sunken-chapel']).toEqual({ x: 3, y: 4 });
  });
});

describe('layer visibility state', () => {
  it('toggles one layer at a time and persists', () => {
    const s0 = initialMapState();
    const s1 = mapReducer(s0, { type: 'toggle-layer', layer: 'terrain' });
    expect(s1.layers).toEqual({ ...DEFAULT_LAYERS, terrain: false });
    expect(s0.layers.terrain).toBe(true);
    expect(restoreMapState(JSON.parse(JSON.stringify(s1)))).toEqual(s1);
  });

  it('upgrades map state saved before layers existed, and repairs bad values', () => {
    const { layers: _dropped, ...old } = initialMapState();
    expect(restoreMapState(old).layers).toEqual(DEFAULT_LAYERS);
    expect(restoreMapState({ layers: { terrain: 'no', heroes: false } }).layers).toEqual({ ...DEFAULT_LAYERS, heroes: false });
  });
});
