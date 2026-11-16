/**
 * The atlas renderer. Rendering only: it owns no campaign data and no persistence.
 * All state changes go out through `dispatch` / `onMoveMarker`.
 *
 * THREE SEPARATE RENDERING SYSTEMS, bottom to top:
 *   1  Base geography      <BaseMap>  canvas: terrain, forests, mountains, waters. No names, no markers.
 *   2  Cartography         <g.carto>  SVG: routes, place names, geographical names.
 *   3  Interactive overlays<g.overlays> SVG: place symbols, proposed landmarks, sigils, banners, reports, heroes, notes.
 * Each can be switched off without touching the others; with 2 and 3 off, the painted world remains.
 */
import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../domain/types';
import { BaseMap } from '../atlas/BaseMap';
import { AtlasFrame, Banner, CompassRose, HeroToken, PlaceIcon, ProposedIcon, RouteLayer, SilenceSigil } from '../atlas/art';
import type { AtlasFeature } from '../atlas/geography';
import { ROUTES, terrainOf } from '../atlas/terrain';
import { PLACE_ART, Vignette, artUrl, useArtwork, type PlaceArt } from '../atlas/vignettes';
import type { MapViewModel, MarkerVM } from '../map/layers';
import type { MapAction, MapState } from '../map/mapState';
import { TIER_MIN_ZOOM, clampToWorld, scaleOf, screenToWorld, worldToScreen, type Size } from '../map/viewport';

/** Hook for the future Character Appearance Registry: return an approved portrait URL, or null for a monogram. */
export type PortraitResolver = (characterId: string) => string | null;

interface Props {
  vm: MapViewModel;
  state: MapState;
  /** location id -> effective position (for routes). */
  positions: Record<string, Point>;
  /** Atlas features as the player has them (edits applied; proposed ones already filtered by their layer). */
  features: AtlasFeature[];
  /** User-chosen positions, used for proposed point features the player has moved. */
  overrides: Record<string, Point>;
  dispatch: Dispatch<MapAction>;
  onMoveMarker: (id: string, position: Point) => void;
  onSize?: (size: Size) => void;
  /** Called when the user starts interacting, so a running camera animation can stop. */
  onInteract?: () => void;
  portraitFor?: PortraitResolver;
}

type Drag =
  | { kind: 'pan'; last: Point; moved: number; onTarget: boolean }
  | { kind: 'marker'; id: string; moved: number };

interface Label {
  id: string;
  text: string;
  x: number;
  y: number;
  cls: string;
  angle?: number;
  sub?: string;
  entity?: string;
  /** Major places are lettered on a parchment ribbon. */
  ribbon?: boolean;
  priority: number;
  width: number;
}

/** A place's illustration: a supplied painting if one exists under /atlas-art/places/, else the vector vignette. */
function PlaceArtwork({ slug, art, scale }: { slug: string; art: PlaceArt; scale: number }) {
  const painted = useArtwork(artUrl.place(slug));
  return (
    <g className="place-art" transform={`translate(0 7) scale(${scale})`}>
      {painted ? <image href={painted} x={-34} y={-58} width={68} height={62} preserveAspectRatio="xMidYMax meet" /> : <Vignette art={art} />}
    </g>
  );
}

const RECORDED_LABEL = { here: 'the company is here', 'in-play': 'recorded in play', report: 'known by report' } as const;

