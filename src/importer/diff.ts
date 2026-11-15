/** Structural diff between two imports. Pure; used to describe what a re-import changed. */
import type { Block, DocId, Entity, EntityKind, Issue, WorldData } from '../domain/types';
import { DOC_IDS } from '../domain/types';
import { hashString, stripMd } from '../domain/text';
import { leadOf } from './markdown';

export interface BlockSummary {
  docId: DocId;
  line: number;
  headingPath: string[];
  text: string;
}

export interface WorldDiff {
  documents: { docId: DocId; change: 'added' | 'removed' | 'changed' | 'unchanged' }[];
  blocks: { added: BlockSummary[]; removed: BlockSummary[]; modified: { before: BlockSummary; after: BlockSummary }[] };
  entities: {
    added: { id: string; kind: EntityKind; name: string }[];
    removed: { id: string; kind: EntityKind; name: string }[];
    changed: { id: string; kind: EntityKind; name: string }[];
  };
  issues: { opened: string[]; resolved: string[] };
}

const contentKey = (b: Block) => b.id.replace(/~\d+$/, '');
const summary = (b: Block): BlockSummary => ({ docId: b.docId, line: b.line, headingPath: b.headingPath, text: b.text });
const pairKey = (b: Block) =>
  `${b.docId}|${b.headingPath.join('/')}|${leadOf(b.text).lead || stripMd(b.text).split(/\s+/).slice(0, 4).join(' ')}`;
const entitySig = (e: Entity) =>
  hashString([e.name, e.status ?? '', ...e.records.map((r) => r.text).sort()].join('\u0001'));

export function diffWorlds(prev: WorldData | null, next: WorldData, prevIssues: Issue[] = [], nextIssues: Issue[] = []): WorldDiff {
  const documents = DOC_IDS.map((docId) => {
    const a = prev?.sources.find((s) => s.docId === docId);
    const b = next.sources.find((s) => s.docId === docId);
    const change = !a && b ? 'added' : a && !b ? 'removed' : a && b && a.hash !== b.hash ? 'changed' : 'unchanged';
    return { docId, change } as WorldDiff['documents'][number];
  });

  const count = (blocks: Block[]) => {
    const m = new Map<string, Block[]>();
    for (const b of blocks) m.set(contentKey(b), [...(m.get(contentKey(b)) ?? []), b]);
    return m;
  };
  const before = count(prev?.blocks ?? []);
  const after = count(next.blocks);
  let added: Block[] = [];
  let removed: Block[] = [];
  for (const [k, list] of after) added.push(...list.slice(before.get(k)?.length ?? 0));
  for (const [k, list] of before) removed.push(...list.slice(after.get(k)?.length ?? 0));

  // A removed and an added block under the same heading with the same lead are one modification.
  const modified: WorldDiff['blocks']['modified'] = [];
  for (const r of [...removed]) {
    const match = added.find((a) => pairKey(a) === pairKey(r));
    if (!match) continue;
    modified.push({ before: summary(r), after: summary(match) });
    added = added.filter((a) => a !== match);
    removed = removed.filter((x) => x !== r);
  }

  const pe = new Map((prev?.entities ?? []).map((e) => [e.id, e]));
  const ne = new Map(next.entities.map((e) => [e.id, e]));
  const brief = (e: Entity) => ({ id: e.id, kind: e.kind, name: e.name });
  const prevIds = new Set(prevIssues.map((i) => i.id));
  const nextIds = new Set(nextIssues.map((i) => i.id));

  return {
    documents,
    blocks: { added: added.map(summary), removed: removed.map(summary), modified },
    entities: {
      added: [...ne.values()].filter((e) => !pe.has(e.id)).map(brief),
      removed: [...pe.values()].filter((e) => !ne.has(e.id)).map(brief),
      changed: [...ne.values()].filter((e) => pe.has(e.id) && entitySig(pe.get(e.id)!) !== entitySig(e)).map(brief),
    },
    issues: {
      opened: [...nextIds].filter((i) => !prevIds.has(i)),
      resolved: [...prevIds].filter((i) => !nextIds.has(i)),
    },
  };
}

export function diffIsEmpty(d: WorldDiff): boolean {
  return (
    d.documents.every((x) => x.change === 'unchanged') &&
    !d.blocks.added.length && !d.blocks.removed.length && !d.blocks.modified.length
  );
}
