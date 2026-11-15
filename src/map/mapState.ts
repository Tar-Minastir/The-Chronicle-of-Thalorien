/**
 * Map UI state: a plain serialisable object and a pure reducer.
 * Persisted via CampaignRepository.saveUi('mapState', ...). No React here.
 */
import type { Point } from '../domain/types';
import { DEFAULT_VIEWPORT, clampViewport, panBy, zoomAt, type Size, type Viewport } from './viewport';

export type MapMode = 'exploration' | 'strategic';

export interface Overlays {
  /** Historical overlay: only show events/activity up to `timelineDay`. */
  history: boolean;
  /** User annotations (notes and pins). */
  annotations: boolean;
  /** Dashed "provisional position" styling and relation hints. */
  provisional: boolean;
}

export interface MapState {
  version: 1;
  mode: MapMode;
  viewport: Viewport;
  selectedId: string | null;
  overlays: Overlays;
  /** Day shown by the historical overlay; null = latest. */
  timelineDay: number | null;
  /** When true, dragging a marker moves it (and saves the position). */
  editPositions: boolean;
}

export const initialMapState = (): MapState => ({
  version: 1,
  mode: 'exploration',
  viewport: DEFAULT_VIEWPORT,
  selectedId: null,
  overlays: { history: false, annotations: true, provisional: true },
  timelineDay: null,
  editPositions: false,
});

export type MapAction =
  | { type: 'set-mode'; mode: MapMode }
  | { type: 'pan'; size: Size; dx: number; dy: number }
  | { type: 'zoom'; size: Size; anchor: Point; factor: number }
  | { type: 'set-viewport'; viewport: Viewport }
  | { type: 'select'; id: string | null }
  | { type: 'toggle-overlay'; overlay: keyof Overlays }
  | { type: 'set-timeline-day'; day: number | null }
  | { type: 'toggle-edit-positions' }
  | { type: 'restore'; state: MapState };

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case 'set-mode':
      return { ...state, mode: action.mode };
    case 'pan':
      return { ...state, viewport: panBy(state.viewport, action.size, action.dx, action.dy) };
    case 'zoom':
      return { ...state, viewport: zoomAt(state.viewport, action.size, action.anchor, action.factor) };
    case 'set-viewport':
      return { ...state, viewport: clampViewport(action.viewport) };
    case 'select':
      return { ...state, selectedId: action.id };
    case 'toggle-overlay':
      return { ...state, overlays: { ...state.overlays, [action.overlay]: !state.overlays[action.overlay] } };
    case 'set-timeline-day':
      return { ...state, timelineDay: action.day };
    case 'toggle-edit-positions':
      return { ...state, editPositions: !state.editPositions };
    case 'restore':
      return action.state;
  }
}

/** Validate anything read back from storage; fall back field by field to defaults. */
export function restoreMapState(raw: unknown): MapState {
  const d = initialMapState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<MapState>;
  const vp = r.viewport;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return {
    version: 1,
    mode: r.mode === 'strategic' || r.mode === 'exploration' ? r.mode : d.mode,
    viewport: vp && num(vp.cx) && num(vp.cy) && num(vp.zoom) ? clampViewport(vp) : d.viewport,
    selectedId: typeof r.selectedId === 'string' ? r.selectedId : null,
    overlays: {
      history: typeof r.overlays?.history === 'boolean' ? r.overlays.history : d.overlays.history,
      annotations: typeof r.overlays?.annotations === 'boolean' ? r.overlays.annotations : d.overlays.annotations,
      provisional: typeof r.overlays?.provisional === 'boolean' ? r.overlays.provisional : d.overlays.provisional,
    },
    timelineDay: num(r.timelineDay) ? r.timelineDay : null,
    editPositions: r.editPositions === true,
  };
}
