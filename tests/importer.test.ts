import { describe, expect, it } from 'vitest';
import type { Entity, WorldData } from '../src/domain/types';
import { runImport } from '../src/importer';
import { resolveClaims } from '../src/importer/consistency';
import { diffWorlds } from '../src/importer/diff';
import { attitudeOf, leadNames, splitRegistrySegments } from '../src/importer/extract/people';
import { leadOf, parseMarkdown } from '../src/importer/markdown';
import { parseTime, timeOrder } from '../src/domain/time';
import { ALL, CHRONICLE, JOURNAL, RULINGS, SHEET, TEST_OPTIONS } from './fixtures';

const { world, issues } = runImport(ALL, TEST_OPTIONS);
const byId = (id: string): Entity => {
  const e = world.entities.find((x) => x.id === id);
  if (!e) throw new Error(`no entity ${id}; have ${world.entities.filter((x) => x.kind === id.split(':')[0]).map((x) => x.id).join(', ')}`);
  return e;
};
const ofKind = (kind: Entity['kind']) => world.entities.filter((e) => e.kind === kind);
const codes = (code: string) => issues.filter((i) => i.code === code);
const TEXTS: Record<string, string> = { 'character-sheet': SHEET, journal: JOURNAL, chronicle: CHRONICLE, rulings: RULINGS };

