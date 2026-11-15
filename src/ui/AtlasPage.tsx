/**
 * World Atlas page: the map fills the page; everything else floats over it or sits in the dock.
 * Holds only presentation state (dock tab, camera animation, search text).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Entity, Point } from '../domain/types';
import { resolveFeatures, type AtlasFeature } from '../atlas/geography';
import { searchEntities, type WorldIndex } from '../domain/selectors';
import { allEffectivePositions, type MapViewModel } from '../map/layers';
import type { MapAction, MapMode, MapState } from '../map/mapState';
import { fitPoints, zoomAt, type Size, type Viewport } from '../map/viewport';
import {
  addAnnotation, clearMarkerPosition, editAtlasFeature, removeAnnotation, removeAtlasFeature, restoreAtlasFeature, setMarkerPosition,
  type UserLayer,
} from '../storage/userLayer';
import { DetailsPanel } from './DetailsPanel';
import { LayersPanel } from './LayersPanel';
import { MapView } from './MapView';

interface Props {
  ix: WorldIndex;
  vm: MapViewModel;
  map: MapState;
  dispatch: Dispatch<MapAction>;
  layer: UserLayer;
  updateLayer: (fn: (l: UserLayer) => UserLayer) => void;
}

type Dock = 'details' | 'layers' | null;
type Hit = { id: string; name: string; kind: string; entity?: Entity; feature?: AtlasFeature };
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function AtlasPage({ ix, vm, map, dispatch, layer, updateLayer }: Props) {
  const [dock, setDock] = useState<Dock>('details');
  const [query, setQuery] = useState('');
  const size = useRef<Size>({ width: 1200, height: 800 });
  const mapRef = useRef(map);
  mapRef.current = map;
  const anim = useRef(0);

  // Depend on data only (not on pan/zoom), so the painted map and routes are not rebuilt while the camera moves.
  const positions = useMemo(() => allEffectivePositions(ix, layer), [ix, layer]);
  const features = useMemo(() => resolveFeatures(layer.atlas, map.layers.proposed), [layer.atlas, map.layers.proposed]);

  const results = useMemo<Hit[]>(() => {
    const q = fold(query.trim());
    if (!q) return [];
    const places: Hit[] = searchEntities(ix, query, 6).map((e) => ({ id: e.id, name: e.name, kind: e.kind === 'location' ? 'place' : e.kind === 'character' ? 'person' : 'faction', entity: e }));
    const additions: Hit[] = features
      .filter((f) => f.status === 'proposed' && f.name && fold(f.name).includes(q))
      .slice(0, 4)
      .map((f) => ({ id: f.id, name: f.name!, kind: 'proposed addition', feature: f }));
    return [...places, ...additions];
  }, [ix, query, features]);

  const landing = useRef(0);
  const stopFlight = useCallback(() => {
    cancelAnimationFrame(anim.current);
    clearTimeout(landing.current);
  }, []);
  useEffect(() => stopFlight, [stopFlight]);
  useEffect(() => {
    if (map.selectedId) setDock('details');
  }, [map.selectedId]);

  /** Eased camera move. Any user input on the map cancels it. */
  const flyTo = useCallback((target: Viewport) => {
    stopFlight();
    const from = mapRef.current.viewport;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 480);
      const e = 1 - Math.pow(1 - k, 3);
      dispatch({
        type: 'set-viewport',
        viewport: {
          cx: from.cx + (target.cx - from.cx) * e,
          cy: from.cy + (target.cy - from.cy) * e,
          zoom: Math.exp(Math.log(from.zoom) + (Math.log(target.zoom) - Math.log(from.zoom)) * e),
        },
      });
      if (k < 1) anim.current = requestAnimationFrame(step);
      else clearTimeout(landing.current);
    };
    anim.current = requestAnimationFrame(step);
    // Animation frames stop while the window is hidden; make sure the camera still arrives.
    landing.current = window.setTimeout(() => {
      cancelAnimationFrame(anim.current);
      dispatch({ type: 'set-viewport', viewport: target });
    }, 700);
  }, [dispatch, stopFlight]);

  const zoomBy = (factor: number) =>
    flyTo(zoomAt(map.viewport, size.current, { x: size.current.width / 2, y: size.current.height / 2 }, factor));
  const fit = () => flyTo(fitPoints([{ x: 0, y: 0 }, { x: 1000, y: 1000 }], size.current, 0.02));
  const onSize = useCallback((s: Size) => {
    size.current = s;
  }, []);

  const featureAt = (f: AtlasFeature): Point | undefined => {
    if (layer.markerOverrides[f.id]) return layer.markerOverrides[f.id];
    if (f.shape.kind === 'point') return { x: f.shape.at[0], y: f.shape.at[1] };
    if (f.label) return { x: f.label.at[0], y: f.label.at[1] };
    const mid = f.shape.points[Math.floor(f.shape.points.length / 2)];
    return { x: mid[0], y: mid[1] };
  };
  const select = (id: string | null, fly = true) => {
    dispatch({ type: 'select', id });
    if (!id || !fly) return;
    const f = features.find((x) => x.id === id);
    const at = f ? featureAt(f) : positions[id] ?? vm.heroes.find((h) => h.id === id)?.position ?? undefined;
    if (at) flyTo({ cx: at.x, cy: at.y, zoom: Math.max(map.viewport.zoom, 3.2) });
  };
  const goTo = (hit: Hit) => {
    setQuery('');
    if (hit.entity?.kind === 'faction' && map.mode !== 'strategic') dispatch({ type: 'set-mode', mode: 'strategic' });
    select(hit.id);
  };

  return (
    <div className={`atlas ${dock ? 'panel-open' : 'panel-closed'}`}>
      <MapView
        vm={vm} state={map} positions={positions} features={features} overrides={layer.markerOverrides}
        dispatch={dispatch} onSize={onSize} onInteract={stopFlight}
        onMoveMarker={(id, p) => updateLayer((l) => setMarkerPosition(l, id, p))}
      />

      <div className="float search">
        <input
          type="search" value={query} placeholder="Seek a place, a person, an addition…" aria-label="Search places, people, factions and proposed additions"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) goTo(results[0]);
            if (e.key === 'Escape') setQuery('');
          }}
        />
        {query.trim() && (
          <ul className="results" role="listbox">
            {results.map((h) => (
              <li key={h.id}>
                <button role="option" aria-selected={false} onClick={() => goTo(h)}>
                  {h.feature ? '❧ ' : ''}{h.name} <small>{h.kind}{h.entity?.kind === 'location' && !positions[h.id] ? ' · not on the map' : ''}</small>
                </button>
              </li>
            ))}
            {!results.length && <li className="none">Nothing by that name in the record.</li>}
          </ul>
        )}
      </div>

      <div className="float modes" role="radiogroup" aria-label="Map mode">
        {(['exploration', 'strategic'] as MapMode[]).map((m) => (
          <button key={m} role="radio" aria-checked={map.mode === m} className={map.mode === m ? 'on' : ''} onClick={() => dispatch({ type: 'set-mode', mode: m })}>
            {m === 'exploration' ? 'Exploration' : 'Strategic'}
          </button>
        ))}
      </div>

      <div className="float tools">
        <button onClick={() => zoomBy(1.6)} aria-label="Zoom in" title="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" title="Zoom out">−</button>
        <button onClick={fit} title="Show the whole map" aria-label="Show the whole map">⛶</button>
        <button className={dock === 'layers' ? 'on' : ''} aria-pressed={dock === 'layers'} onClick={() => setDock(dock === 'layers' ? null : 'layers')}>Map Layers &amp; Legend</button>
        <button className={dock === 'details' ? 'on' : ''} aria-pressed={dock === 'details'} onClick={() => setDock(dock === 'details' ? null : 'details')}>Details</button>
      </div>

      {vm.timeline.enabled && vm.timeline.maxDay !== null && (
        <label className="float timeline">
          <span>Day {vm.timeline.day}</span>
          <input
            type="range" min={1} max={vm.timeline.maxDay} value={vm.timeline.day ?? vm.timeline.maxDay} aria-label="Day shown by the historical overlay"
            onChange={(e) => dispatch({ type: 'set-timeline-day', day: Number(e.target.value) })}
          />
          <span>of {vm.timeline.maxDay}</span>
        </label>
      )}

      <div className="float status-key" aria-label="World status key">
        <h3>World status</h3>
        <ul>
          <li><i className="k solid" /> Confirmed <small>(in the documents)</small></li>
          <li><i className="k faint" /> Known by report</li>
          <li><i className="k ring" /> Uncertain / provisional</li>
          <li><span className="leaf">❧</span> Atlas addition <small>(proposed)</small></li>
        </ul>
        {vm.unplaced.length > 0 && (
          <p>Not yet on the map: {vm.unplaced.map((u, i) => <span key={u.id}>{i > 0 && ', '}<button className="link" onClick={() => select(u.id, false)}>{u.name}</button></span>)}</p>
        )}
        {vm.orphanedUserData.length > 0 && <p>{vm.orphanedUserData.length} saved position(s) or note(s) refer to places absent from this import; they are kept.</p>}
      </div>

      {dock && (
        <aside className="details" aria-label={dock === 'layers' ? 'Map layers and legend' : 'Details'}>
          {dock === 'layers' ? (
            <LayersPanel
              map={map} dispatch={dispatch} layer={layer} onSelect={(id) => select(id)}
              onRestoreFeature={(id) => updateLayer((l) => restoreAtlasFeature(l, id))}
            />
          ) : (
            <DetailsPanel
              key={map.selectedId ?? `overview-${map.mode}`}
              ix={ix} layer={layer} state={map} features={features}
              onSelect={(id) => select(id)}
              onResetPosition={(id) => updateLayer((l) => clearMarkerPosition(l, id))}
              onPlaceAtCentre={(id) => updateLayer((l) => setMarkerPosition(l, id, { x: map.viewport.cx, y: map.viewport.cy }))}
              onAddNote={(entityId, title, text) => updateLayer((l) => addAnnotation(l, { entityId, title, text }))}
              onRemoveNote={(id) => updateLayer((l) => removeAnnotation(l, id))}
              onEditFeature={(id, edit) => updateLayer((l) => editAtlasFeature(l, id, edit))}
              onRemoveFeature={(id) => updateLayer((l) => removeAtlasFeature(l, id))}
            />
          )}
        </aside>
      )}
    </div>
  );
}