export function MapView({ vm, state, positions, features, overrides, dispatch, onMoveMarker, onSize, onInteract, portraitFor }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 600 });
  const [dragPos, setDragPos] = useState<{ id: string; position: Point } | null>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef({ size, onInteract });
  latest.current = { size, onInteract };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { width: Math.max(r.width, 1), height: Math.max(r.height, 1) };
      setSize(next);
      onSize?.(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Wheel must be registered non-passive to be able to stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      latest.current.onInteract?.();
      const r = el.getBoundingClientRect();
      dispatch({
        type: 'zoom',
        size: latest.current.size,
        anchor: { x: e.clientX - r.left, y: e.clientY - r.top },
        factor: Math.exp(-e.deltaY * 0.0015),
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, [dispatch, onSize]);

  const local = (e: ReactPointerEvent): Point => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toScreen = (p: Point) => worldToScreen(p, state.viewport, size);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    onInteract?.();
    const target = e.target as Element;
    // Nearest interactive ancestor wins, so a banner inside a place marker selects the faction, not the place.
    const hit = target.closest('[data-entity],[data-marker]');
    const markerId = hit?.getAttribute('data-marker') ?? null;
    const entityId = markerId ?? hit?.getAttribute('data-entity') ?? null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation (keeps the drag alive outside the element); dragging works without it.
    }
    drag.current = markerId && state.editPositions
      ? { kind: 'marker', id: markerId, moved: 0 }
      : { kind: 'pan', last: local(e), moved: 0, onTarget: Boolean(entityId) };
    if (entityId) dispatch({ type: 'select', id: entityId });
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (d.kind === 'pan') {
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.last = p;
      if (dx || dy) dispatch({ type: 'pan', size, dx, dy });
    } else {
      d.moved += 1;
      setDragPos({ id: d.id, position: clampToWorld(screenToWorld(p, state.viewport, size)) });
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // (The pointer is captured by the <svg>, so the event target cannot tell us what was clicked.)
    if (d.kind === 'marker' && dragPos && d.moved > 1) onMoveMarker(d.id, dragPos.position);
    else if (d.kind === 'pan' && d.moved < 4 && !d.onTarget) dispatch({ type: 'select', id: null });
    setDragPos(null);
  };
  const onKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dispatch({ type: 'select', id });
    }
  };

  const { layers, viewport } = state;
  const s = scaleOf(viewport, size);
  const worldTransform = `translate(${(size.width / 2 - viewport.cx * s).toFixed(2)} ${(size.height / 2 - viewport.cy * s).toFixed(2)}) scale(${s.toFixed(4)})`;
  const strategic = state.mode === 'strategic';
  const posOf = (m: MarkerVM) => toScreen(dragPos?.id === m.id ? dragPos.position : m.position);
  // Major places are drawn as illustrated vignettes; lesser ones gain theirs as the camera closes in.
  const artOf = (m: MarkerVM): PlaceArt | undefined =>
    !m.silence && (m.tier === 0 || viewport.zoom >= 2.4) ? PLACE_ART[m.id.replace('location:', '')] : undefined;

  // ---- what is shown
  const markers = vm.markers.filter((m) => (m.kind === 'site' ? layers.sites || Boolean(m.silence) : layers.places || Boolean(m.silence)));
  const proposedPoints = features
    .filter((f) => f.status === 'proposed' && f.shape.kind === 'point' && (viewport.zoom >= TIER_MIN_ZOOM[1] || state.selectedId === f.id))
    .map((f) => {
      const at = (f.shape as { at: [number, number] }).at;
      const world = dragPos?.id === f.id ? dragPos.position : overrides[f.id] ?? { x: at[0], y: at[1] };
      return { f, p: toScreen(world), moved: Boolean(overrides[f.id]) };
    });
  const roads = features.filter((f) => f.type === 'road' && f.shape.kind === 'line');

  // ---- labels: the most important claim their space first; a label that would overlap an earlier one is dropped
  const candidates: Label[] = [];
  for (const m of markers) {
    const p = posOf(m);
    const k = m.tier === 0 ? 1.15 : m.tier === 1 ? 0.95 : 0.8;
    const sub = m.silence ?? [
      m.historyCount > 0 ? `${m.historyCount} dated event${m.historyCount > 1 ? 's' : ''}` : '',
      m.noteCount > 0 ? `${m.noteCount} note${m.noteCount > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(' · ');
    candidates.push({
      id: m.id, text: m.name, x: p.x, y: p.y + (artOf(m) ? 26 : m.tier === 0 ? 30 : 11 * k + 13), sub: sub || undefined, ribbon: m.tier === 0,
      cls: `place-label ${m.kind} tier-${m.tier} ${m.recorded}`,
      priority: (m.selected ? 100 : 0) + (m.isPartyHere ? 50 : 0) + (m.silence ? 20 : 0) + (2 - m.tier) * 10,
      width: m.name.length * (m.tier === 0 ? 9.2 : m.kind === 'region' ? 11.5 : 7.6) + (m.tier === 0 ? 34 : 16),
    });
  }
  for (const f of features) {
    if (!f.name) continue;
    if (f.label && viewport.zoom >= TIER_MIN_ZOOM[f.label.tier] * 0.72) {
      const p = toScreen({ x: f.label.at[0], y: f.label.at[1] });
      candidates.push({
        id: f.id, entity: f.id, text: f.name, x: p.x, y: p.y, angle: f.label.angle,
        cls: `feature-label ${f.type} ${f.status}${state.selectedId === f.id ? ' selected' : ''}`,
        priority: state.selectedId === f.id ? 90 : 14 - f.label.tier * 5, width: f.name.length * 9 + 22,
      });
    }
  }
  for (const { f, p } of proposedPoints) {
    if (viewport.zoom < 2.4 && state.selectedId !== f.id) continue;
    candidates.push({
      id: f.id, text: f.name ?? '', x: p.x, y: p.y + 22, cls: `feature-label point proposed${state.selectedId === f.id ? ' selected' : ''}`,
      priority: state.selectedId === f.id ? 90 : 1, width: (f.name ?? '').length * 7 + 18,
    });
  }
  const shown: Label[] = [];
  if (layers.labels) {
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    // Hero tokens claim their space first, so no place name is lettered underneath them.
    const seen = new Set<string>();
    for (const h of vm.heroes) {
      if (!h.position || !h.locationId || seen.has(h.locationId)) continue;
      seen.add(h.locationId);
      const n = vm.heroes.filter((o) => o.locationId === h.locationId && o.position).length;
      const at = toScreen(dragPos?.id === h.locationId ? dragPos.position : h.position);
      boxes.push({ x: at.x - n * 19 - 30, y: at.y - 120, w: n * 38 + 60, h: 80 });
    }
    for (const c of candidates.sort((a, b) => b.priority - a.priority)) {
      // A rotated label is boxed by its diagonal extent.
      const tall = c.angle ? Math.min(c.width, 20 + Math.abs(Math.sin((c.angle * Math.PI) / 180)) * c.width) : c.sub ? 31 : 18;
      const wide = c.angle ? Math.max(20, Math.abs(Math.cos((c.angle * Math.PI) / 180)) * c.width) : c.width;
      const box = { x: c.x - wide / 2, y: c.y - (c.angle ? tall / 2 : 13), w: wide, h: tall };
      const clash = boxes.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h);
      if (clash && c.priority < 90) continue;
      boxes.push(box);
      shown.push(c);
    }
  }
  const labelled = new Set(shown.map((l) => l.id));

  // ---- route endpoints (visible stops)
  const stops = new Map<string, Point>();
  if (layers.routes) {
    for (const r of ROUTES) for (const st of r.stops) if (positions[`location:${st}`]) stops.set(st, toScreen(positions[`location:${st}`]));
  }

  // ---- heroes standing at the same place fan out in a row above it
  const placed = vm.heroes.filter((h) => h.position);
  const groups = new Map<string, typeof placed>();
  for (const h of placed) groups.set(h.locationId!, [...(groups.get(h.locationId!) ?? []), h]);

  return (
    <div className={`atlas-map ${state.mode} hl-${state.highlight}${state.editPositions ? ' editing' : ''}`}>
      <BaseMap features={features} viewport={viewport} size={size} layers={layers} />
      <svg
        ref={ref}
        className="map"
        role="application"
        aria-label={`World atlas, ${state.mode} mode`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* ---------------- system 2: cartographic information ---------------- */}
        <g className="carto">
          {layers.routes && (
            <>
              <g transform={worldTransform}><RouteLayer positions={positions} roads={roads} /></g>
              {[...stops.entries()].map(([id, p]) => <circle key={id} className="route-stop" cx={p.x} cy={p.y} r={3.4} />)}
            </>
          )}
          {shown.map((l) => (
            <g
              key={l.id}
              className={l.cls}
              data-entity={l.entity}
              transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)})${l.angle ? ` rotate(${l.angle})` : ''}`}
              {...(l.entity ? { tabIndex: 0, role: 'button', 'aria-label': `${l.text} (proposed atlas addition)`, onKeyDown: onKey(l.entity) } : {})}
            >
              {l.ribbon && (() => {
                const h = l.width / 2 - 14;
                return (
                  <g className="ribbon">
                    <path className="tail" d={`M${-h + 4} -9 L${-h - 13} -11 L${-h - 8} -2.5 L${-h - 13} 6 L${-h + 4} 8 Z M${h - 4} -9 L${h + 13} -11 L${h + 8} -2.5 L${h + 13} 6 L${h - 4} 8 Z`} />
                    <path className="band" d={`M${-h} -15 Q0 -17.5 ${h} -15 V5 Q0 2.5 ${-h} 5 Z`} />
                    <path className="fold" d={`M${-h} 5 L${-h + 4} 8 V-9 Z M${h} 5 L${h - 4} 8 V-9 Z`} />
                  </g>
                );
              })()}
              <text className="label" y={l.ribbon ? -1 : 0}>{l.cls.includes('proposed') ? `❧ ${l.text}` : l.text}</text>
              {l.sub && <text className="sub" y={l.ribbon ? 19 : 12}>{l.sub}</text>}
            </g>
          ))}
        </g>

        {/* ---------------- system 3: interactive overlays ---------------- */}
        <g className="overlays">
          {vm.relationLines.map((l, i) => {
            const a = toScreen(l.from);
            const b = toScreen(l.to);
            return (
              <g key={i} className={`map-relation ${l.certainty}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 5}>{l.label}</text>
              </g>
            );
          })}

          {markers.map((m) => {
            const p = posOf(m);
            const iconSize = m.tier === 0 ? 1.15 : m.tier === 1 ? 0.95 : 0.8;
            const cls = [
              'marker', m.kind, `tier-${m.tier}`, m.positionStatus, m.recorded,
              m.selected ? 'selected' : '', m.silence ? 'has-sigil' : '',
              m.unanchored && state.overlays.provisional ? 'unanchored' : '',
            ].filter(Boolean).join(' ');
            const status = m.positionStatus === 'user-placed' ? 'placed by you' : m.unanchored ? 'placeholder position' : 'provisional position';
            return (
              <g
                key={m.id}
                data-marker={m.id}
                className={cls}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                tabIndex={0}
                role="button"
                aria-label={`${m.name} (${status}; ${RECORDED_LABEL[m.recorded]})`}
                aria-pressed={m.selected}
                onKeyDown={onKey(m.id)}
              >
                {!labelled.has(m.id) && <title>{m.name}</title>}
                {m.unanchored && state.overlays.provisional && <circle className="uncertain" r={19 * iconSize} />}
                {m.selected && <circle className="select-ring" r={18 * iconSize} />}
                <circle className="hit" r={13} />
                {m.silence
                  ? <SilenceSigil state={m.silence} r={11 * iconSize} />
                  : artOf(m)
                    ? <PlaceArtwork slug={m.id.replace('location:', '')} art={artOf(m)!} scale={m.tier === 0 ? 1 : 0.68} />
                    : <><circle className="plinth" r={10.5 * iconSize} /><PlaceIcon kind={m.kind} terrain={terrainOf(m.id.replace('location:', ''))} size={iconSize} /></>}
                {m.positionStatus === 'user-placed' && <path className="user-pin" d="M8 -12 l3.5 -3.5 l3.5 3.5 l-3.5 3.5 Z" />}
                {!strategic && m.badge > 0 && (
                  <g className="badge" transform={`translate(${12 * iconSize} ${-11 * iconSize})`}>
                    <title>{`${m.badge} active quest${m.badge > 1 ? 's' : ''} name this place`}</title>
                    <path d="M-6 -7 H6 V5 L0 8 L-6 5 Z" />
                    <text y={3}>{m.badge}</text>
                  </g>
                )}
                {m.factions.map((f, i) => (
                  <g key={f.id} data-entity={f.id} className="banner-slot" transform={`translate(${-15 * iconSize - i * 17} ${-2})`}>
                    <Banner id={f.id} name={f.name} stale={f.stale} allied={f.stance === 'allied'} />
                  </g>
                ))}
                {m.forceReports > 0 && (
                  <g className="dispatch" transform={`translate(${14 * iconSize} ${7})`}>
                    <title>{`${m.forceReports} force report${m.forceReports > 1 ? 's' : ''} name this place (a report, not a confirmed position)`}</title>
                    <path d="M0 -8 L2.3 -3.2 L7.6 -2.5 L3.8 1.2 L4.7 6.5 L0 4 L-4.7 6.5 L-3.8 1.2 L-7.6 -2.5 L-2.3 -3.2 Z" />
                    <text y={3}>{m.forceReports}</text>
                  </g>
                )}
              </g>
            );
          })}

          {proposedPoints.map(({ f, p, moved }) => (
            <g
              key={f.id}
              data-marker={f.id}
              className={`marker proposed-point${state.selectedId === f.id ? ' selected' : ''}`}
              transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
              tabIndex={0}
              role="button"
              aria-label={`${f.name} (proposed atlas addition, not canon${moved ? '; moved by you' : ''})`}
              aria-pressed={state.selectedId === f.id}
              onKeyDown={onKey(f.id)}
            >
              {!labelled.has(f.id) && <title>{`${f.name} — proposed atlas addition`}</title>}
              {state.selectedId === f.id && <circle className="select-ring" r={15} />}
              <circle className="hit" r={12} />
              <ProposedIcon type={f.type} />
            </g>
          ))}

          <g className="heroes">
            {[...groups.entries()].map(([locId, list]) => {
              const base = toScreen(dragPos?.id === locId ? dragPos.position : list[0].position!);
              return list.map((h, i) => {
                const lead = h.role === 'player-character';
                const x = base.x + (i - (list.length - 1) / 2) * 38;
                const y = base.y - (lead ? 96 : 84);
                return (
                  <g
                    key={h.id}
                    data-entity={h.id}
                    className="hero-slot"
                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${h.name}, ${h.role === 'player-character' ? 'the hero' : 'companion'}`}
                    aria-pressed={h.selected}
                    onKeyDown={onKey(h.id)}
                  >
                    <title>{`${h.name} — ${h.basis}`}</title>
                    <HeroToken id={h.id} name={h.name} lead={lead} selected={h.selected} portraitUrl={portraitFor?.(h.id)} plate={lead ? h.name : undefined} />
                  </g>
                );
              });
            })}
          </g>

          {vm.pins.map((a) => {
            const p = toScreen(a.position!);
            return (
              <g key={a.id} className="pin" transform={`translate(${p.x} ${p.y})`}>
                <path d="M0 0 L-5 -12 L5 -12 Z" />
                <text x={8} y={-6}>{a.title}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mist" aria-hidden="true" />
      <AtlasFrame />
      <CompassRose />
    </div>
  );
}
