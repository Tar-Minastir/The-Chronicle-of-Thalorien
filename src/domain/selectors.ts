/**
 * Read-side queries over WorldData (+ the user layer). Pure. The UI should
 * get its data through these rather than walking WorldData by hand.
 */
import type { Block, CampaignTime, Entity, EntityKind, Issue, Relation, SilenceStatus, SourceRef, WorldData } from './types';
import type { UserLayer } from '../storage/userLayer';

export interface WorldIndex {
  world: WorldData;
  entity: Map<string, Entity>;
  block: Map<string, Block>;
  /** blockId -> ids of entities named in it. */
  entitiesInBlock: Map<string, string[]>;
}

export function indexWorld(world: WorldData): WorldIndex {
  const entitiesInBlock = new Map<string, string[]>();
  for (const [entityId, blockIds] of Object.entries(world.mentions)) {
    for (const b of blockIds) entitiesInBlock.set(b, [...(entitiesInBlock.get(b) ?? []), entityId]);
  }
  return {
    world,
    entity: new Map(world.entities.map((e) => [e.id, e])),
    block: new Map(world.blocks.map((b) => [b.id, b])),
    entitiesInBlock,
  };
}

/** Verbatim source blocks that mention an entity by name. */
export function mentionBlocks(ix: WorldIndex, entityId: string): Block[] {
  return (ix.world.mentions[entityId] ?? []).map((id) => ix.block.get(id)!).filter(Boolean);
}

/**
 * Entities of `kind` connected to `entityId` because one of their records sits
 * in a block that names it. This is co-mention ("appears with"), not a stated fact.
 */
export function entitiesMentioning(ix: WorldIndex, entityId: string, kind: EntityKind): Entity[] {
  const blocks = new Set(ix.world.mentions[entityId] ?? []);
  return ix.world.entities.filter((e) => e.kind === kind && e.id !== entityId && e.records.some((r) => blocks.has(r.ref.blockId)));
}

