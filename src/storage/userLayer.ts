/**
 * User layer: everything the user creates, kept apart from imported data.
 * Keys are stable entity ids, so this survives re-imports untouched. The
 * importer never reads or writes it.
 */
import type { Point } from '../domain/types';

export const USER_LAYER_VERSION = 1;

export interface Annotation {
  id: string;
  title: string;
  text: string;
  /** Attached to an entity (usually a location) ... */
  entityId?: string;
  /** ... or pinned at a free map position. */
  position?: Point;
  createdAt: string;
  updatedAt: string;
}

export interface MergeDecision {
  /** Sorted pair of entity ids. */
  ids: [string, string];
  decision: 'same' | 'distinct';
  decidedAt: string;
}

export interface UserLayer {
  version: number;
  /** locationId -> position chosen by the user (overrides the provisional point). */
  markerOverrides: Record<string, Point>;
  annotations: Annotation[];
  mergeDecisions: MergeDecision[];
  dismissedIssueIds: string[];
}

export const emptyUserLayer = (): UserLayer => ({
  version: USER_LAYER_VERSION,
  markerOverrides: {},
  annotations: [],
  mergeDecisions: [],
  dismissedIssueIds: [],
});

/** Accept anything that was stored (older versions, partial objects) and return a valid layer. */
export function normalizeUserLayer(raw: unknown): UserLayer {
  const base = emptyUserLayer();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<UserLayer>;
  const overrides: Record<string, Point> = {};
  for (const [id, p] of Object.entries(r.markerOverrides ?? {})) {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) overrides[id] = { x: p.x, y: p.y };
  }
  return {
    version: USER_LAYER_VERSION,
    markerOverrides: overrides,
    annotations: Array.isArray(r.annotations) ? r.annotations.filter((a) => a && typeof a.id === 'string') : [],
    mergeDecisions: Array.isArray(r.mergeDecisions) ? r.mergeDecisions : [],
    dismissedIssueIds: Array.isArray(r.dismissedIssueIds) ? r.dismissedIssueIds : [],
  };
}

// Pure updaters. Each returns a new layer.

export const setMarkerPosition = (l: UserLayer, id: string, p: Point): UserLayer => ({
  ...l,
  markerOverrides: { ...l.markerOverrides, [id]: { x: p.x, y: p.y } },
});

export function clearMarkerPosition(l: UserLayer, id: string): UserLayer {
  const { [id]: _removed, ...rest } = l.markerOverrides;
  return { ...l, markerOverrides: rest };
}

export function addAnnotation(l: UserLayer, a: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>, now = new Date()): UserLayer {
  const stamp = now.toISOString();
  const id = `note:${stamp}:${l.annotations.length}`;
  return { ...l, annotations: [...l.annotations, { ...a, id, createdAt: stamp, updatedAt: stamp }] };
}

export const removeAnnotation = (l: UserLayer, id: string): UserLayer => ({
  ...l,
  annotations: l.annotations.filter((a) => a.id !== id),
});

export function decideMerge(l: UserLayer, a: string, b: string, decision: MergeDecision['decision'], now = new Date()): UserLayer {
  const ids = [a, b].sort() as [string, string];
  const others = l.mergeDecisions.filter((d) => d.ids[0] !== ids[0] || d.ids[1] !== ids[1]);
  return { ...l, mergeDecisions: [...others, { ids, decision, decidedAt: now.toISOString() }] };
}

export const dismissIssue = (l: UserLayer, issueId: string): UserLayer => ({
  ...l,
  dismissedIssueIds: [...new Set([...l.dismissedIssueIds, issueId])],
});
