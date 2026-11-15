/**
 * Map view-model: combines the three separated inputs
 *     geography (WorldData.geo)  +  user layer (positions, notes)  +  map state (mode, overlays, layers)
 * into plain objects a renderer can draw. No React, no DOM: the SVG renderer in
 * src/ui/MapView.tsx is one consumer; a canvas/WebGL renderer could be another.
 */
import type { GeoKind, Point, SilenceState, SourceRef } from '../domain/types';
import {
  eventsAt, entitiesMentioning, factionStance, forceReports, heroPlacements, recordedInPlay, type WorldIndex,
} from '../domain/selectors';
import type { Annotation, UserLayer } from '../storage/userLayer';
import type { MapState } from './mapState';
import { TIER_MIN_ZOOM } from './viewport';

export type PositionStatus = 'provisional' | 'user-placed';
/** 'here' = current party location; 'in-play' = named in the session log; 'report' = known only from other entries. */
export type RecordedStatus = 'here' | 'in-play' | 'report';

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
  recorded: RecordedStatus;
  /** Mode-specific badge: quests (exploration) or faction mentions (strategic). */
  badge: number;
  silence?: SilenceState;
  factions: { id: string; name: string; stale: boolean; stance: 'allied' | 'unknown' }[];
  /** Strategic: quoted head-count reports whose entry names this place (not a confirmed position). */
  forceReports: number;
  /** Dated events naming this place up to the timeline day (historical overlay only). */
  historyCount: number;
  noteCount: number;
}

export interface HeroVM {
  id: string;
  name: string;
  role: 'player-character' | 'companion';
  locationId: string | null;
  /** Position of the place the hero is recorded at; null when whereabouts are not recorded. */
  position: Point | null;
  basis: string;
  ref?: SourceRef;
  selected: boolean;
}

export interface RelationLineVM {
  from: Point;
  to: Point;
  label: string;
  certainty: 'stated' | 'inferred';
}

export interface MapViewModel {
  markers: MarkerVM[];
  /** Hero and companions. Those with `position: null` are listed in the roster but not drawn. */
  heroes: HeroVM[];
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

/** Effective position of every placed location. Independent of map state, so illustration layers can memoise on it. */
export function allEffectivePositions(ix: WorldIndex, layer: UserLayer): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const g of ix.world.geo) {
    const p = effectivePosition(ix, layer, g.id);
    if (p) out[g.id] = p.position;
  }
  return out;
}

export function buildMapViewModel(ix: WorldIndex, layer: UserLayer, state: MapState): MapViewModel {
  const { world } = ix;
  const maxDay = world.current?.day ?? world.maxDay;
  const day = state.overlays.history ? state.timelineDay ?? maxDay : null;
  const strategic = state.mode === 'strategic';
  const geoIds = new Set(world.geo.map((g) => g.id));
  const reports = strategic && state.layers.reports ? forceReports(ix) : [];

  const heroes: HeroVM[] = state.layers.heroes
    ? heroPlacements(ix).map((h) => ({
        id: h.entity.id, name: h.entity.name, role: h.role, locationId: h.locationId,
        position: h.locationId ? effectivePosition(ix, layer, h.locationId)?.position ?? null : null,
        basis: h.basis, ref: h.ref, selected: state.selectedId === h.entity.id,
      }))
    : [];
  const heroPlaces = new Set(heroes.filter((h) => h.selected).map((h) => h.locationId));

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
      .map((f) => ({ id: f.id, name: f.name, stale: f.attrs.stale === true, stance: factionStance(f) }));
    // Level of detail: minor places appear as you zoom in, but anything "important" in the current view is always shown.
    const important =
      selected || isPartyHere || heroPlaces.has(g.id) || (strategic && silence !== undefined) || pos.status === 'user-placed';
    if (state.viewport.zoom < TIER_MIN_ZOOM[g.tier] && !important) continue;

    markers.push({
      id: g.id, name: g.name, kind: g.kind, tier: g.tier,
      position: pos.position,
      positionStatus: pos.status,
      unanchored: g.positionBasis === 'no-stated-position' && pos.status === 'provisional',
      selected, isPartyHere,
      recorded: isPartyHere ? 'here' : recordedInPlay(ix, g.id) ? 'in-play' : 'report',
      badge: strategic ? factions.filter((f) => !f.stale).length : entitiesMentioning(ix, g.id, 'quest').filter((q) => q.status === 'active').length,
      silence: strategic && state.layers.silences ? silence : undefined,
      factions: strategic && state.layers.factions ? factions : [],
      forceReports: reports.filter((r) => r.locationIds.includes(g.id)).length,
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
    heroes,
    unplaced,
    pins: state.overlays.annotations ? layer.annotations.filter((a) => a.position && !a.entityId) : [],
    relationLines,
    orphanedUserData,
    timeline: { enabled: state.overlays.history, day, maxDay },
  };
}