describe('markdown block parser', () => {
  const blocks = parseMarkdown('journal', JOURNAL);

  it('keeps exact 1-based line numbers and heading paths', () => {
    const lines = JOURNAL.split('\n');
    for (const b of blocks) {
      expect(lines[b.line - 1]).toContain(b.text.split(' ')[0].replace(/^#+/, ''));
    }
    const bell = blocks.find((b) => b.text.startsWith('Find the bell'))!;
    expect(bell.headingPath).toEqual(['JOURNAL OF TAVIN', 'QUESTS', 'ACTIVE', 'The Lost Bell (new)']);
    expect(lines[bell.line - 1]).toBe('- Find the bell under Northkeep.');
  });

  it('links nested list items to their parent', () => {
    const dark = blocks.find((b) => b.text === '**Dark:**')!;
    const farholt = blocks.find((b) => b.text.startsWith('**Farholt**'))!;
    expect(farholt.parentId).toBe(dark.id);
    expect(farholt.depth).toBe(1);
  });

  it('derives time context from SAVE headings and from an item lead', () => {
    expect(blocks.find((b) => b.text.startsWith('The Lost Bell: found'))!.asOf).toEqual({ save: 3, dayStart: 21, dayEnd: 40 });
    expect(blocks.find((b) => b.text.startsWith('**The Bridge**'))!.ownTime).toEqual({ dayStart: 12, dayEnd: 12 });
  });

  it('gives identical blocks distinct ids and is deterministic', () => {
    const twice = parseMarkdown('rulings', '# RULINGS\n- same\n- same\n');
    expect(new Set(twice.map((b) => b.id)).size).toBe(twice.length);
    expect(parseMarkdown('journal', JOURNAL)).toEqual(blocks);
  });

  it('handles CRLF line endings identically', () => {
    const crlf = parseMarkdown('journal', JOURNAL.replace(/\n/g, '\r\n'));
    expect(crlf.map((b) => [b.line, b.text])).toEqual(blocks.map((b) => [b.line, b.text]));
  });
});

describe('time parsing', () => {
  it('reads SAVE, session and day ranges', () => {
    expect(parseTime('SAVE 4 — Days 28-48 (player-facing)')).toEqual({ save: 4, dayStart: 28, dayEnd: 48 });
    expect(parseTime('Session 2 (Days 8–21)')).toEqual({ session: 2, dayStart: 8, dayEnd: 21 });
    expect(parseTime('night of Day 21, somewhere')).toEqual({ dayStart: 21, dayEnd: 21 });
    expect(parseTime('no markers here')).toBeUndefined();
  });

  it('orders by day, then SAVE table, then earlier sessions; the latest session alone is unknown', () => {
    const ctx = { saves: { 3: { dayStart: 21, dayEnd: 40 } }, maxSession: 2 };
    expect(timeOrder({ dayStart: 5, dayEnd: 7 }, ctx)).toBe(7);
    expect(timeOrder({ save: 3 }, ctx)).toBe(40);
    expect(timeOrder({ session: 1 }, ctx)).toBeLessThan(0);
    expect(timeOrder({ session: 2 }, ctx)).toBeNull();
    expect(timeOrder(undefined, ctx)).toBeNull();
  });
});

describe('registry line helpers', () => {
  it('splits one line into several records only at bold, name-like starts', () => {
    expect(splitRegistrySegments('**Seregon**: ranger. **Aelwen**: mage at the Tree.')).toEqual(['**Seregon**: ranger.', '**Aelwen**: mage at the Tree.']);
    expect(splitRegistrySegments('**Mira Vale** — heir; **betrothed** (bound) — Devoted.')).toHaveLength(1);
  });

  it('finds lead names, including several in one lead', () => {
    expect(leadNames('**Lómë** (silent) and **Aranwë** (young) — binders.')).toEqual(['Lómë', 'Aranwë']);
    expect(leadNames('**Calenwë, Aelir, Faradhir**: survivors.')).toEqual(['Calenwë', 'Aelir', 'Faradhir']);
    expect(leadNames('**Mira Vale** — heir; **betrothed** — Devoted.')).toEqual(['Mira Vale']);
    expect(leadOf('**The Bridge** (Day 12): held.').lead).toBe('The Bridge (Day 12)');
  });

  it('reads attitudes only from the journal scale', () => {
    expect(attitudeOf('**A** — Betrothed (Devoted). Bound.')?.value).toBe('Devoted');
    expect(attitudeOf('**A** — scarred; terse — Neutral-to-Friendly.')?.value).toBe('Neutral/Friendly');
    expect(attitudeOf('**A**: Trusted. She told the truth.')?.value).toBe('Trusted');
    expect(attitudeOf('**A** — watching the road.')).toBeNull();
  });
});

describe('extraction', () => {
  it('builds the player character with aliases', () => {
    const pc = byId('character:tavin');
    expect(pc.attrs.role).toBe('player-character');
    expect(pc.aliases).toEqual(expect.arrayContaining(['Greycloak', 'the Quiet']));
  });

  it('merges records of the same person across documents and honorifics', () => {
    const hale = byId('character:hale-dorn');
    expect(hale.aliases).toContain('Hale Dorn');
    expect(new Set(hale.records.map((r) => r.ref.docId))).toEqual(new Set(['journal', 'chronicle']));
    expect(byId('character:brakk').records.length).toBe(2);
    expect(byId('character:mira-vale').records.map((r) => r.ref.docId)).toEqual(expect.arrayContaining(['character-sheet', 'journal', 'chronicle']));
  });

  it('does NOT merge near-matches; it flags them', () => {
    expect(byId('character:sella').name).toBe('Old Sella');
    expect(byId('character:sella-brook')).toBeTruthy();
    const dup = codes('possible-duplicate');
    expect(dup).toHaveLength(1);
    expect(dup[0].entityIds.sort()).toEqual(['character:sella', 'character:sella-brook']);
  });

  it('does not promote bold emphasis inside a record to a character', () => {
    expect(world.entities.find((e) => e.id === 'character:betrothed')).toBeUndefined();
    expect(ofKind('character').map((e) => e.name).sort()).toEqual(
      ['Brakk', 'Captain Hale Dorn', 'Dessa', 'Joss Reed', 'Mira Vale', 'Old Sella', 'Sella Brook', 'Tavin', 'Varn the Red'].sort(),
    );
    expect(byId('character:varn-the-red').status).toBe('slain');
  });

  it('extracts quests with status, dates and later updates', () => {
    const bell = byId('quest:the-lost-bell');
    expect(bell.status).toBe('active');
    expect(bell.records.find((r) => r.role === 'update')?.text).toBe('The Lost Bell: found, not yet rung.');
    expect(byId('quest:the-bridge')).toMatchObject({ status: 'completed', time: { dayStart: 12 } });
    expect(byId('quest:the-first-road').status).toBe('completed');
    expect(byId('quest:the-old-mill').status).toBe('completed');
    expect(byId('quest:the-red-hunt').status).toBe('noted');
  });

  it('extracts inventory, merging the same item listed in two sections', () => {
    expect(byId('item:longbow').records).toHaveLength(2);
    expect(byId('item:star-arrow').status).toBe('spent');
    expect(byId('item:potion-of-healing').attrs.quantity).toBe(4);
    expect(byId('item:antitoxin').attrs.quantity).toBe(2);
  });

  it('extracts events with stated days and leaves undated ones undated', () => {
    expect(byId('event:the-bridge').time).toEqual({ dayStart: 10, dayEnd: 12 });
    expect(byId('event:the-council').time).toBeUndefined();
    expect(byId('event:session-2-saved-at').time).toMatchObject({ dayStart: 20 });
  });

  it('extracts threads, factions and promises', () => {
    expect(byId('thread:kill-varn').status).toBe('done');
    expect(byId('thread:the-bell').status).toBe('open');
    expect(ofKind('faction').map((f) => f.name)).toEqual(['Varn and his riders', 'House Vale']);
    expect(ofKind('promise').map((p) => p.status).sort()).toEqual(['fulfilled', 'open']);
  });

  it('preserves every house rule verbatim', () => {
    const items = RULINGS.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    expect(ofKind('ruling').map((r) => r.records[0].text)).toEqual(items);
  });

  it('every record cites the exact source line its text came from', () => {
    for (const e of world.entities) {
      for (const r of e.records) {
        const lines = TEXTS[r.ref.docId].split('\n').slice(r.ref.line - 1, r.ref.endLine).join(' ');
        expect(lines, `${e.id} @ ${r.ref.docId}:${r.ref.line}`).toContain(r.text);
      }
    }
  });

  it('is deterministic', () => {
    expect(runImport(ALL, TEST_OPTIONS)).toEqual({ world, issues, rejected: [], texts: expect.anything() });
  });
});

describe('contradictions and metadata', () => {
  it('flags a same-date contradiction as a conflict and keeps both claims', () => {
    const issue = codes('claim-conflict').find((i) => i.message.startsWith('Tavin and Mira'))!;
    expect(issue).toBeTruthy();
    const values = new Set(world.claims.filter((c) => c.key === 'relationship').map((c) => c.value));
    expect(values).toEqual(new Set(['betrothed', 'married']));
  });

  it('flags an older dated value as superseded, not as a conflict', () => {
    const issue = codes('claim-superseded').find((i) => i.message.startsWith('Joss level'))!;
    expect(issue.message).toContain('"8"');
    expect(issue.severity).toBe('info');
  });

  it('flags an undated record that disagrees with the latest dated one', () => {
    const issue = codes('claim-conflict').find((i) => i.message.startsWith('Attitude: Captain Hale Dorn'))!;
    expect(issue.message).toContain('Latest dated value(s): "Devoted"');
    expect(issue.details).toHaveLength(3);
  });

  it('classifies claim sets', () => {
    const ctx = { saves: {}, maxSession: 2 };
    const claim = (value: string, day?: number) => ({
      key: 'k', label: 'K', value, excerpt: '', asOf: day === undefined ? undefined : { dayStart: day, dayEnd: day },
      ref: { docId: 'journal' as const, blockId: 'b', line: 1, endLine: 1, headingPath: [] },
    });
    expect(resolveClaims([claim('a', 1), claim('a')], ctx)[0].state).toBe('consistent');
    expect(resolveClaims([claim('a', 1), claim('b', 2)], ctx)[0]).toMatchObject({ state: 'superseded', latest: ['b'] });
    expect(resolveClaims([claim('a', 2), claim('b', 2)], ctx)[0].state).toBe('conflict');
    expect(resolveClaims([claim('a'), claim('b', 2)], ctx)[0].state).toBe('conflict');
    expect(resolveClaims([claim('a'), claim('b')], ctx)[0]).toMatchObject({ state: 'conflict', latest: [] });
  });

  it('flags a stale document header and mismatched document dates', () => {
    expect(codes('stale-metadata').some((i) => i.message.includes('journal.md says it was last updated on Day 20'))).toBe(true);
    expect(codes('doc-date-mismatch')).toHaveLength(1);
  });

  it('flags a faction entry that still describes a slain character', () => {
    expect(byId('faction:varn-and-his-riders').attrs.stale).toBe(true);
    expect(codes('stale-metadata').some((i) => i.message.includes('Varn and his riders'))).toBe(true);
  });

  it('reports documents that are missing', () => {
    const partial = runImport(ALL.slice(0, 2), TEST_OPTIONS);
    expect(partial.issues.filter((i) => i.code === 'source-missing').map((i) => i.message)).toEqual([
      'campaign-chronicle.md has not been imported.',
      'rulings-and-house-rules.md has not been imported.',
    ]);
  });
});

describe('geography', () => {
  const geo = (id: string) => world.geo.find((g) => g.id === `location:${id}`);

  it('shows only gazetteer places the documents actually mention', () => {
    expect(geo('ghostmere')).toBeUndefined();
    expect(world.entities.find((e) => e.id === 'location:ghostmere')).toBeUndefined();
    expect(codes('gazetteer-unattested').map((i) => i.message)).toEqual([expect.stringContaining('Ghostmere')]);
  });

  it('verifies relation quotes against the text and flags ones it cannot find', () => {
    const farholt = geo('farholt')!;
    expect(farholt.relations[0]).toMatchObject({ attested: true, target: 'location:tollgate', ref: { docId: 'chronicle', line: 9 } });
    expect(farholt.positionBasis).toBe('stated-relation');
    expect(geo('eastwood')!.relations[0].attested).toBe(false);
    expect(geo('eastwood')!.positionBasis).toBe('no-stated-position');
    expect(codes('relation-unattested')).toHaveLength(1);
    expect(world.relations.some((r) => r.note === 'a day east of Northkeep')).toBe(false);
  });

  it('keeps places the documents list but nobody has positioned, as unplaced', () => {
    expect(geo('the-sunken-chapel')).toMatchObject({ position: null, positionBasis: 'unplaced' });
    expect(codes('location-unplaced')).toHaveLength(1);
  });

  it('resolves a journal PLACES entry onto the gazetteer place instead of duplicating it', () => {
    expect(ofKind('location').filter((l) => /northkeep/i.test(l.name))).toHaveLength(1);
    expect(byId('location:northkeep').records[0].text).toBe('**Northkeep:** the hall; the stair.');
  });

  it('reads silence status, party location and current day from the documents', () => {
    expect(world.silences.map((s) => [s.locationId, s.status])).toEqual([
      ['location:eastwood', 'awake'],
      ['location:farholt', 'dark'],
    ]);
    expect(world.current).toMatchObject({ partyLocationId: 'location:northkeep', day: 40 });
    expect(world.saves).toEqual({ 3: { dayStart: 21, dayEnd: 40 } });
  });

  it('records faction presence only as a sourced co-mention', () => {
    const presence = world.relations.filter((r) => r.type === 'presence');
    expect(presence.map((r) => [r.from, r.to, r.certainty])).toEqual([
      ['faction:varn-and-his-riders', 'location:tollgate', 'co-mention'],
      ['faction:house-vale', 'location:northkeep', 'co-mention'],
    ]);
    expect(presence.every((r) => r.ref && r.note)).toBe(true);
  });

  it('matches whole names only', () => {
    const custom = runImport(
      [{ fileName: 'journal.md', text: '# JOURNAL\n\n## PLACES\n- Northkeepers gathered.\n- At Northkeep’s gate.\n' }],
      TEST_OPTIONS,
    ).world;
    expect(custom.mentions['location:northkeep']).toHaveLength(1);
  });
});

describe('diff between imports', () => {
  const edit = (w: string) => runImport(ALL.map((s) => (s.fileName === 'journal.md' ? { ...s, text: w } : s)), TEST_OPTIONS);

  it('reports nothing for identical inputs', () => {
    const d = diffWorlds(world, runImport(ALL, TEST_OPTIONS).world);
    expect(d.blocks).toEqual({ added: [], removed: [], modified: [] });
    expect(d.documents.every((x) => x.change === 'unchanged')).toBe(true);
  });

  it('pairs an edited line as a modification and tracks entity and issue changes', () => {
    const next = edit(
      JOURNAL.replace('- **Old Sella** — Friendly.', '- **Old Sella** — Trusted.')
        .replace('- **The Sunken Chapel:** below the weir.\n', '')
        .replace('## PLACES', '## PLACES\n- **Tollgate:** on the north road.'),
    );
    const d = diffWorlds(world, next.world, issues, next.issues);
    expect(d.documents.find((x) => x.docId === 'journal')!.change).toBe('changed');
    expect(d.blocks.modified).toEqual([
      { before: expect.objectContaining({ text: '**Old Sella** — Friendly.' }), after: expect.objectContaining({ text: '**Old Sella** — Trusted.' }) },
    ]);
    expect(d.blocks.removed.map((b) => b.text)).toEqual(['**The Sunken Chapel:** below the weir.']);
    expect(d.blocks.added.map((b) => b.text)).toEqual(['**Tollgate:** on the north road.']);
    expect(d.entities.removed.map((e) => e.id)).toEqual(['location:the-sunken-chapel']);
    expect(d.entities.changed.map((e) => e.id)).toEqual(expect.arrayContaining(['character:sella', 'location:tollgate']));
    expect(d.issues.resolved.length).toBe(1); // the unplaced-location notice
  });

  it('keeps entity ids stable when unrelated lines are inserted above', () => {
    const ids = (w: WorldData) => w.entities.map((e) => e.id).sort();
    const shifted = runImport(ALL.map((s) => (s.fileName === 'campaign-chronicle.md' ? { ...s, text: s.text.replace('## CURRENT STATE', 'A new intro line.\n\n## CURRENT STATE') } : s)), TEST_OPTIONS);
    expect(ids(shifted.world)).toEqual(ids(world));
  });
});
