/**
 * World Atlas page: top atlas bar, the map filling everything below it, and floating chrome
 * (mode switch, controls, legend, timeline, dock). Holds only presentation state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Entity, Point } from '../domain/types';
import type { AtlasFeature } from '../atlas/geography';
import { ROUTES } from '../atlas/terrain';
import { eventDays, factionStance, recordedInPlay, searchEntities, type WorldIndex } from '../domain/selectors';
import { allEffectivePositions, type MapViewModel } from '../map/layers';
import type { MapAction, MapMode, MapState } from '../map/mapState';
import { coverViewport, fitPoints, showsMargin, zoomAt, type Size, type Viewport } from '../map/viewport';
import {
  addAnnotation, clearMarkerPosition, editAtlasFeature, removeAnnotation, removeAtlasFeature, restoreAtlasFeature, setMarkerPosition,
  type UserLayer,
} from '../storage/userLayer';
import { DetailsPanel } from './DetailsPanel';
import { LayersPanel } from './LayersPanel';
import { MapView } from './MapView';
import { Icon, type IconName } from './shell/icons';

export type Dock = 'details' | 'layers' | 'locations' | 'factions' | 'routes' | null;

interface Props {
  ix: WorldIndex;
  vm: MapViewModel;
  map: MapState;
  dispatch: Dispatch<MapAction>;
  layer: UserLayer;
  updateLayer: (fn: (l: UserLayer) => UserLayer) => void;
  features: AtlasFeature[];
  dock: Dock;
  setDock: (d: Dock) => void;
}

type Hit = { id: string; name: string; kind: string; entity?: Entity; feature?: AtlasFeature };
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TABS: [Dock, string, IconName][] = [[null, 'Atlas', 'compass'], ['locations', 'Locations', 'tower'], ['factions', 'Factions', 'banner'], ['routes', 'Routes', 'route']];
const ROUTE_KIND = { travelled: 'Journey recorded in the chronicle', planned: 'Directions held, not yet travelled', road: 'A named road' } as const;

export function AtlasPage({ ix, vm, map, dispatch, layer, updateLayer, features, dock, setDock }: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [marks, setMarks] = useState(false);
  const [legend, setLegend] = useState(true);
  const size = useRef<Size>({ width: 1200, height: 800 });
  const framed = useRef(false);
  const mapRef = useRef(map);
  mapRef.current = map;
  const anim = useRef(0);
  const landing = useRef(0);

  // Depend on data only (not on pan/zoom), so the painted map and routes are not rebuilt while the camera moves.
  const positions = useMemo(() => allEffectivePositions(ix, layer), [ix, layer]);
  const days = useMemo(() => eventDays(ix), [ix]);
  const party = ix.world.current?.partyLocationId ? positions[ix.world.current.partyLocationId] : undefined;
  const home = party ?? { x: 500, y: 500 };

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

  const stopFlight = useCallback(() => {
    cancelAnimationFrame(anim.current);
    clearTimeout(landing.current);
  }, []);
  useEffect(() => stopFlight, [stopFlight]);

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

  const onSize = useCallback((s: Size) => {
    size.current = s;
    // Aspect-aware framing on first load: if the stored view would show empty space around the
    // world, frame the campaign's present region so that the land fills the viewport instead.
    if (!framed.current && s.width > 50) {
      framed.current = true;
      if (showsMargin(mapRef.current.viewport, s)) dispatch({ type: 'set-viewport', viewport: coverViewport(home, s, 1.25) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const zoomBy = (factor: number) =>
    flyTo(zoomAt(map.viewport, size.current, { x: size.current.width / 2, y: size.current.height / 2 }, factor));

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
    setSearching(false);
    if (hit.entity?.kind === 'faction' && map.mode !== 'strategic') dispatch({ type: 'set-mode', mode: 'strategic' });
    select(hit.id);
  };

  // ---- timeline: campaign days, with the session log's dated entries as milestones
  const maxDay = vm.timeline.maxDay;
  const day = vm.timeline.day ?? maxDay;
  const setDay = (d: number | null) => {
    const latest = d === null || maxDay === null || d >= maxDay;
    dispatch({ type: 'set-overlay', overlay: 'history', on: !latest });
    dispatch({ type: 'set-timeline-day', day: latest ? null : d });
  };
  const atLatest = !vm.timeline.enabled || day === maxDay;
  const dateField = ix.world.current?.fields.find((f) => f.label === 'Date')?.text ?? '';
  const season = dateField.split(';')[1]?.split('.')[0]?.replace(/\*/g, '').trim() ?? '';
  const partyName = ix.world.geo.find((g) => g.id === ix.world.current?.partyLocationId)?.name;
  const eventNow = ix.world.entities
    .filter((e) => e.kind === 'event' && e.time?.dayStart !== undefined && day !== null && e.time.dayStart <= day)
    .sort((a, b) => b.time!.dayStart! - a.time!.dayStart!)[0];
  const caption = atLatest
    ? [season && season[0].toUpperCase() + season.slice(1), partyName].filter(Boolean).join(' · ')
    : eventNow ? eventNow.name : 'Before the first dated entry';

  const strategic = map.mode === 'strategic';
  const places = ix.world.geo.slice().sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const factions = ix.world.entities.filter((e) => e.kind === 'faction');
  const roads = features.filter((f) => f.type === 'road');

  return (
    <div className="atlas-page">
      {/* ---------------- top atlas bar ---------------- */}
      <header className="atlas-bar">
        <nav aria-label="Atlas views">
          {TABS.map(([d, label, icon], i) => {
            const on = d === null ? dock === null || dock === 'details' || dock === 'layers' : dock === d;
            return (
              <span key={label} className="tab-wrap">
                {i > 0 && <i className="sep" aria-hidden="true" />}
                <button className={on ? 'on' : ''} aria-pressed={on} onClick={() => setDock(d)}>
                  <Icon name={icon} size={19} /><span>{label}</span>
                </button>
              </span>
            );
          })}
        </nav>
        <div className="utilities">
          {searching && (
            <div className="search">
              <input
                autoFocus type="search" value={query} placeholder="Seek a place, a person, an addition…" aria-label="Search places, people, factions and proposed additions"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) goTo(results[0]);
                  if (e.key === 'Escape') { setQuery(''); setSearching(false); }
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
          )}
          <button className={`util${searching ? ' on' : ''}`} title="Search" aria-label="Search" aria-pressed={searching} onClick={() => setSearching(!searching)}><Icon name="search" /></button>
          <div className="util-wrap">
            <button className={`util${marks ? ' on' : ''}`} title="Saved views" aria-label="Saved views" aria-expanded={marks} onClick={() => setMarks(!marks)}><Icon name="bookmark" /></button>
            {marks && (
              <div className="popover" role="dialog" aria-label="Saved views">
                <h3>Saved views</h3>
                {map.bookmarks.map((b, i) => (
                  <div key={i} className="mark">
                    <button className="link" onClick={() => { flyTo(b.viewport); setMarks(false); }}>{b.name}</button>
                    <button className="link" aria-label={`Forget ${b.name}`} onClick={() => dispatch({ type: 'remove-bookmark', index: i })}>×</button>
                  </div>
                ))}
                {!map.bookmarks.length && <p className="hint">None yet.</p>}
                <button onClick={() => dispatch({ type: 'add-bookmark', name: `${partyName && atLatest ? '' : `Day ${day} · `}view at ${Math.round(map.viewport.cx)}, ${Math.round(map.viewport.cy)} ×${map.viewport.zoom.toFixed(1)}` })}>
                  Save this view
                </button>
              </div>
            )}
          </div>
          <button className={`util${dock === 'layers' ? ' on' : ''}`} title="Map layers & legend" aria-label="Map layers and legend" aria-pressed={dock === 'layers'} onClick={() => setDock(dock === 'layers' ? null : 'layers')}><Icon name="gear" /></button>
        </div>
      </header>

      <div className={`atlas ${dock ? 'panel-open' : 'panel-closed'}`}>
        <MapView
          vm={vm} state={map} positions={positions} features={features} overrides={layer.markerOverrides}
          dispatch={dispatch} onSize={onSize} onInteract={stopFlight}
          onMoveMarker={(id, p) => updateLayer((l) => setMarkerPosition(l, id, p))}
        />

        <div className="float modes" role="radiogroup" aria-label="Map mode">
          {(['exploration', 'strategic'] as MapMode[]).map((m) => (
            <button key={m} role="radio" aria-checked={map.mode === m} className={map.mode === m ? 'on' : ''} onClick={() => dispatch({ type: 'set-mode', mode: m })}>
              {m === 'exploration' ? 'Exploration' : 'Strategic'}
            </button>
          ))}
        </div>

        <div className="float tools" role="toolbar" aria-label="Map controls">
          <button title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.6)}><Icon name="plus" size={18} /></button>
          <button title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.6)}><Icon name="minus" size={18} /></button>
          <button title="Return to the company" aria-label="Reset view" onClick={() => flyTo(coverViewport(home, size.current, 1.25))}><Icon name="frame" size={18} /></button>
          <button title="Show the whole world" aria-label="Show the whole map" onClick={() => flyTo(fitPoints([{ x: 0, y: 0 }, { x: 1000, y: 1000 }], size.current, 0.02))}><Icon name="world" size={18} /></button>
          <button title="Move markers by dragging" aria-label="Move markers" aria-pressed={map.editPositions} className={map.editPositions ? 'on' : ''} onClick={() => dispatch({ type: 'toggle-edit-positions' })}><Icon name="move" size={18} /></button>
          <button title="Map layers & legend" aria-label="Layers" aria-pressed={dock === 'layers'} className={dock === 'layers' ? 'on' : ''} onClick={() => setDock(dock === 'layers' ? null : 'layers')}><Icon name="layers" size={18} /></button>
        </div>

        <div className={`float legend${legend ? '' : ' shut'}`}>
          <button className="legend-head" aria-expanded={legend} onClick={() => setLegend(!legend)}>Key {legend ? '▾' : '▸'}</button>
          {legend && (
            <ul>
              <li><i className="k here" /> Current location</li>
              <li><i className="k route" /> Journey recorded</li>
              <li><i className="k road" /> Named road</li>
              <li><i className="k faint" /> Known by report</li>
              <li><i className="k ring" /> Position uncertain</li>
              {strategic && <li><i className="k sigil" /> A silence</li>}
              {strategic && <li><i className="k flag" /> Faction named here</li>}
              <li><span className="leaf">❧</span> Proposed, not canon</li>
              <li><i className="k mist" /> Beyond the record</li>
            </ul>
          )}
        </div>

        {maxDay !== null && day !== null && (
          <div className="float timeline" role="group" aria-label="Campaign timeline">
            <button title="Earliest dated entry" aria-label="Earliest dated entry" disabled={!days.length || day <= days[0]} onClick={() => setDay(days[0])}><Icon name="first" size={18} /></button>
            <button title="Previous dated entry" aria-label="Previous dated entry" disabled={!days.some((d) => d < day)} onClick={() => setDay([...days].reverse().find((d) => d < day) ?? days[0])}><Icon name="prev" size={18} /></button>
            <div className="now">
              <Icon name="hourglass" size={22} />
              <div>
                <strong>Day {day}</strong>
                <span>{caption}</span>
              </div>
            </div>
            <button title="Next dated entry" aria-label="Next dated entry" disabled={atLatest} onClick={() => setDay(days.find((d) => d > day) ?? null)}><Icon name="next" size={18} /></button>
            <button title="Latest" aria-label="Latest" disabled={atLatest} onClick={() => setDay(null)}><Icon name="last" size={18} /></button>
            <div className="track" aria-hidden="true">
              {days.map((d) => (
                <button key={d} tabIndex={-1} className={`tick${d === day ? ' on' : ''}${d <= day ? ' past' : ''}`} style={{ left: `${(d / maxDay) * 100}%` }} title={`Day ${d}`} onClick={() => setDay(d)} />
              ))}
              <i className="cursor" style={{ left: `${(day / maxDay) * 100}%` }} />
            </div>
          </div>
        )}

        {dock && (
          <aside className="dock" aria-label="Atlas panel">
            <button className="dock-close" aria-label="Close panel" title="Close" onClick={() => setDock(null)}><Icon name="close" size={16} /></button>
            {dock === 'layers' && (
              <LayersPanel map={map} dispatch={dispatch} layer={layer} onSelect={(id) => { select(id); setDock('details'); }} onRestoreFeature={(id) => updateLayer((l) => restoreAtlasFeature(l, id))} />
            )}
            {dock === 'details' && (
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
            {dock === 'locations' && (
              <div className="page">
                <p className="eyebrow">Atlas</p>
                <h2>Locations</h2>
                <p className="hint">Every place the documents name. Positions are provisional. Choose one to travel there.</p>
                <ul className="index">
                  {places.map((g) => (
                    <li key={g.id}>
                      <button className={map.selectedId === g.id ? 'on' : ''} onClick={() => select(g.id)}>
                        <span>{g.name}</span>
                        <small>{!positions[g.id] ? 'not on the map' : g.id === ix.world.current?.partyLocationId ? 'the company is here' : recordedInPlay(ix, g.id) ? 'recorded in play' : 'known by report'}</small>
                      </button>
                    </li>
                  ))}
                </ul>
                <h3>Proposed additions</h3>
                <ul className="index">
                  {features.filter((f) => f.status === 'proposed').map((f) => (
                    <li key={f.id}><button className={map.selectedId === f.id ? 'on' : ''} onClick={() => select(f.id)}><span>❧ {f.name}</span><small>proposed · not canon</small></button></li>
                  ))}
                </ul>
              </div>
            )}
            {dock === 'factions' && (
              <div className="page">
                <p className="eyebrow">Atlas</p>
                <h2>Factions</h2>
                <p className="hint">As listed in the chronicle. A banner on the map means the faction’s entry names that place; the documents establish no territory.</p>
                <ul className="index">
                  {factions.map((f) => (
                    <li key={f.id}>
                      <button className={map.selectedId === f.id ? 'on' : ''} onClick={() => { if (!strategic) dispatch({ type: 'set-mode', mode: 'strategic' }); select(f.id, false); }}>
                        <span>{f.name}</span>
                        <small>{factionStance(f) === 'allied' ? 'entry says “allied”' : 'stance not stated'}{f.attrs.stale ? ' · may be out of date' : ''}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dock === 'routes' && (
              <div className="page">
                <p className="eyebrow">Atlas</p>
                <h2>Routes</h2>
                <p className="hint">Only journeys and roads the documents state. Lines are schematic: no road’s true course is recorded.</p>
                <ul className="index routes-index">
                  {ROUTES.map((r) => {
                    const pts = r.stops.map((s) => positions[`location:${s}`]).filter(Boolean);
                    return (
                      <li key={r.id}>
                        <button onClick={() => pts.length > 1 && flyTo(fitPoints(pts, size.current, 0.6))}>
                          <span><i className={`k ${r.kind === 'travelled' ? 'route' : r.kind}`} /> {r.label}</span>
                          <small>{ROUTE_KIND[r.kind]} · “{r.quote}”</small>
                        </button>
                      </li>
                    );
                  })}
                  {roads.map((f) => (
                    <li key={f.id}><button onClick={() => select(f.id)}><span>❧ {f.name}</span><small>proposed road · not canon</small></button></li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
