/**
 * User layer: everything the user creates, kept apart from imported data.
 * Keys are stable entity ids, so this survives re-imports untouched. The
 * importer never reads or writes it.
 */
import type { Point } from '../domain/types';
import { emptyAtlasEdits, type AtlasEdits } from '../atlas/geography';

export const USER_LAYER_VERSION = 2;

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
  /** locationId (or `atlas:` point-feature id) -> position chosen by the user (overrides the provisional point). */
  markerOverrides: Record<string, Point>;
  annotations: Annotation[];
  mergeDecisions: MergeDecision[];
  dismissedIssueIds: string[];
  /** The player's renames, re-descriptions and removals of PROPOSED atlas features. Never affects campaign data. */
  atlas: AtlasEdits;
}

export const emptyUserLayer = (): UserLayer => ({
  version: USER_LAYER_VERSION,
  markerOverrides: {},
  annotations: [],
  mergeDecisions: [],
  dismissedIssueIds: [],
  atlas: emptyAtlasEdits(),
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
  const edits: AtlasEdits['edits'] = {};
  for (const [id, e] of Object.entries(r.atlas?.edits ?? {})) {
    if (e && typeof e === 'object') {
      edits[id] = {
        name: typeof e.name === 'string' ? e.name : undefined,
        description: typeof e.description === 'string' ? e.description : undefined,
      };
    }
  }
  return {
    version: USER_LAYER_VERSION,
    markerOverrides: overrides,
    annotations: Array.isArray(r.annotations) ? r.annotations.filter((a) => a && typeof a.id === 'string') : [],
    mergeDecisions: Array.isArray(r.mergeDecisions) ? r.mergeDecisions : [],
    dismissedIssueIds: Array.isArray(r.dismissedIssueIds) ? r.dismissedIssueIds : [],
    atlas: {
      removed: Array.isArray(r.atlas?.removed) ? r.atlas.removed.filter((x) => typeof x === 'string') : [],
      edits,
    },
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

/** Rename or re-describe a proposed atlas feature. Empty strings fall back to the atlas's own text. */
export const editAtlasFeature = (l: UserLayer, id: string, edit: { name?: string; description?: string }): UserLayer => ({
  ...l,
  atlas: { ...l.atlas, edits: { ...l.atlas.edits, [id]: { ...l.atlas.edits[id], ...edit } } },
});

export const removeAtlasFeature = (l: UserLayer, id: string): UserLayer => ({
  ...l,
  atlas: { ...l.atlas, removed: [...new Set([...l.atlas.removed, id])] },
});

export const restoreAtlasFeature = (l: UserLayer, id: string): UserLayer => ({
  ...l,
  atlas: { ...l.atlas, removed: l.atlas.removed.filter((x) => x !== id) },
});
