/**
 * Importer entry point: authorized Markdown texts in, WorldData + Issues out.
 *
 * Pure and deterministic: same texts -> same result. No I/O, no network, no AI.
 * Callers (browser file picker, dev-server sync, CLI) are thin adapters that
 * hand it `{ fileName, text }` pairs; the source policy is re-applied here so
 * no adapter can bypass it.
 */
import type { Block, DocId, Issue, SourceMeta, WorldData } from '../domain/types';
import { hashString } from '../domain/text';
import type { GazetteerEntry } from '../campaign/gazetteer';
import type { FactProbe } from '../campaign/profile';
import { parseTime } from '../domain/time';
import { WorldBuilder } from './builder';
import { checkDuplicates, checkMetadata, probeClaims, reportClaims } from './consistency';
import { extractCharacterSheet, extractChronicle, extractJournal, extractRulings } from './extract/documents';
import { resolveDeferredAttitudes, type DeferredAttitude } from './extract/people';
import { buildGeography } from './geography';
import { parseMarkdown } from './markdown';
import { AUTHORIZED_DOCS, REJECT_MESSAGES, baseName, classifyFileName, verifyContent, type RejectReason } from './sourcePolicy';

/** Bump when extraction rules change, so stored snapshots are recomputed. */
export const IMPORTER_VERSION = 1;

export interface RawSource {
  fileName: string;
  text: string;
}

export interface RejectedSource {
  fileName: string;
  reason: RejectReason;
}

export interface ImportResult {
  world: WorldData;
  issues: Issue[];
  rejected: RejectedSource[];
  /** Accepted source texts by document, for snapshot storage. */
  texts: Partial<Record<DocId, string>>;
}

/** Campaign-profile overrides. Defaults are src/campaign/gazetteer.ts and src/campaign/profile.ts. */
export interface ImportOptions {
  gazetteer?: readonly GazetteerEntry[];
  probes?: FactProbe[];
}

export function runImport(inputs: RawSource[], options: ImportOptions = {}): ImportResult {
  const rejected: RejectedSource[] = [];
  const texts: Partial<Record<DocId, string>> = {};
  const sources: SourceMeta[] = [];
  const blocks: Block[] = [];

  for (const input of inputs) {
    const verdict = classifyFileName(input.fileName);
    if (!verdict.ok) {
      rejected.push({ fileName: baseName(input.fileName), reason: verdict.reason });
      continue;
    }
    const content = verifyContent(verdict.doc, input.text);
    if (!content.ok) {
      rejected.push({ fileName: baseName(input.fileName), reason: content.reason });
      continue;
    }
    const { docId, fileName } = verdict.doc;
    if (texts[docId] !== undefined) continue; // first accepted copy wins
    texts[docId] = input.text;
    const docBlocks = parseMarkdown(docId, input.text);
    const header = docBlocks.find((b) => b.line <= 15 && b.kind === 'paragraph' && /^Last updated:/i.test(b.text));
    const declaredAsOf = header ? parseTime(header.text) : undefined;
    // Undated blocks inherit the date the document itself declares in its header.
    if (declaredAsOf) for (const b of docBlocks) b.asOf ??= declaredAsOf;
    blocks.push(...docBlocks);
    sources.push({
      docId, fileName,
      hash: hashString(input.text),
      bytes: new TextEncoder().encode(input.text).length,
      lineCount: input.text.split(/\r?\n/).length,
      lastUpdatedText: header?.text,
      declaredAsOf,
    });
  }

  const b = new WorldBuilder(blocks);
  for (const r of rejected) {
    b.issue('source-rejected', 'error', r.fileName, `${r.fileName}: ${REJECT_MESSAGES[r.reason]}`);
  }
  for (const d of AUTHORIZED_DOCS) {
    if (texts[d.docId] === undefined) b.issue('source-missing', 'warning', d.docId, `${d.fileName} has not been imported.`);
  }

  const deferred: DeferredAttitude[] = [];
  extractCharacterSheet(b);
  extractJournal(b, deferred);
  extractChronicle(b, deferred);
  extractRulings(b);
  resolveDeferredAttitudes(b, deferred);

  const { geo, mentions, silences, current } = buildGeography(b, options.gazetteer);

  // Time tables stated by the documents themselves.
  const saves: WorldData['saves'] = {};
  let maxSession: number | null = null;
  let maxDay: number | null = current?.day ?? null;
  for (const x of blocks) {
    const t = x.kind === 'heading' ? x.asOf : x.ownTime;
    if (t?.session !== undefined) maxSession = Math.max(maxSession ?? 0, t.session);
    if (t?.dayEnd !== undefined) maxDay = Math.max(maxDay ?? 0, t.dayEnd);
    if (t?.save !== undefined && t.dayStart !== undefined) {
      const cur = saves[t.save];
      saves[t.save] = {
        dayStart: Math.min(cur?.dayStart ?? t.dayStart, t.dayStart),
        dayEnd: Math.max(cur?.dayEnd ?? t.dayEnd!, t.dayEnd!),
      };
    }
  }
  for (const s of sources) {
    const t = s.declaredAsOf;
    if (t?.save !== undefined && t.dayStart !== undefined && !saves[t.save]) saves[t.save] = { dayStart: t.dayStart, dayEnd: t.dayEnd! };
  }

  probeClaims(b, options.probes);
  reportClaims(b, { saves, maxSession });
  checkMetadata(b, sources, current?.day ?? null);
  checkDuplicates(b);

  const order = { error: 0, warning: 1, info: 2 } as const;
  const issues = [...b.issues].sort((x, y) => order[x.severity] - order[y.severity]);
  const world: WorldData = {
    importerVersion: IMPORTER_VERSION,
    sources, blocks,
    entities: [...b.entities.values()],
    relations: b.relations,
    claims: b.claims,
    mentions, geo, silences, current, saves, maxDay, maxSession,
  };
  return { world, issues, rejected, texts };
}
