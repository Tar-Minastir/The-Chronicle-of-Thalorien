import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readAuthorizedSources } from '../server/readSources';
import { runImport } from '../src/importer';
import { AUTHORIZED_DOCS, classifyFileName, verifyContent } from '../src/importer/sourcePolicy';
import { MemoryStore, STORES } from '../src/storage/kv';
import { CampaignRepository } from '../src/storage/repository';
import { readPickedFiles } from '../src/ui/sources';
import { ALL, SEALED, SEALED_MARKER, SHEET, TEST_OPTIONS } from './fixtures';

describe('source policy: file names', () => {
  it('accepts exactly the four authorized documents', () => {
    expect(AUTHORIZED_DOCS.map((d) => d.fileName).sort()).toEqual(
      ['campaign-chronicle.md', 'character-sheet.md', 'journal.md', 'rulings-and-house-rules.md'],
    );
    for (const d of AUTHORIZED_DOCS) expect(classifyFileName(d.fileName)).toMatchObject({ ok: true });
    expect(classifyFileName('C:\\campaign\\.source-files\\Journal.MD')).toMatchObject({ ok: true });
  });

  it.each([
    ['sealed-dm-notes.md', 'forbidden-name'],
    ['SEALED-DM-NOTES.MD', 'forbidden-name'],
    ['dm-playbook.md', 'forbidden-name'],
    ['DM_Notes.md', 'forbidden-name'],
    ['plot-secrets.md', 'forbidden-name'],
    ['songs-of-the-world.md', 'not-allowlisted'],
    ['journal.md.bak', 'not-allowlisted'],
    ['journal (1).md', 'not-allowlisted'],
    ['notes.txt', 'not-allowlisted'],
    ['', 'not-allowlisted'],
  ])('rejects %s (%s)', (name, reason) => {
    expect(classifyFileName(name)).toEqual({ ok: false, reason });
  });

  it('judges the base name, so a directory called like an allowed file does not help', () => {
    expect(classifyFileName('journal.md/sealed-dm-notes.md')).toEqual({ ok: false, reason: 'forbidden-name' });
    expect(classifyFileName('../sealed-dm-notes.md')).toEqual({ ok: false, reason: 'forbidden-name' });
  });
});

describe('source policy: content', () => {
  const journal = AUTHORIZED_DOCS.find((d) => d.docId === 'journal')!;

  it('rejects a sealed file that was renamed to an allowed name', () => {
    expect(verifyContent(journal, SEALED)).toEqual({ ok: false, reason: 'forbidden-content' });
  });

  it('rejects a real document under the wrong name', () => {
    expect(verifyContent(journal, SHEET)).toEqual({ ok: false, reason: 'signature-mismatch' });
  });

  it('accepts a BOM and leading blank lines', () => {
    expect(verifyContent(journal, '\uFEFF\n\n# JOURNAL OF X\n')).toEqual({ ok: true });
  });
});

describe('importer never ingests private material', () => {
  it('drops forbidden and renamed-sealed inputs and leaks nothing into the result', () => {
    const result = runImport(
      [...ALL.slice(0, 3), { fileName: 'sealed-dm-notes.md', text: SEALED }, { fileName: 'rulings-and-house-rules.md', text: SEALED }],
      TEST_OPTIONS,
    );
    expect(result.rejected).toEqual([
      { fileName: 'sealed-dm-notes.md', reason: 'forbidden-name' },
      { fileName: 'rulings-and-house-rules.md', reason: 'forbidden-content' },
    ]);
    expect(JSON.stringify(result)).not.toContain(SEALED_MARKER);
    expect(result.issues.filter((i) => i.code === 'source-rejected')).toHaveLength(2);
    expect(result.world.sources.map((s) => s.docId)).toEqual(['character-sheet', 'journal', 'chronicle']);
  });

  it('the repository stores nothing from rejected files', async () => {
    const kv = new MemoryStore();
    const repo = new CampaignRepository(kv, undefined, TEST_OPTIONS);
    const outcome = await repo.sync([...ALL, { fileName: 'sealed-dm-notes.md', text: SEALED }]);
    expect(outcome.status).toBe('created');
    expect(outcome.rejected).toHaveLength(1);
    for (const store of STORES) {
      for (const key of await kv.keys(store)) {
        expect(JSON.stringify(await kv.get(store, key))).not.toContain(SEALED_MARKER);
      }
    }
  });
});

describe('browser file picker', () => {
  it('never reads the content of a file whose name is not allowed', async () => {
    const sealedText = vi.fn(async () => SEALED);
    const otherText = vi.fn(async () => 'whatever');
    const journalText = vi.fn(async () => ALL[1].text);
    const out = await readPickedFiles([
      { name: 'sealed-dm-notes.md', text: sealedText },
      { name: 'random.md', text: otherText },
      { name: 'journal.md', text: journalText },
    ]);
    expect(sealedText).not.toHaveBeenCalled();
    expect(otherText).not.toHaveBeenCalled();
    expect(journalText).toHaveBeenCalledOnce();
    expect(out.sources.map((s) => s.fileName)).toEqual(['journal.md']);
    expect(out.rejected.map((r) => r.reason)).toEqual(['forbidden-name', 'not-allowlisted']);
  });
});

describe('node source reader', () => {
  it('opens only the four allowlisted paths and reports missing ones', async () => {
    const opened: string[] = [];
    const files: Record<string, string> = Object.fromEntries(ALL.slice(0, 3).map((s) => [s.fileName, s.text]));
    const bundle = await readAuthorizedSources('/campaign', async (p) => {
      opened.push(p.replace(/\\/g, '/'));
      const name = p.replace(/\\/g, '/').split('/').pop()!;
      if (!(name in files)) throw new Error('ENOENT');
      return files[name];
    });
    expect(opened.sort()).toEqual(AUTHORIZED_DOCS.map((d) => `/campaign/${d.fileName}`).sort());
    expect(opened.some((p) => /sealed|playbook|dm/i.test(p.split('/').pop()!))).toBe(false);
    expect(bundle.documents).toHaveLength(3);
    expect(bundle.missing).toEqual(['rulings-and-house-rules.md']);
  });

  it('discards an allowlisted path whose content is a private document', async () => {
    const bundle = await readAuthorizedSources('/campaign', async (p) => (p.endsWith('journal.md') ? SEALED : Promise.reject(new Error('ENOENT'))));
    expect(bundle.documents).toHaveLength(0);
    expect(bundle.rejected).toEqual([{ fileName: 'journal.md', reason: 'forbidden-content' }]);
    expect(JSON.stringify(bundle)).not.toContain(SEALED_MARKER);
  });
});

describe('the code base cannot modify or enumerate source files', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

  it('node-side source code has no write, delete, rename or directory-listing calls', () => {
    for (const file of ['server/readSources.ts', 'server/sourcesPlugin.ts', 'scripts/import-report.ts']) {
      // Calls and imports only; prose in comments may mention these words.
      expect(read(file), file).not.toMatch(
        /\b(?:writeFile|appendFile|unlink|rename|rm|rmdir|readdir|opendir|copyFile|mkdir|truncate|createWriteStream)(?:Sync)?\s*[(,}]/,
      );
    }
  });

  it('browser-side importer code does not touch the file system', () => {
    for (const file of ['src/importer/index.ts', 'src/importer/markdown.ts', 'src/importer/geography.ts', 'src/storage/repository.ts']) {
      expect(read(file), file).not.toMatch(/node:fs|from 'fs'|require\(/);
    }
  });
});
