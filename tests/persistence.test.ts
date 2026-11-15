import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { applyUserDecisions } from '../src/domain/selectors';
import { IndexedDbStore, MemoryStore, type KeyValueStore } from '../src/storage/kv';
import { CampaignRepository } from '../src/storage/repository';
import {
  addAnnotation, clearMarkerPosition, decideMerge, dismissIssue, emptyUserLayer, normalizeUserLayer, setMarkerPosition,
} from '../src/storage/userLayer';
import { initialMapState, mapReducer, restoreMapState } from '../src/map/mapState';
import { ALL, JOURNAL, TEST_OPTIONS } from './fixtures';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
const repoOn = (kv: KeyValueStore) => new CampaignRepository(kv, clock, TEST_OPTIONS);
const journalWith = (text: string) => [{ fileName: 'journal.md', text }];

describe.each([
  ['memory', () => new MemoryStore() as KeyValueStore],
  ['IndexedDB', () => new IndexedDbStore(`test-${Math.random()}`, new IDBFactory()) as KeyValueStore],
])('CampaignRepository on %s', (_name, makeStore) => {
  it('creates a snapshot on first import and none when nothing changed', async () => {
    const repo = repoOn(makeStore());
    const first = await repo.sync(ALL);
    expect(first.status).toBe('created');
    expect(first.snapshot!.diff).toBeNull();
    const again = await repo.sync(ALL);
    expect(again.status).toBe('unchanged');
    expect(again.snapshot!.id).toBe(first.snapshot!.id);
    expect(await repo.listSnapshots()).toHaveLength(1);
  });

  it('syncs a single updated document, carrying the others over, and records the diff', async () => {
    const repo = repoOn(makeStore());
    await repo.sync(ALL);
    const edited = JOURNAL.replace('- **Old Sella** — Friendly.', '- **Old Sella** — Trusted.');
    const second = await repo.sync(journalWith(edited));
    expect(second.status).toBe('created');
    const snap = second.snapshot!;
    expect(snap.seq).toBe(2);
    expect(snap.world.sources).toHaveLength(4);
    expect(snap.diff!.documents.filter((d) => d.change === 'changed').map((d) => d.docId)).toEqual(['journal']);
    expect(snap.diff!.blocks.modified).toHaveLength(1);
  });

  it('keeps every snapshot and the exact source text of each version', async () => {
    const repo = repoOn(makeStore());
    const a = await repo.sync(ALL);
    const edited = JOURNAL + '\n- A later line.\n';
    const b = await repo.sync(journalWith(edited));
    expect(await repo.getSourceText(a.snapshot!.id, 'journal')).toBe(JOURNAL);
    expect(await repo.getSourceText(b.snapshot!.id, 'journal')).toBe(edited);
    const old = await repo.getSnapshot(a.snapshot!.id);
    expect(old!.world.blocks.some((x) => x.text === 'A later line.')).toBe(false);
    expect((await repo.latestSnapshot())!.id).toBe(b.snapshot!.id);
  });

  it('survives a restart: a new repository over the same store sees the same data', async () => {
    const kv = makeStore();
    const first = repoOn(kv);
    await first.sync(ALL);
    await first.saveUserLayer(setMarkerPosition(emptyUserLayer(), 'location:northkeep', { x: 1, y: 2 }));
    await first.saveUi('mapState', mapReducer(initialMapState(), { type: 'set-mode', mode: 'strategic' }));

    const second = repoOn(kv);
    expect((await second.latestSnapshot())!.world.entities.length).toBeGreaterThan(20);
    expect((await second.loadUserLayer()).markerOverrides['location:northkeep']).toEqual({ x: 1, y: 2 });
    expect(restoreMapState(await second.loadUi('mapState')).mode).toBe('strategic');
  });

  it('never lets an import touch the user layer', async () => {
    const repo = repoOn(makeStore());
    await repo.sync(ALL);
    let layer = setMarkerPosition(emptyUserLayer(), 'location:northkeep', { x: 10, y: 20 });
    layer = addAnnotation(layer, { entityId: 'location:the-sunken-chapel', title: 'Check', text: 'look under the weir' }, clock());
    await repo.saveUserLayer(layer);
    await repo.sync(journalWith(JOURNAL.replace('- **The Sunken Chapel:** below the weir.\n', '')));
    expect(await repo.loadUserLayer()).toEqual(layer);
  });

  it('returns an empty world state before any import', async () => {
    const repo = repoOn(makeStore());
    expect(await repo.latestSnapshot()).toBeNull();
    expect(await repo.loadUserLayer()).toEqual(emptyUserLayer());
    expect((await repo.sync([])).status).toBe('unchanged');
  });
});

describe('user layer', () => {
  it('updaters are pure and reversible', () => {
    const base = emptyUserLayer();
    const moved = setMarkerPosition(base, 'location:a', { x: 5, y: 6 });
    expect(base.markerOverrides).toEqual({});
    expect(clearMarkerPosition(moved, 'location:a')).toEqual(base);
  });

  it('normalises corrupt or outdated stored data instead of crashing', () => {
    expect(normalizeUserLayer(null)).toEqual(emptyUserLayer());
    expect(normalizeUserLayer('garbage')).toEqual(emptyUserLayer());
    const fixed = normalizeUserLayer({ markerOverrides: { ok: { x: 1, y: 2 }, bad: { x: 'NaN' }, worse: null }, annotations: 'nope' });
    expect(fixed.markerOverrides).toEqual({ ok: { x: 1, y: 2 } });
    expect(fixed.annotations).toEqual([]);
  });

  it('applies merge decisions and dismissals on read, without changing the imported data', async () => {
    const repo = repoOn(new MemoryStore());
    const snap = (await repo.sync(ALL)).snapshot!;
    const frozen = JSON.stringify(snap.world);
    const dup = snap.issues.find((i) => i.code === 'possible-duplicate')!;

    const same = applyUserDecisions(snap.world, snap.issues, decideMerge(emptyUserLayer(), dup.entityIds[0], dup.entityIds[1], 'same'));
    const sella = same.world.entities.filter((e) => e.id.startsWith('character:sella'));
    expect(sella).toHaveLength(1);
    expect(sella[0].records).toHaveLength(2);
    expect(sella[0].aliases).toContain('Sella Brook');
    expect(same.issues.some((i) => i.id === dup.id)).toBe(false);

    const distinct = applyUserDecisions(snap.world, snap.issues, decideMerge(emptyUserLayer(), dup.entityIds[0], dup.entityIds[1], 'distinct'));
    expect(distinct.world.entities.filter((e) => e.id.startsWith('character:sella'))).toHaveLength(2);
    expect(distinct.issues.some((i) => i.id === dup.id)).toBe(false);

    const other = snap.issues.find((i) => i.code === 'stale-metadata')!;
    expect(applyUserDecisions(snap.world, snap.issues, dismissIssue(emptyUserLayer(), other.id)).issues).not.toContainEqual(other);
    expect(JSON.stringify(snap.world)).toBe(frozen);
  });
});
