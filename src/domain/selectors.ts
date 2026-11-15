/**
 * Read-side queries over WorldData (+ the user layer). Pure. The UI should
 * get its data through these rather than walking WorldData by hand.
 */
import type { Block, Entity, EntityKind, Issue, Relation, SilenceStatus, WorldData } from './types';
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
