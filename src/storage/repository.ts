/**
 * CampaignRepository: the only module that persists anything.
 *
 * Stores:
 *   meta         'index'      -> ordered snapshot list + schema version
 *   snapshots    <snapshotId> -> immutable Snapshot (world, issues, diff vs previous)
 *   sourceTexts  <hash>       -> exact document text (deduplicated across snapshots)
 *   user         'layer'      -> UserLayer (annotations, marker positions, decisions)
 *   ui           'mapState'   -> persisted map view state
 *
 * Snapshots are append-only history. The original Markdown files are never
 * written: the app has no code path that writes outside this key-value store.
 */
import type { DocId, Issue, WorldData } from '../domain/types';
import { DOC_IDS } from '../domain/types';
import { diffWorlds, type WorldDiff } from '../importer/diff';
import { IMPORTER_VERSION, runImport, type ImportOptions, type RawSource, type RejectedSource } from '../importer';
import { AUTHORIZED_DOCS } from '../importer/sourcePolicy';
import type { KeyValueStore } from './kv';
import { emptyUserLayer, normalizeUserLayer, type UserLayer } from './userLayer';

export const SCHEMA_VERSION = 1;

export interface Snapshot {
  id: string;
  seq: number;
  createdAt: string;
  world: WorldData;
  issues: Issue[];
  /** Changes relative to the previous snapshot (null for the first). */
  diff: WorldDiff | null;
}

export interface SnapshotInfo {
  id: string;
  seq: number;
  createdAt: string;
  docHashes: Partial<Record<DocId, string>>;
  importerVersion: number;
  issueCount: number;
}

interface MetaIndex {
  schemaVersion: number;
  snapshots: SnapshotInfo[];
}

export type SyncOutcome =
  | { status: 'created'; snapshot: Snapshot; rejected: RejectedSource[] }
  | { status: 'unchanged'; snapshot: Snapshot | null; rejected: RejectedSource[] };

export class CampaignRepository {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
    private readonly importOptions: ImportOptions = {},
  ) {}

  private async index(): Promise<MetaIndex> {
    return (await this.kv.get<MetaIndex>('meta', 'index')) ?? { schemaVersion: SCHEMA_VERSION, snapshots: [] };
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    return (await this.index()).snapshots;
  }

  async getSnapshot(id: string): Promise<Snapshot | null> {
    return (await this.kv.get<Snapshot>('snapshots', id)) ?? null;
  }

  async latestSnapshot(): Promise<Snapshot | null> {
    const list = await this.listSnapshots();
    return list.length ? this.getSnapshot(list[list.length - 1].id) : null;
  }

  /** Exact text of a document as it was at a given snapshot. */
  async getSourceText(snapshotId: string, docId: DocId): Promise<string | null> {
    const info = (await this.listSnapshots()).find((s) => s.id === snapshotId);
    const hash = info?.docHashes[docId];
    return hash ? (await this.kv.get<string>('sourceTexts', hash)) ?? null : null;
  }

  /**
   * Import new or updated documents.
   * Documents not supplied are carried over from the latest snapshot, so a
   * single edited file can be synced on its own. Creates a snapshot only if a
   * document (or the importer version) actually changed.
   */
  async sync(inputs: RawSource[]): Promise<SyncOutcome> {
    const index = await this.index();
    const prevInfo = index.snapshots[index.snapshots.length - 1];
    const prev = prevInfo ? await this.getSnapshot(prevInfo.id) : null;

    const incoming = runImport(inputs, this.importOptions);
    const merged: RawSource[] = [];
    for (const doc of AUTHORIZED_DOCS) {
      const fresh = incoming.texts[doc.docId];
      if (fresh !== undefined) merged.push({ fileName: doc.fileName, text: fresh });
      else if (prevInfo?.docHashes[doc.docId]) {
        const kept = await this.kv.get<string>('sourceTexts', prevInfo.docHashes[doc.docId]!);
        if (kept !== undefined) merged.push({ fileName: doc.fileName, text: kept });
      }
    }
    const result = merged.length === inputs.length && !incoming.rejected.length ? incoming : runImport(merged, this.importOptions);
    // Rejections from the raw input must stay visible even though the merged run never saw those files.
    const issues = [...incoming.issues.filter((i) => i.code === 'source-rejected'), ...result.issues.filter((i) => i.code !== 'source-rejected')];

    const docHashes: Partial<Record<DocId, string>> = {};
    for (const s of result.world.sources) docHashes[s.docId] = s.hash;
    const unchanged =
      prevInfo !== undefined &&
      prevInfo.importerVersion === IMPORTER_VERSION &&
      DOC_IDS.every((d) => prevInfo.docHashes[d] === docHashes[d]);
    if (unchanged || !result.world.sources.length) {
      return { status: 'unchanged', snapshot: prev, rejected: incoming.rejected };
    }

    for (const s of result.world.sources) {
      await this.kv.set('sourceTexts', s.hash, result.texts[s.docId]!);
    }
    const seq = (prevInfo?.seq ?? 0) + 1;
    const createdAt = this.now().toISOString();
    const snapshot: Snapshot = {
      id: `snap-${String(seq).padStart(4, '0')}`,
      seq, createdAt,
      world: result.world,
      issues,
      diff: prev ? diffWorlds(prev.world, result.world, prev.issues, issues) : null,
    };
    await this.kv.set('snapshots', snapshot.id, snapshot);
    index.snapshots.push({ id: snapshot.id, seq, createdAt, docHashes, importerVersion: IMPORTER_VERSION, issueCount: issues.length });
    await this.kv.set('meta', 'index', index);
    return { status: 'created', snapshot, rejected: incoming.rejected };
  }

  async loadUserLayer(): Promise<UserLayer> {
    return normalizeUserLayer((await this.kv.get('user', 'layer')) ?? emptyUserLayer());
  }

  async saveUserLayer(layer: UserLayer): Promise<void> {
    await this.kv.set('user', 'layer', layer);
  }

  async loadUi<T>(key: string): Promise<T | undefined> {
    return this.kv.get<T>('ui', key);
  }

  async saveUi<T>(key: string, value: T): Promise<void> {
    await this.kv.set('ui', key, value);
  }
}
