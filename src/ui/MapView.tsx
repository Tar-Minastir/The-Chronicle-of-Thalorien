/**
 * SVG renderer for the map view-model. Rendering only: it owns no campaign
 * data and no persistence. All state changes go out through `dispatch` /
 * `onMoveMarker`.
 */
import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../domain/types';
import type { MapViewModel, MarkerVM } from '../map/layers';
import type { MapAction, MapState } from '../map/mapState';
import { WORLD_SIZE, clampToWorld, screenToWorld, worldToScreen, type Size } from '../map/viewport';

interface Props {
  vm: MapViewModel;
  state: MapState;
  dispatch: Dispatch<MapAction>;
  onMoveMarker: (id: string, position: Point) => void;
  onSize?: (size: Size) => void;
}

type Drag =
  | { kind: 'pan'; last: Point; moved: number; onMarker: boolean }
  | { kind: 'marker'; id: string; moved: number };

const SILENCE_LABEL = { awake: 'awake', holding: 'holding', dark: 'dark' } as const;

export function MapView({ vm, state, dispatch, onMoveMarker, onSize }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 600 });
  const [dragPos, setDragPos] = useState<{ id: string; position: Point } | null>(null);
  const drag = useRef<Drag | null>(null);
  const latest = useRef({ size, state });
  latest.current = { size, state };

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
    const markerId = (e.target as Element).closest('[data-marker]')?.getAttribute('data-marker');
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is an optimisation (keeps the drag alive outside the element); dragging works without it.
    }
    drag.current = markerId && state.editPositions
      ? { kind: 'marker', id: markerId, moved: 0 }
      : { kind: 'pan', last: local(e), moved: 0, onMarker: Boolean(markerId) };
    if (markerId) dispatch({ type: 'select', id: markerId });
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
    else if (d.kind === 'pan' && d.moved < 4 && !d.onMarker) dispatch({ type: 'select', id: null });
    setDragPos(null);
  };

  const origin = toScreen({ x: 0, y: 0 });
  const corner = toScreen({ x: WORLD_SIZE, y: WORLD_SIZE });
  const gridLines = Array.from({ length: 11 }, (_, i) => i * 100);
  const posOf = (m: MarkerVM) => toScreen(dragPos?.id === m.id ? dragPos.position : m.position);

  return (
    <svg
      ref={ref}
      className={`map ${state.mode}${state.editPositions ? ' editing' : ''}`}
      role="application"
      aria-label={`Campaign map, ${state.mode} mode`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <rect className="map-world" x={origin.x} y={origin.y} width={corner.x - origin.x} height={corner.y - origin.y} />
      {gridLines.map((g) => {
        const a = toScreen({ x: g, y: 0 });
        const b = toScreen({ x: 0, y: g });
        return (
          <g key={g} className="map-grid">
            <line x1={a.x} y1={origin.y} x2={a.x} y2={corner.y} />
            <line x1={origin.x} y1={b.y} x2={corner.x} y2={b.y} />
          </g>
        );
      })}

      {vm.relationLines.map((l, i) => {
        const a = toScreen(l.from);
        const b = toScreen(l.to);
        return (
          <g key={i} className={`map-relation ${l.certainty}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}>{l.label}</text>
          </g>
        );
      })}

      {vm.markers.map((m) => {
        const p = posOf(m);
        const r = m.tier === 0 ? 7 : m.tier === 1 ? 5 : 4;
        const cls = ['marker', m.kind, m.positionStatus, m.selected ? 'selected' : '', m.unanchored && state.overlays.provisional ? 'unanchored' : '']
          .filter(Boolean).join(' ');
        const status = m.positionStatus === 'user-placed' ? 'placed by you' : 'provisional position';
        return (
          <g
            key={m.id}
            data-marker={m.id}
            className={cls}
            transform={`translate(${p.x} ${p.y})`}
            tabIndex={0}
            role="button"
            aria-label={`${m.name} (${status})`}
            aria-pressed={m.selected}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                dispatch({ type: 'select', id: m.id });
              }
            }}
          >
            {m.silence && <circle className={`silence ${m.silence}`} r={r + 6} />}
            {m.isPartyHere && <rect className="party" x={-(r + 10)} y={-(r + 10)} width={(r + 10) * 2} height={(r + 10) * 2} transform="rotate(45)" />}
            <circle className="dot" r={r} />
            <text className="label" x={r + 5} y={4}>
              {m.name}
              {m.silence ? ` · ${SILENCE_LABEL[m.silence]}` : ''}
            </text>
            {m.badge > 0 && (
              <g className="badge" transform={`translate(${-(r + 6)} ${-(r + 6)})`}>
                <circle r={7} />
                <text y={3}>{m.badge}</text>
              </g>
            )}
            {(m.historyCount > 0 || m.noteCount > 0) && (
              <text className="sub" x={r + 5} y={16}>
                {m.historyCount > 0 ? `${m.historyCount} dated event${m.historyCount > 1 ? 's' : ''}` : ''}
                {m.historyCount > 0 && m.noteCount > 0 ? ' · ' : ''}
                {m.noteCount > 0 ? `${m.noteCount} note${m.noteCount > 1 ? 's' : ''}` : ''}
              </text>
            )}
          </g>
        );
      })}

      {vm.pins.map((a) => {
        const p = toScreen(a.position!);
        return (
          <g key={a.id} className="pin" transform={`translate(${p.x} ${p.y})`}>
            <path d="M0 0 L-5 -12 L5 -12 Z" />
            <text x={8} y={-6}>{a.title}</text>
          </g>
        );
      })}

      <g className="compass" transform={`translate(${size.width - 34} 40)`}>
        <path d="M0 -18 L6 6 L0 2 L-6 6 Z" />
        <text y={-22}>N</text>
      </g>
    </svg>
  );
}
