/**
 * Per-document extraction rules. Each function reads the Block list for one
 * document and registers entities on the WorldBuilder. Rules key on the
 * documents' own structure (section headings, bold leads); anything a rule
 * does not recognise stays available as a verbatim Block.
 */
import type { Block, Entity } from '../../domain/types';
import { firstWords, removeParens, slugify, stripMd } from '../../domain/text';
import { parseTime } from '../../domain/time';
import { INVENTORY_SECTIONS } from '../../campaign/profile';
import type { WorldBuilder } from '../builder';
import { leadOf } from '../markdown';
import { extractPeopleLine, type DeferredAttitude } from './people';

const sec = (b: Block, i: number) => (b.headingPath[i] ?? '').toUpperCase();
const inDoc = (blocks: Block[], docId: Block['docId']) => blocks.filter((b) => b.docId === docId);

/** Bold text at the very start of an item, without trailing punctuation. */
export function boldLead(text: string): string | null {
  const m = /^(?:~~)?\*\*(.+?)\*\*/.exec(text);
  return m ? stripMd(m[1]).replace(/^\*+|\*+$/g, '').replace(/[:.]+$/, '').trim() : null;
}

function shortName(text: string, maxWords = 8): string {
  const plain = stripMd(text).trim();
  const cut = plain.search(/:| — | \(|\. |;/);
  const head = cut > 0 && cut <= 70 ? plain.slice(0, cut) : plain;
  return firstWords(head.replace(/[.]+$/, ''), maxWords);
}

// ---------------------------------------------------------------- character sheet

export function extractCharacterSheet(b: WorldBuilder): Entity | null {
  const blocks = inDoc(b.blocks, 'character-sheet');
  let pc: Entity | null = null;

  const identity = blocks.filter((x) => sec(x, 1) === 'IDENTITY' && x.kind === 'item');
  const nameLine = identity.find((x) => leadOf(x.text).lead === 'Name');
  if (nameLine) {
    const name = leadOf(nameLine.text).rest.split(',')[0].trim();
    pc = b.upsert('character', name, { attrs: { role: 'player-character' }, records: identity.map((x) => b.record(x, 'detail')) });
    const known = identity.find((x) => leadOf(x.text).lead === 'Known as');
    if (known) {
      for (const part of removeParens(stripMd(leadOf(known.text).rest)).split(';')) {
        const alias = part.split('. ')[0].replace(/["“”.]/g, '').trim();
        if (alias && alias.split(/\s+/).length <= 5) b.upsert('character', name, { aliases: [alias] });
      }
    }
  }

  // Companions: one H3 per companion; the heading and its items are the record.
  let companion: Entity | null = null;
  for (const x of blocks) {
    if (!sec(x, 1).startsWith('COMPANIONS')) continue;
    if (x.kind === 'heading' && x.headingPath.length === 3) {
      const name = stripMd(x.text).split(' — ')[0].trim();
      companion = b.upsert('character', name, { attrs: { role: 'companion' }, records: [b.record(x)] });
      if (pc) b.relations.push({ type: 'companion', from: pc.id, to: companion.id, certainty: 'stated', ref: b.ref(x) });
    } else if (companion && x.headingPath.length === 3 && x.kind === 'item') {
      companion.records.push(b.record(x, 'detail'));
    }
  }

  // Inventory: one entity per named entry; entries joined by " · " are split.
  for (const x of blocks) {
    if (x.kind !== 'item') continue;
    const section = INVENTORY_SECTIONS.find((s) => sec(x, 1).startsWith(s));
    if (!section) continue;
    if (x.depth > 0) continue;
    const parts = x.text.split(' · ');
    for (let part of parts) {
      // "Coatings: Frost-oil ×3 · Crawler mucus ×2": the label groups the row; the entry is what follows it.
      const labelled = /^([^:*]{1,30}):\s+(\p{L}.*)$/u.exec(part.trim());
      if (parts.length > 1 && labelled) part = labelled[2];
      const plain = stripMd(part).trim();
      const bold = boldLead(part.trim());
      if (!bold && /^\p{Ll}/u.test(plain)) continue; // trailing remark, not an entry (kept in the block text)
      const raw = bold ?? plain.split(/ — | \(|:|;|,/)[0];
      const name = raw.replace(/\s*×\s*\d+.*$/, '').replace(/[.]+$/, '').trim();
      if (!name) continue;
      const qty = /×\s?(\d+)/.exec(plain);
      const status = /\bSPENT\b/.test(plain) ? 'spent' : /^Given away/.test(plain) ? 'given-away' : /^Commissioned/.test(plain) ? 'commissioned' : undefined;
      b.upsert('item', firstWords(name, 7), {
        attrs: { section, quantity: qty ? Number(qty[1]) : null },
        status,
        records: [b.record(x, 'primary', part.trim()), ...b.descendants(x).map((c) => b.record(c, 'detail'))],
      });
    }
  }

  for (const x of blocks) {
    if (x.kind === 'item' && sec(x, 1).startsWith('OATHS & PROMISES')) addPromise(b, x);
  }
  return pc;
}

function addPromise(b: WorldBuilder, x: Block): void {
  const lead = leadOf(x.text).lead;
  b.upsert('promise', lead || shortName(x.text), {
    key: `${x.docId}-${slugify(lead || shortName(x.text))}`,
    status: /\bFULFILLED\b/.test(x.text) ? 'fulfilled' : 'open',
    records: [b.record(x)],
  });
}

// ---------------------------------------------------------------- journal

export function extractJournal(b: WorldBuilder, deferred: DeferredAttitude[]): void {
  const blocks = inDoc(b.blocks, 'journal');
  const questTitle = (s: string) => stripMd(s).replace(/\s*\(new\)\s*$/i, '').replace(/[.]+$/, '').trim();

  for (const x of blocks) {
    const [, s1, s2] = [sec(x, 0), sec(x, 1), sec(x, 2)];

    if (s1 === 'QUESTS' && s2 === 'ACTIVE' && x.headingPath.length === 4) {
      const title = questTitle(x.headingPath[3]);
      b.upsert('quest', title, { status: 'active', records: [b.record(x, x.kind === 'heading' ? 'primary' : 'detail')] });
    } else if (s1 === 'QUESTS' && s2 === 'COMPLETED' && x.kind === 'item' && !b.isContainer(x)) {
      const bold = boldLead(x.text);
      if (bold) {
        b.upsert('quest', bold, { status: 'completed', time: x.ownTime, records: [b.record(x)] });
      } else {
        const lead = leadOf(x.text);
        const body = /^Session \d+$/.test(lead.lead) ? lead.rest : x.text;
        for (const t of stripMd(body).split(/\.\s+/).map(questTitle).filter(Boolean)) {
          if (t.split(/\s+/).length <= 8) b.upsert('quest', t, { status: 'completed', time: x.asOf, records: [b.record(x)] });
        }
      }
    } else if (s1 === 'PEOPLE') {
      extractPeopleLine(b, x, x.headingPath[2] ?? 'People', deferred);
    } else if (s1 === 'PROMISES AND DEBTS' && x.kind === 'item') {
      addPromise(b, x);
    } else if (s1 === 'LORE AND DISCOVERIES' && x.kind === 'item' && x.depth === 0) {
      addLore(b, x);
    } else if (s1 === 'PLACES' && x.kind === 'item') {
      const name = boldLead(x.text);
      if (name) b.upsert('location', name, { attrs: { origin: 'journal-places' }, records: [b.record(x)] });
    }
  }

  // "## SAVE n" sections: bullets under a "**Quests:**" label are quest updates.
  let label = '';
  for (const x of blocks) {
    if (!sec(x, 1).startsWith('SAVE ')) continue;
    if (x.kind === 'heading') label = '';
    if (x.kind === 'paragraph') {
      const m = /^\*\*([^*]+?):\*\*/.exec(x.text);
      label = m ? m[1] : '';
      continue;
    }
    if (x.kind !== 'item' || label !== 'Quests') continue;
    const candidate = boldLead(x.text) ?? leadOf(x.text).lead;
    const title = questTitle(removeParens(candidate || shortName(x.text)).split('. ')[0]);
    const existing = b.entities.get(`quest:${slugify(title)}`);
    if (existing) existing.records.push(b.record(x, 'update'));
    else b.upsert('quest', title, { status: 'noted', attrs: { origin: 'save-note' }, time: x.asOf, records: [b.record(x)] });
  }
}

function addLore(b: WorldBuilder, x: Block): void {
  const name = boldLead(x.text) ?? shortName(x.text);
  b.upsert('lore', name, {
    key: `${x.docId}-${slugify(name)}`,
    records: [b.record(x), ...b.descendants(x).map((c) => b.record(c, 'detail'))],
  });
}

// ---------------------------------------------------------------- chronicle

export function extractChronicle(b: WorldBuilder, deferred: DeferredAttitude[]): void {
  const blocks = inDoc(b.blocks, 'chronicle');
  for (const x of blocks) {
    if (x.kind !== 'item') continue;
    const s1 = sec(x, 1);
    if (s1 === 'ESTABLISHED WORLD FACTS') {
      addLore(b, x);
    } else if (s1 === 'NPC REGISTRY') {
      extractPeopleLine(b, x, 'NPC registry', deferred);
    } else if (s1 === 'FACTIONS') {
      const name = boldLead(x.text) ?? stripMd(x.text).split(' — ')[0].trim();
      b.upsert('faction', name, { records: [b.record(x)] });
    } else if (s1.startsWith('OPEN THREADS')) {
      const strike = /^~~(.+?)~~/.exec(x.text);
      const name = strike ? stripMd(strike[1]) : boldLead(x.text) ?? shortName(x.text);
      const done = Boolean(strike) || /—\s*DONE\b/.test(x.text);
      b.upsert('thread', name, { status: done ? 'done' : 'open', records: [b.record(x)] });
    } else if (s1 === 'SESSION LOG' && x.depth === 0) {
      const lead = leadOf(x.text);
      const label = lead.lead || shortName(x.text);
      const title = boldLead(x.text) ?? (x.asOf?.session !== undefined ? `Session ${x.asOf.session}: ${label}` : label);
      const time = x.ownTime ?? (/^(Saved|Ended) at$/.test(lead.lead) ? parseTime(lead.rest) : undefined);
      b.upsert('event', title, {
        key: b.uniqueKey('event', slugify(title)),
        time,
        attrs: { session: x.asOf?.session ?? null, dated: Boolean(time?.dayStart) },
        records: [b.record(x)],
      });
    }
  }
}

// ---------------------------------------------------------------- rulings

export function extractRulings(b: WorldBuilder): void {
  for (const x of inDoc(b.blocks, 'rulings')) {
    if (x.kind !== 'item') continue;
    const plain = stripMd(x.text);
    const log = /^Session (\d+) — (.+?) — /.exec(plain);
    const name = log ? log[2] : boldLead(x.text) ?? shortName(x.text);
    b.upsert('ruling', name, {
      key: b.uniqueKey('ruling', slugify(firstWords(name, 6))),
      attrs: { section: x.headingPath.slice(1).join(' / '), session: log ? Number(log[1]) : null },
      records: [b.record(x)],
    });
  }
}
