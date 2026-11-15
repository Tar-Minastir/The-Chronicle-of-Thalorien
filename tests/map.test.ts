import { describe, expect, it } from 'vitest';
import { indexWorld } from '../src/domain/selectors';
import { runImport } from '../src/importer';
import { buildMapViewModel, effectivePosition } from '../src/map/layers';
import { initialMapState, mapReducer, restoreMapState, type MapState } from '../src/map/mapState';
import {
  DEFAULT_VIEWPORT, MAX_ZOOM, MIN_ZOOM, WORLD_SIZE, bearingDeg, fitPoints, matchesBearing, panBy, screenToWorld, worldToScreen, zoomAt,
} from '../src/map/viewport';
import { addAnnotation, emptyUserLayer, setMarkerPosition } from '../src/storage/userLayer';
import { ALL, TEST_OPTIONS } from './fixtures';

const size = { width: 1200, height: 800 };
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('viewport math', () => {
  it('round-trips world <-> screen', () => {
    const vp = { cx: 320, cy: 610, zoom: 3.3 };
    const p = { x: 123.4, y: 876.5 };
    close(screenToWorld(worldToScreen(p, vp, size), vp, size), p);
    close(worldToScreen({ x: vp.cx, y: vp.cy }, vp, size), { x: 600, y: 400 });
  });

  it('zooms around the pointer: the world point under it does not move', () => {
    const anchor = { x: 900, y: 150 };
    const before = screenToWorld(anchor, DEFAULT_VIEWPORT, size);
    const zoomed = zoomAt(DEFAULT_VIEWPORT, size, anchor, 2.5);
    expect(zoomed.zoom).toBeCloseTo(2.5);
    close(screenToWorld(anchor, zoomed, size), before);
  });

  it('clamps zoom and keeps the centre inside the world', () => {
    expect(zoomAt(DEFAULT_VIEWPORT, size, { x: 0, y: 0 }, 1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(DEFAULT_VIEWPORT, size, { x: 0, y: 0 }, 1e-6).zoom).toBe(MIN_ZOOM);
    const far = panBy(DEFAULT_VIEWPORT, size, 1e7, -1e7);
    expect(far.cx).toBe(0);
    expect(far.cy).toBe(WORLD_SIZE);
  });

  it('pans so that content follows the pointer', () => {
    const p = { x: 500, y: 500 };
    const start = worldToScreen(p, DEFAULT_VIEWPORT, size);
    const end = worldToScreen(p, panBy(DEFAULT_VIEWPORT, size, 40, -25), size);
    close(end, { x: start.x + 40, y: start.y - 25 });
  });

  it('fits a set of points on screen', () => {
    const pts = [{ x: 100, y: 100 }, { x: 300, y: 500 }];
    const vp = fitPoints(pts, size);
    for (const p of pts) {
      const s = worldToScreen(p, vp, size);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(size.width);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(size.height);
    }
    expect(fitPoints([], size)).toEqual(DEFAULT_VIEWPORT);
  });

  it('computes compass bearings with north up', () => {
    const o = { x: 500, y: 500 };
    expect(bearingDeg(o, { x: 500, y: 400 })).toBeCloseTo(0);
    expect(bearingDeg(o, { x: 600, y: 500 })).toBeCloseTo(90);
    expect(bearingDeg(o, { x: 400, y: 600 })).toBeCloseTo(225);
    expect(matchesBearing(o, { x: 590, y: 410 }, 'NE')).toBe(true);
    expect(matchesBearing(o, { x: 590, y: 410 }, 'S')).toBe(false);
    expect(matchesBearing(o, { x: 490, y: 300 }, 'N')).toBe(true);
  });
});

describe('map state reducer', () => {
  const s0 = initialMapState();

  it('switches mode without disturbing view, selection or overlays', () => {
    const prepared = mapReducer(mapReducer(s0, { type: 'select', id: 'location:x' }), { type: 'zoom', size, anchor: { x: 10, y: 10 }, factor: 3 });
    const strategic = mapReducer(prepared, { type: 'set-mode', mode: 'strategic' });
    expect(strategic).toEqual({ ...prepared, mode: 'strategic' });
    expect(mapReducer(strategic, { type: 'set-mode', mode: 'exploration' })).toEqual(prepared);
  });

  it('toggles overlays independently and never mutates the previous state', () => {
    const frozen = JSON.stringify(s0);
    const s1 = mapReducer(s0, { type: 'toggle-overlay', overlay: 'history' });
    expect(s1.overlays).toEqual({ ...s0.overlays, history: true });
    expect(mapReducer(s1, { type: 'toggle-overlay', overlay: 'history' })).toEqual(s0);
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it('handles selection, timeline and edit toggles', () => {
    let s = mapReducer(s0, { type: 'select', id: 'a' });
    s = mapReducer(s, { type: 'set-timeline-day', day: 12 });
    s = mapReducer(s, { type: 'toggle-edit-positions' });
    expect(s).toMatchObject({ selectedId: 'a', timelineDay: 12, editPositions: true });
    expect(mapReducer(s, { type: 'select', id: null }).selectedId).toBeNull();
  });

  it('round-trips through JSON and repairs damaged stored state', () => {
    const s = mapReducer(mapReducer(s0, { type: 'set-mode', mode: 'strategic' }), { type: 'pan', size, dx: 50, dy: 50 });
    expect(restoreMapState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreMapState(undefined)).toEqual(s0);
    expect(restoreMapState({ mode: 'siege', viewport: { cx: 'x' }, overlays: { history: 'yes' }, timelineDay: 'soon' })).toEqual(s0);
    expect(restoreMapState({ viewport: { cx: -500, cy: 5000, zoom: 999 } }).viewport).toEqual({ cx: 0, cy: WORLD_SIZE, zoom: MAX_ZOOM });
  });
});

describe('map view-model', () => {
  const ix = indexWorld(runImport(ALL, TEST_OPTIONS).world);
  const layer0 = emptyUserLayer();
  const at = (patch: Partial<MapState>): MapState => ({ ...initialMapState(), ...patch });
  const marker = (vm: ReturnType<typeof buildMapViewModel>, id: string) => vm.markers.find((m) => m.id === `location:${id}`);
  const zoomed = { cx: 500, cy: 500, zoom: 8 };

  it('marks every imported position as provisional and reports unplaced places separately', () => {
    const vm = buildMapViewModel(ix, layer0, at({ viewport: zoomed }));
    expect(vm.markers.map((m) => m.positionStatus)).toEqual(vm.markers.map(() => 'provisional'));
    expect(vm.unplaced).toEqual([{ id: 'location:the-sunken-chapel', name: 'The Sunken Chapel' }]);
    expect(marker(vm, 'eastwood')!.unanchored).toBe(true);
    expect(marker(vm, 'farholt')!.unanchored).toBe(false);
  });

  it('applies level of detail by zoom, but never hides the selected place', () => {
    const wide = buildMapViewModel(ix, layer0, at({}));
    expect(wide.markers.map((m) => m.id).sort()).toEqual(['location:eastwood', 'location:northkeep']);
    expect(buildMapViewModel(ix, layer0, at({ viewport: zoomed })).markers).toHaveLength(4);
    expect(marker(buildMapViewModel(ix, layer0, at({ selectedId: 'location:farholt' })), 'farholt')!.selected).toBe(true);
  });

  it('uses the user position over the provisional one, and can place an unplaced location', () => {
    let layer = setMarkerPosition(layer0, 'location:northkeep', { x: 111, y: 222 });
    layer = setMarkerPosition(layer, 'location:the-sunken-chapel', { x: 10, y: 20 });
    const vm = buildMapViewModel(ix, layer, at({}));
    expect(marker(vm, 'northkeep')).toMatchObject({ position: { x: 111, y: 222 }, positionStatus: 'user-placed' });
    expect(marker(vm, 'the-sunken-chapel')).toMatchObject({ position: { x: 10, y: 20 }, positionStatus: 'user-placed' });
    expect(vm.unplaced).toEqual([]);
    expect(effectivePosition(ix, layer0, 'location:northkeep')).toEqual({ position: { x: 500, y: 500 }, status: 'provisional' });
    expect(ix.world.geo.find((g) => g.id === 'location:northkeep')!.position).toEqual({ x: 500, y: 500 }); // geography untouched
  });

  it('shows different information per mode from the same data', () => {
    const exploration = buildMapViewModel(ix, layer0, at({ viewport: zoomed }));
    const strategic = buildMapViewModel(ix, layer0, at({ viewport: zoomed, mode: 'strategic' }));
    expect(marker(exploration, 'northkeep')).toMatchObject({ badge: 1, silence: undefined, factions: [], isPartyHere: true });
    expect(marker(strategic, 'northkeep')).toMatchObject({ badge: 1, factions: [{ id: 'faction:house-vale', name: 'House Vale', stale: false }] });
    expect(marker(strategic, 'eastwood')!.silence).toBe('awake');
    expect(marker(strategic, 'farholt')!.silence).toBe('dark');
    // A faction entry flagged as stale is listed but not counted.
    expect(marker(strategic, 'tollgate')).toMatchObject({ badge: 0, factions: [{ stale: true }] });
  });

  it('strategic mode keeps silence sites visible at any zoom', () => {
    const vm = buildMapViewModel(ix, layer0, at({ mode: 'strategic' }));
    expect(marker(vm, 'farholt')).toBeTruthy();
    expect(marker(vm, 'tollgate')).toBeUndefined();
  });

  it('historical overlay counts only events dated on or before the chosen day', () => {
    const off = buildMapViewModel(ix, layer0, at({ viewport: zoomed }));
    expect(off.timeline).toEqual({ enabled: false, day: null, maxDay: 40 });
    expect(marker(off, 'tollgate')!.historyCount).toBe(0);

    const on = (day: number | null) =>
      buildMapViewModel(ix, layer0, at({ viewport: zoomed, overlays: { history: true, annotations: true, provisional: true }, timelineDay: day }));
    expect(marker(on(9), 'tollgate')!.historyCount).toBe(0);
    expect(marker(on(10), 'tollgate')!.historyCount).toBe(1);
    expect(marker(on(15), 'northkeep')!.historyCount).toBe(0); // "The council" is undated; "Saved at" is Day 20
    expect(marker(on(null), 'northkeep')!.historyCount).toBe(1);
    expect(on(null).timeline.day).toBe(40);
  });

  it('keeps annotations in their own layer and reports data whose place disappeared', () => {
    let layer = addAnnotation(layer0, { entityId: 'location:northkeep', title: 'A', text: 'x' });
    layer = addAnnotation(layer, { position: { x: 5, y: 5 }, title: 'Pin', text: '' });
    layer = setMarkerPosition(layer, 'location:vanished', { x: 1, y: 1 });
    const vm = buildMapViewModel(ix, layer, at({ viewport: zoomed }));
    expect(marker(vm, 'northkeep')!.noteCount).toBe(1);
    expect(vm.pins.map((p) => p.title)).toEqual(['Pin']);
    expect(vm.orphanedUserData).toEqual(['location:vanished']);
    const hidden = buildMapViewModel(ix, layer, at({ viewport: zoomed, overlays: { history: false, annotations: false, provisional: true } }));
    expect(hidden.pins).toEqual([]);
    expect(marker(hidden, 'northkeep')!.noteCount).toBe(0);
  });

  it('draws relation hints only for verified, non-containment relations of the selected place', () => {
    const vm = buildMapViewModel(ix, layer0, at({ selectedId: 'location:farholt' }));
    expect(vm.relationLines).toEqual([{ from: { x: 300, y: 200 }, to: { x: 300, y: 400 }, label: 'N of', certainty: 'stated' }]);
    expect(buildMapViewModel(ix, layer0, at({ selectedId: 'location:eastwood' })).relationLines).toEqual([]);
  });
});
