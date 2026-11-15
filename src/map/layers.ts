/**
 * Map view-model: combines the three separated inputs
 *     geography (WorldData.geo)  +  user layer (positions, notes)  +  map state (mode, overlays)
 * into plain objects a renderer can draw. No React, no DOM: the SVG renderer in
 * src/ui/MapView.tsx is one consumer; a canvas/WebGL renderer could be another.
 */
import type { GeoKind, Point, SilenceState } from '../domain/types';
import { eventsAt, entitiesMentioning, type WorldIndex } from '../domain/selectors';
import type { Annotation, UserLayer } from '../storage/userLayer';
import type { MapState } from './mapState';
import { TIER_MIN_ZOOM } from './viewport';

export type PositionStatus = 'provisional' | 'user-placed';

export interface MarkerVM {
  id: string;
  name: string;
  kind: GeoKind;
  tier: 0 | 1 | 2;
  position: Point;
  positionStatus: PositionStatus;
  /** Provisional point with no stated relation behind it at all. */
  unanchored: boolean;
  selected: boolean;
  isPartyHere: boolean;
  /** Mode-specific badge: quests (exploration) or faction mentions (strategic). */
  badge: number;
  silence?: SilenceState;
  factions: { id: string; name: string; stale: boolean }[];
  /** Dated events naming this place up to the timeline day (historical overlay only). */
  historyCount: number;
  noteCount: number;
}

export interface RelationLineVM {
  from: Point;
  to: Point;
  label: string;
  certainty: 'stated' | 'inferred';
}

export interface MapViewModel {
  markers: MarkerVM[];
  /** Places known to the documents but with no position yet. */
  unplaced: { id: string; name: string }[];
  /** Free-floating user pins. */
  pins: Annotation[];
  /** Relation hints for the selected place. */
  relationLines: RelationLineVM[];
  /** Marker overrides / notes whose place is absent from this import (kept, not deleted). */
  orphanedUserData: string[];
  timeline: { enabled: boolean; day: number | null; maxDay: number | null };
}

/** Position actually used for a place: the user's, else the provisional one. */
export function effectivePosition(ix: WorldIndex, layer: UserLayer, id: string): { position: Point; status: PositionStatus } | null {
  const override = layer.markerOverrides[id];
  if (override) return { position: override, status: 'user-placed' };
  const geo = ix.world.geo.find((g) => g.id === id);
  return geo?.position ? { position: geo.position, status: 'provisional' } : null;
}

export function buildMapViewModel(ix: WorldIndex, layer: UserLayer, state: MapState): MapViewModel {
  const { world } = ix;
  const maxDay = world.current?.day ?? world.maxDay;
  const day = state.overlays.history ? state.timelineDay ?? maxDay : null;
  const strategic = state.mode === 'strategic';
  const geoIds = new Set(world.geo.map((g) => g.id));

  const markers: MarkerVM[] = [];
  const unplaced: MapViewModel['unplaced'] = [];
  for (const g of world.geo) {
    const pos = effectivePosition(ix, layer, g.id);
    if (!pos) {
      unplaced.push({ id: g.id, name: g.name });
      continue;
    }
    const selected = state.selectedId === g.id;
    const isPartyHere = world.current?.partyLocationId === g.id;
    const silence = world.silences.find((s) => s.locationId === g.id)?.status;
    const factions = world.relations
      .filter((r) => r.type === 'presence' && r.to === g.id)
      .map((r) => ix.entity.get(r.from))
      .filter((f) => f !== undefined)
      .map((f) => ({ id: f.id, name: f.name, stale: f.attrs.stale === true }));
    // Level of detail: minor places appear as you zoom in, but anything "important" in the current view is always shown.
    const important = selected || isPartyHere || (strategic && silence !== undefined) || pos.status === 'user-placed';
    if (state.viewport.zoom < TIER_MIN_ZOOM[g.tier] && !important) continue;

    markers.push({
      id: g.id, name: g.name, kind: g.kind, tier: g.tier,
      position: pos.position,
      positionStatus: pos.status,
      unanchored: g.positionBasis === 'no-stated-position' && pos.status === 'provisional',
      selected, isPartyHere,
      badge: strategic ? factions.filter((f) => !f.stale).length : entitiesMentioning(ix, g.id, 'quest').filter((q) => q.status === 'active').length,
      silence: strategic ? silence : undefined,
      factions: strategic ? factions : [],
      historyCount: day === null ? 0 : eventsAt(ix, g.id, day).length,
      noteCount: state.overlays.annotations ? layer.annotations.filter((a) => a.entityId === g.id).length : 0,
    });
  }

  const relationLines: RelationLineVM[] = [];
  const selectedGeo = world.geo.find((g) => g.id === state.selectedId);
  if (selectedGeo && state.overlays.provisional) {
    const from = effectivePosition(ix, layer, selectedGeo.id);
    for (const r of selectedGeo.relations) {
      const to = effectivePosition(ix, layer, r.target);
      if (!from || !to || !r.attested || r.kind === 'within') continue;
      relationLines.push({ from: from.position, to: to.position, label: r.bearing ? `${r.bearing} of` : 'near', certainty: r.certainty });
    }
  }

  const orphanedUserData = [
    ...Object.keys(layer.markerOverrides),
    ...layer.annotations.map((a) => a.entityId).filter((x): x is string => Boolean(x)),
  ].filter((id, i, all) => !geoIds.has(id) && !ix.entity.has(id) && all.indexOf(id) === i);

  return {
    markers,
    unplaced,
    pins: state.overlays.annotations ? layer.annotations.filter((a) => a.position && !a.entityId) : [],
    relationLines,
    orphanedUserData,
    timeline: { enabled: state.overlays.history, day, maxDay },
  };
}
