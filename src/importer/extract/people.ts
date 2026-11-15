/**
 * People registries (journal "PEOPLE", chronicle "NPC REGISTRY").
 *
 * Conservative rules: a name becomes a character only when the document's own
 * structure marks it as one (a bold lead in a registry line, or a short
 * "Name — text" / "A; B; C." registry line). Names buried in prose are not
 * promoted; the prose is still retained as the record text.
 */
import type { Block, Entity } from '../../domain/types';
import { firstDelimiter, removeParens, slugify, stripMd } from '../../domain/text';
import { ATTITUDE_SCALE } from '../../campaign/profile';
import { stripHonorifics, type WorldBuilder } from '../builder';

const SCALE = ATTITUDE_SCALE.join('|');
const ATTITUDE_RE = new RegExp(
  `^(?:\\p{Lu}\\p{Ll}+\\s\\(|\\p{Lu}\\p{Ll}+\\/)?((?:${SCALE})(?:(?:-to-|[-/])\\p{L}+)*)`,
  'u',
);
const NAME_PIECE = /^\p{Lu}[\p{L}'’-]+(?: \p{Lu}[\p{L}'’-]+){0,2}$/u;
const GAP = /^(?:\s*(?:,|and|&|;)\s*|\s*\([^)]*\)\s*)*$/;

export interface DeferredAttitude {
  phrase: string;
  value: string;
  block: Block;
}

/** "X. **Name** ..." / "X; **Name** ..." boundaries start a new record on the same line. */
export function splitRegistrySegments(text: string): string[] {
  if (!text.startsWith('**')) return [text];
  const segs: string[] = [];
  let start = 0;
  const re = /[.;]\s+(?=\*\*(?:\p{Lu}|the\s))/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    segs.push(text.slice(start, m.index + 1).trim());
    start = m.index + m[0].length;
  }
  segs.push(text.slice(start).trim());
  return segs;
}

/** Bold names that lead a registry segment. */
export function leadNames(seg: string): string[] {
  const d = firstDelimiter(seg);
  const spans: { text: string; start: number; end: number }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  for (let m = re.exec(seg); m; m = re.exec(seg)) spans.push({ text: m[1], start: m.index, end: m.index + m[0].length });
  const picked: string[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (d) {
      // A delimiter after the first bold span closes the name area.
      if (s.start > d.index && picked.length) break;
    } else if (picked.length && !GAP.test(seg.slice(cursor, s.start))) {
      break;
    }
    if (!picked.length && s.start !== 0) break;
    picked.push(s.text);
    cursor = s.end;
  }
  const names: string[] = [];
  for (const p of picked) {
    const clean = stripMd(p).replace(/[:.]+$/, '').trim();
    const pieces = clean.split(/,\s+/);
    if (pieces.length > 1 && pieces.every((x) => NAME_PIECE.test(x))) names.push(...pieces);
    else if (clean) names.push(clean);
  }
  return names;
}

/** Attitude on the journal's scale, read from the clause right after the name or the final " — " clause. */
export function attitudeOf(seg: string): { value: string; raw: string } | null {
  const plain = stripMd(seg);
  const d = firstDelimiter(plain);
  if (!d) return null;
  const parts = plain.split(' — ');
  for (const cand of [plain.slice(d.index + d.length), parts[parts.length - 1]]) {
    const m = ATTITUDE_RE.exec(cand.trim());
    if (!m) continue;
    const words = m[1].split(/-to-|[-/]/).filter((w) => ATTITUDE_SCALE.includes(w));
    if (words.length) return { value: words.join('/'), raw: m[1] };
  }
  return null;
}

function addPerson(b: WorldBuilder, name: string, block: Block, seg: string, group: string): Entity {
  const e = b.upsert('character', name, {
    attrs: { group },
    records: [b.record(block, 'primary', seg)],
    status: /—\s*SLAIN\b/.test(stripMd(seg)) ? 'slain' : undefined,
  });
  const att = attitudeOf(seg);
  if (att) b.claim(`attitude:${e.id}`, `Attitude: ${e.name}`, att.value, block, stripMd(seg).slice(0, 160), e.id);
  return e;
}

export function extractPeopleLine(b: WorldBuilder, block: Block, group: string, deferred: DeferredAttitude[]): void {
  if (block.kind !== 'item' || b.isContainer(block)) return;
  const text = block.text;
  if (text.startsWith('**')) {
    for (const seg of splitRegistrySegments(text)) {
      for (const name of leadNames(seg)) addPerson(b, name, block, seg, group);
    }
    return;
  }
  const plain = stripMd(text).trim();
  const attitudes = /^Attitudes?:\s*(.*)$/.exec(plain);
  if (attitudes) {
    for (const part of attitudes[1].split(';')) {
      const m = new RegExp(`^\\s*(.+?)\\s+(${SCALE})\\.?\\s*$`).exec(part);
      if (m) deferred.push({ phrase: m[1], value: m[2], block });
    }
    return;
  }
  const others = /^Others as before \((.*)\)\.?$/.exec(plain);
  const listText = others ? others[1] : plain;
  if (!others && plain.includes(' — ')) {
    const name = plain.split(' — ')[0].trim();
    if (name.split(/\s+/).length <= 5) addPerson(b, name, block, text, group);
    return;
  }
  const names = removeParens(listText)
    .split(';')
    .map((s) => s.replace(/[."“”]+$/g, '').trim())
    .filter(Boolean);
  if (names.length && names.every((n) => n.split(/\s+/).length <= 5)) {
    for (const n of names) addPerson(b, n, block, text, group);
  }
}

/** "Attitudes: Haldrik Devoted; ..." -> claims, once every character is known. */
export function resolveDeferredAttitudes(b: WorldBuilder, deferred: DeferredAttitude[]): void {
  const chars = [...b.entities.values()].filter((e) => e.kind === 'character');
  for (const d of deferred) {
    const token = slugify(d.phrase.split(/\s+/)[0].replace(/['’]s$/, ''));
    const hits = chars.filter((e) => slugify(stripHonorifics(e.name).split(/\s+/)[0]) === token);
    if (hits.length === 1) {
      const e = hits[0];
      e.records.push(b.record(d.block, 'update', `${d.phrase} ${d.value}`));
      b.claim(`attitude:${e.id}`, `Attitude: ${e.name}`, d.value, d.block, `${d.phrase} ${d.value}`, e.id);
    } else {
      b.issue('unresolved-reference', 'info', `attitude:${d.phrase}:${d.block.id}`,
        `Attitude note "${d.phrase} ${d.value}" could not be matched to exactly one character (${hits.length} candidates).`,
        { refs: [b.ref(d.block)], entityIds: hits.map((h) => h.id) });
    }
  }
}
