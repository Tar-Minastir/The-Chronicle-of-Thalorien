/**
 * Milestone 2C: the redesigned shell. Pure logic only: camera framing, the campaign-day timeline,
 * saved views, and the presentation tables that must stay tied to real places.
 */
import { describe, expect, it } from 'vitest';
import { PLACE_ART, artUrl } from '../src/atlas/vignettes';
import { GAZETTEER } from '../src/campaign/gazetteer';
import { eventDays, indexWorld, lastLoggedDay } from '../src/domain/selectors';
import { runImport } from '../src/importer';
import { initialMapState, mapReducer, restoreMapState } from '../src/map/mapState';
import { MAX_ZOOM, WORLD_SIZE, coverViewport, fitPoints, scaleOf, showsMargin } from '../src/map/viewport';
import { ALL, TEST_OPTIONS } from './fixtures';

const ix = indexWorld(runImport(ALL, TEST_OPTIONS).world);

describe('aspect-aware framing', () => {
  const wide = { width: 1240, height: 810 };
  const tall = { width: 500, height: 900 };

  it('fills a wide viewport with land: no empty margin on any side', () => {
    for (const size of [wide, tall, { width: 800, height: 800 }]) {
      const vp = coverViewport({ x: 500, y: 600 }, size);
      expect(showsMargin(vp, size)).toBe(false);
      const s = scaleOf(vp, size);
      // The world is not stretched: one scale for both axes, and it exactly spans the longer side.
      expect(WORLD_SIZE * s).toBeCloseTo(Math.max(size.width, size.height), 5);
    }
  });

  it('keeps the focus in view and stays inside the world near an edge', () => {
    const centre = coverViewport({ x: 520, y: 640 }, wide);
    expect(centre.cy).toBeCloseTo(640);
    const corner = coverViewport({ x: 990, y: 5 }, wide, 1.25);
    expect(showsMargin(corner, wide)).toBe(false);
    expect(corner.cx).toBeLessThan(990);
    expect(corner.cy).toBeGreaterThan(5);
    expect(coverViewport({ x: 500, y: 500 }, wide, 1e9).zoom).toBe(MAX_ZOOM);
  });

  it('recognises the old whole-world view on a wide screen as showing margins', () => {
    const whole = fitPoints([{ x: 0, y: 0 }, { x: 1000, y: 1000 }], wide, 0.02);
    expect(showsMargin(whole, wide)).toBe(true);
    expect(showsMargin(coverViewport({ x: 500, y: 500 }, wide, 1.25), wide)).toBe(false);
  });
});

describe('campaign-day timeline', () => {
  it('uses only days the session log actually dates, in order', () => {
    expect(eventDays(ix)).toEqual([10, 20]);
  });

  it('reports the last dated log entry naming a place, or null', () => {
    expect(lastLoggedDay(ix, 'location:tollgate')).toBe(12);
    expect(lastLoggedDay(ix, 'location:northkeep')).toBe(20);
    expect(lastLoggedDay(ix, 'location:farholt')).toBeNull();
  });

  it('switches the historical overlay explicitly', () => {
    const on = mapReducer(initialMapState(), { type: 'set-overlay', overlay: 'history', on: true });
    expect(on.overlays.history).toBe(true);
    expect(mapReducer(on, { type: 'set-overlay', overlay: 'history', on: true })).toEqual(on);
    expect(mapReducer(on, { type: 'set-overlay', overlay: 'history', on: false }).overlays.history).toBe(false);
  });
});

describe('saved views', () => {
  it('saves the current camera, forgets one, caps the list, and persists', () => {
    let s = mapReducer(initialMapState(), { type: 'set-viewport', viewport: { cx: 300, cy: 400, zoom: 3 } });
    s = mapReducer(s, { type: 'add-bookmark', name: '  The fells ' });
    s = mapReducer(s, { type: 'add-bookmark', name: '' });
    expect(s.bookmarks).toEqual([
      { name: 'The fells', viewport: { cx: 300, cy: 400, zoom: 3 } },
      { name: 'Saved view', viewport: { cx: 300, cy: 400, zoom: 3 } },
    ]);
    expect(restoreMapState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(mapReducer(s, { type: 'remove-bookmark', index: 0 }).bookmarks.map((b) => b.name)).toEqual(['Saved view']);
    for (let i = 0; i < 20; i++) s = mapReducer(s, { type: 'add-bookmark', name: `v${i}` });
    expect(s.bookmarks).toHaveLength(12);
    expect(s.bookmarks[11].name).toBe('v19');
  });

  it('drops damaged bookmarks and accepts state saved before bookmarks existed', () => {
    const { bookmarks: _none, ...old } = initialMapState();
    expect(restoreMapState(old).bookmarks).toEqual([]);
    const fixed = restoreMapState({ bookmarks: [{ name: 'ok', viewport: { cx: 1, cy: 2, zoom: 2 } }, { name: 5 }, { name: 'bad', viewport: { cx: 'x' } }, null] });
    expect(fixed.bookmarks).toEqual([{ name: 'ok', viewport: { cx: 1, cy: 2, zoom: 2 } }]);
  });
});

describe('artwork tables', () => {
  it('assigns vignettes only to real gazetteer places', () => {
    const slugs = new Set(GAZETTEER.map((g) => g.id));
    for (const slug of Object.keys(PLACE_ART)) expect(slugs.has(slug), slug).toBe(true);
  });

  it('never dresses the burnt wood or a ruin as a living settlement', () => {
    expect(PLACE_ART['uchkeken']).toBe('tree');
    expect(PLACE_ART['taur-galen']).toBe('ruin');
    expect(PLACE_ART['silver-mere']).toBe('mere'); // not a harbour town: the documents describe fens
  });

  it('keeps supplied artwork under one local folder', () => {
    expect(artUrl.world).toBe('/atlas-art/world.webp');
    expect(artUrl.place('dun-ommar')).toBe('/atlas-art/places/dun-ommar.webp');
    expect(artUrl.panel('uchkeken')).toBe('/atlas-art/panels/uchkeken.webp');
  });
});
