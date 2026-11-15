/**
 * Checks on the campaign profile itself, and (when the real documents are
 * present) on the import of the real corpus. The corpus is read through the
 * same allowlisted reader the app uses; sealed files are never opened.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAuthorizedSources, resolveSourceDir } from '../server/readSources';
import { GAZETTEER } from '../src/campaign/gazetteer';
import { runImport } from '../src/importer';
import { AUTHORIZED_DOCS } from '../src/importer/sourcePolicy';
import { WORLD_SIZE, matchesBearing } from '../src/map/viewport';

describe('gazetteer', () => {
  const byId = new Map(GAZETTEER.map((e) => [e.id, e]));

  it('has unique ids, in-bounds provisional points and valid references', () => {
    expect(byId.size).toBe(GAZETTEER.length);
    for (const e of GAZETTEER) {
      expect(e.at[0]).toBeGreaterThanOrEqual(0);
      expect(e.at[0]).toBeLessThanOrEqual(WORLD_SIZE);
      expect(e.at[1]).toBeGreaterThanOrEqual(0);
      expect(e.at[1]).toBeLessThanOrEqual(WORLD_SIZE);
      if (e.parent) expect(byId.has(e.parent), `${e.id} parent`).toBe(true);
      for (const r of e.relations ?? []) {
        expect(byId.has(r.target), `${e.id} -> ${r.target}`).toBe(true);
        expect(r.quote.length).toBeGreaterThan(5);
      }
    }
  });

  it('provisional layout never contradicts a stated compass direction', () => {
    for (const e of GAZETTEER) {
      for (const r of e.relations ?? []) {
        if (r.kind !== 'bearing') continue;
        const t = byId.get(r.target)!;
        const ok = matchesBearing({ x: t.at[0], y: t.at[1] }, { x: e.at[0], y: e.at[1] }, r.bearing!);
        expect(ok, `${e.name} should be ${r.bearing} of ${t.name} (“${r.quote}”)`).toBe(true);
      }
    }
  });
});

const dir = resolveSourceDir(process.cwd());
const present = AUTHORIZED_DOCS.every((d) => existsSync(join(dir, d.fileName)));
const sha = (file: string) => createHash('sha256').update(readFileSync(join(dir, file))).digest('hex');

describe.skipIf(!present)('real campaign documents', async () => {
  const before = present ? AUTHORIZED_DOCS.map((d) => sha(d.fileName)) : [];
  const bundle = present ? await readAuthorizedSources(dir) : { documents: [], missing: [], rejected: [] };
  const { world, issues } = runImport(bundle.documents);
  const text = Object.fromEntries(bundle.documents.map((d) => [AUTHORIZED_DOCS.find((a) => a.fileName === d.fileName)!.docId, d.text]));

  it('imports all four documents and leaves the originals byte-for-byte untouched', () => {
    expect(bundle.documents).toHaveLength(4);
    expect(bundle.rejected).toEqual([]);
    expect(AUTHORIZED_DOCS.map((d) => sha(d.fileName))).toEqual(before);
  });

  it('every extracted record cites the exact source line it came from', () => {
    let checked = 0;
    for (const e of world.entities) {
      for (const r of e.records) {
        const lines = text[r.ref.docId].split(/\r?\n/).slice(r.ref.line - 1, r.ref.endLine).join(' ');
        expect(lines, `${e.id} @ ${r.ref.docId}:${r.ref.line}`).toContain(r.text);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('keeps every list item of the rulings file as a verbatim ruling', () => {
    const items = text.rulings.split(/\r?\n/).filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trimEnd());
    const rulings = world.entities.filter((e) => e.kind === 'ruling').map((e) => e.records[0].text);
    expect(rulings).toEqual(items);
  });

  it('loses no line: every non-blank, non-rule source line is inside some block', () => {
    for (const s of world.sources) {
      const covered = new Set<number>();
      for (const b of world.blocks.filter((x) => x.docId === s.docId)) for (let n = b.line; n <= b.endLine; n++) covered.add(n);
      text[s.docId].split(/\r?\n/).forEach((line, i) => {
        if (line.trim() && !/^\s*-{3,}\s*$/.test(line)) expect(covered.has(i + 1), `${s.fileName}:${i + 1}`).toBe(true);
      });
    }
  });

  it('verifies every gazetteer place and every stated relation against the documents', () => {
    expect(issues.filter((i) => i.code === 'gazetteer-unattested' || i.code === 'relation-unattested').map((i) => i.message)).toEqual([]);
    expect(world.geo.every((g) => g.relations.every((r) => r.attested && r.ref))).toBe(true);
  });

  it('surfaces the known contradictions instead of resolving them silently', () => {
    const conflicts = issues.filter((i) => i.code === 'claim-conflict').map((i) => i.message);
    expect(conflicts.some((m) => m.includes('"married"') && m.includes('"betrothed"'))).toBe(true);
    expect(issues.some((i) => i.code === 'stale-metadata' && i.message.startsWith('journal.md'))).toBe(true);
    expect(issues.some((i) => i.code === 'possible-duplicate')).toBe(true);
  });

  it('never references a sealed or unlisted file as a source', () => {
    expect(new Set(world.sources.map((s) => s.fileName))).toEqual(new Set(AUTHORIZED_DOCS.map((d) => d.fileName)));
    expect(new Set(world.blocks.map((b) => b.docId)).size).toBe(4);
  });
});