/** Named entities of `kind` that appear in the same blocks as `entityId`. */
export function coMentioned(ix: WorldIndex, entityId: string, kind: EntityKind): { entity: Entity; count: number }[] {
  const counts = new Map<string, number>();
  for (const blockId of ix.world.mentions[entityId] ?? []) {
    for (const other of ix.entitiesInBlock.get(blockId) ?? []) {
      if (other !== entityId) counts.set(other, (counts.get(other) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([id, count]) => ({ entity: ix.entity.get(id)!, count }))
    .filter((x) => x.entity?.kind === kind)
    .sort((a, b) => b.count - a.count);
}

export const relationsFrom = (world: WorldData, id: string): Relation[] => world.relations.filter((r) => r.from === id);
export const relationsTo = (world: WorldData, id: string): Relation[] => world.relations.filter((r) => r.to === id);
export const silenceOf = (world: WorldData, locationId: string): SilenceStatus | undefined =>
  world.silences.find((s) => s.locationId === locationId);

/** Events whose record names the location, optionally limited to those dated on or before `day`. */
export function eventsAt(ix: WorldIndex, locationId: string, upToDay: number | null = null): Entity[] {
  return entitiesMentioning(ix, locationId, 'event')
    .filter((e) => upToDay === null || (e.time?.dayStart !== undefined && e.time.dayStart <= upToDay))
    .sort((a, b) => (a.time?.dayStart ?? Infinity) - (b.time?.dayStart ?? Infinity));
}

/** The days on which the session log dates an entry, ascending. These are the timeline's milestones. */
export function eventDays(ix: WorldIndex): number[] {
  const days = new Set<number>();
  for (const e of ix.world.entities) if (e.kind === 'event' && e.time?.dayStart !== undefined) days.add(e.time.dayStart);
  return [...days].sort((a, b) => a - b);
}

/** The last day on which a dated session-log entry names the place, or null. Not proof of a visit. */
export function lastLoggedDay(ix: WorldIndex, locationId: string): number | null {
  const days = entitiesMentioning(ix, locationId, 'event').map((e) => e.time?.dayEnd ?? e.time?.dayStart).filter((d): d is number => d !== undefined);
  return days.length ? Math.max(...days) : null;
}

/** True when the chronicle's session log names the place. This is "appears in the record of play", not proof of a visit. */
export function recordedInPlay(ix: WorldIndex, locationId: string): boolean {
  return entitiesMentioning(ix, locationId, 'event').length > 0;
}

export interface HeroPlacement {
  entity: Entity;
  role: 'player-character' | 'companion';
  /** Null when the documents do not say where the character currently is. */
  locationId: string | null;
  basis: string;
  ref?: SourceRef;
}

/**
 * Where the hero and companions are, as far as the chronicle's "CURRENT STATE" says.
 * Deliberately narrow: only the player character and sheet companions, and a companion
 * is placed only if the Location line itself names them. Other people named on that line
 * are NOT placed (being mentioned there does not mean being there).
 */
export function heroPlacements(ix: WorldIndex): HeroPlacement[] {
  const cur = ix.world.current;
  const here = cur?.partyLocationId ?? null;
  const named = new Set(cur?.partyLocationRef ? ix.entitiesInBlock.get(cur.partyLocationRef.blockId) ?? [] : []);
  const out: HeroPlacement[] = [];
  for (const e of ix.world.entities) {
    if (e.kind !== 'character') continue;
    if (e.attrs.role === 'player-character') {
      out.push({
        entity: e, role: 'player-character', locationId: here, ref: cur?.partyLocationRef,
        basis: here ? 'The chronicle’s current-state Location line.' : 'No current location is recorded.',
      });
    } else if (e.attrs.role === 'companion') {
      const placed = here !== null && named.has(e.id);
      out.push({
        entity: e, role: 'companion', locationId: placed ? here : null, ref: placed ? cur?.partyLocationRef : undefined,
        basis: placed ? 'Named on the chronicle’s current-state Location line.' : 'Not named on the chronicle’s Location line; whereabouts not recorded there.',
      });
    }
  }
  return out;
}

export interface ForceReport {
  entity: Entity;
  text: string;
  ref: SourceRef;
  asOf?: CampaignTime;
  /** Places named in the same entry. A report naming a place does not confirm the force is there. */
  locationIds: string[];
}

const HEADCOUNT = /(?:~|about\s)?\d+\s+(?:men|riders|rangers|soldiers|spears|swords)\b/;

/** Faction entries and open threads that state a head-count. Quoted reports, not unit positions. */
export function forceReports(ix: WorldIndex): ForceReport[] {
  const out: ForceReport[] = [];
  for (const e of ix.world.entities) {
    if (e.kind !== 'faction' && e.kind !== 'thread') continue;
    for (const r of e.records) {
      if (!HEADCOUNT.test(r.text)) continue;
      const locationIds = (ix.entitiesInBlock.get(r.ref.blockId) ?? []).filter((id) => id.startsWith('location:'));
      out.push({ entity: e, text: r.text, ref: r.ref, asOf: r.asOf, locationIds });
    }
  }
  return out;
}

/** The only political stance the documents state in a faction entry is "allied". Anything else is unknown. */
export function factionStance(e: Entity): 'allied' | 'unknown' {
  return e.records.some((r) => /\ballied\b/i.test(r.text)) ? 'allied' : 'unknown';
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Name/alias search over the kinds that can be shown on the map. */
export function searchEntities(ix: WorldIndex, query: string, limit = 8): Entity[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (e: Entity) => {
    const names = [e.name, ...e.aliases].map(fold);
    if (names.some((n) => n === q)) return 0;
    if (names.some((n) => n.startsWith(q) || n.replace(/^the /, '').startsWith(q))) return 1;
    return names.some((n) => n.includes(q)) ? 2 : -1;
  };
  return ix.world.entities
    .filter((e) => e.kind === 'location' || e.kind === 'character' || e.kind === 'faction')
    .map((e) => ({ e, r: rank(e) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((x) => x.e);
}

/**
 * Apply the user's decisions on top of imported data, without mutating it:
 *  - 'same' merge decisions fold the second entity's records/aliases into the first;
 *  - decided or dismissed issues are filtered out.
 */
export function applyUserDecisions(world: WorldData, issues: Issue[], layer: UserLayer): { world: WorldData; issues: Issue[] } {
  const same = layer.mergeDecisions.filter((d) => d.decision === 'same');
  const decidedPairs = new Set(layer.mergeDecisions.map((d) => d.ids.join('|')));
  const dismissed = new Set(layer.dismissedIssueIds);
  const visibleIssues = issues.filter(
    (i) => !dismissed.has(i.id) && !(i.code === 'possible-duplicate' && decidedPairs.has([...i.entityIds].sort().join('|'))),
  );
  if (!same.length) return { world, issues: visibleIssues };

  const redirect = new Map<string, string>();
  const target = (id: string): string => (redirect.has(id) ? target(redirect.get(id)!) : id);
  for (const d of same) {
    const [keep, drop] = [target(d.ids[0]), target(d.ids[1])];
    if (keep !== drop) redirect.set(drop, keep);
  }
  const merged = new Map<string, Entity>();
  for (const e of world.entities) {
    const id = target(e.id);
    const into = merged.get(id);
    if (!into) {
      merged.set(id, id === e.id ? e : { ...e, id });
    } else {
      merged.set(id, {
        ...into,
        aliases: [...new Set([...into.aliases, e.name, ...e.aliases])].filter((a) => a !== into.name),
        records: [...into.records, ...e.records],
        attrs: { ...e.attrs, ...into.attrs },
      });
    }
  }
  const mentions: Record<string, string[]> = {};
  for (const [id, blocks] of Object.entries(world.mentions)) {
    mentions[target(id)] = [...new Set([...(mentions[target(id)] ?? []), ...blocks])];
  }
  return {
    world: {
      ...world,
      entities: [...merged.values()],
      mentions,
      relations: world.relations.map((r) => ({ ...r, from: target(r.from), to: target(r.to) })),
      claims: world.claims.map((c) => (c.entityId ? { ...c, entityId: target(c.entityId) } : c)),
    },
    issues: visibleIssues,
  };
}
