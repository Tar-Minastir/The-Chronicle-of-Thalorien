/**
 * Geography + mention index.
 *
 * Turns the gazetteer into GeoLocations, but only for names actually found in
 * the imported documents, and verifies every relation quote against the text.
 * Also builds the name-mention index used for "mentioned with" links.
 */
import type { Block, CurrentState, GeoLocation, SilenceState, SilenceStatus } from '../domain/types';
import { nameRegex, stripMd } from '../domain/text';
import { parseTime } from '../domain/time';
import { GAZETTEER, locationId, type GazetteerEntry } from '../campaign/gazetteer';
import { MENTION_MASKS } from '../campaign/profile';
import { stripHonorifics, type WorldBuilder } from './builder';
import { leadOf } from './markdown';

export interface GeographyResult {
  geo: GeoLocation[];
  mentions: Record<string, string[]>;
  silences: SilenceStatus[];
  current: CurrentState | null;
}

/** Plain text with known false-positive phrases blanked (same length, so indexes line up). */
export function maskedPlain(text: string): string {
  let out = stripMd(text);
  for (const re of MENTION_MASKS) out = out.replace(re, (m) => ' '.repeat(m.length));
  return out;
}

const bareName = (name: string) => name.replace(/^The\s+/i, '');
const entryNames = (e: GazetteerEntry) => [bareName(e.name), ...(e.aliases ?? [])];

export function buildGeography(b: WorldBuilder, gazetteer: readonly GazetteerEntry[] = GAZETTEER): GeographyResult {
  const plain = new Map<string, string>(b.blocks.map((x) => [x.id, maskedPlain(x.text)]));
  const mentions: Record<string, string[]> = {};
  const scan = (id: string, names: string[]) => {
    const res = [...new Set(names)].filter(Boolean).map((n) => nameRegex(n));
    const hits = b.blocks.filter((x) => res.some((re) => re.test(plain.get(x.id)!))).map((x) => x.id);
    if (hits.length) mentions[id] = hits;
    return hits;
  };
  const findQuote = (quote: string): Block | undefined => b.blocks.find((x) => stripMd(x.text).includes(quote));

  // ---- locations from the gazetteer (attested names only)
  const geo: GeoLocation[] = [];
  const attested = new Set<string>();
  for (const e of gazetteer) {
    if (scan(locationId(e.id), entryNames(e)).length) attested.add(e.id);
    else b.issue('gazetteer-unattested', 'info', e.id, `Gazetteer place "${e.name}" is not mentioned in the imported documents; it is hidden.`);
  }
  for (const e of gazetteer) {
    if (!attested.has(e.id)) continue;
    const id = locationId(e.id);
    const blockIds = mentions[id];
    const first = b.blockById.get(blockIds[0])!;
    // Journal "PLACES" entries resolve onto the gazetteer entry instead of duplicating it.
    for (const [eid, ent] of [...b.entities]) {
      if (ent.kind !== 'location' || eid === id) continue;
      if (entryNames(e).some((n) => bareName(ent.name).toLowerCase() === n.toLowerCase())) {
        b.upsert('location', e.name, { key: e.id, records: ent.records, attrs: ent.attrs });
        b.entities.delete(eid);
      }
    }
    b.upsert('location', e.name, { key: e.id, aliases: e.aliases, attrs: { geoKind: e.kind, firstMentionLine: first.line, firstMentionDoc: first.docId } });

    const relations = (e.relations ?? []).map((r) => {
      const src = findQuote(r.quote);
      const targetOk = attested.has(r.target);
      if (!src || !targetOk) {
        b.issue('relation-unattested', 'warning', `${e.id}:${r.quote}`,
          `Stated relation for "${e.name}" can no longer be verified: “${r.quote}” ${src ? 'refers to a place not in the documents' : 'was not found in the documents'}.`,
          { entityIds: [id] });
      }
      const attestedRel = Boolean(src) && targetOk;
      if (attestedRel) {
        b.relations.push({ type: r.kind, from: id, to: locationId(r.target), certainty: r.certainty, note: r.quote, ref: b.ref(src!) });
      }
      return { ...r, target: locationId(r.target), attested: attestedRel, ref: src ? b.ref(src) : undefined };
    });
    geo.push({
      id, name: e.name, kind: e.kind, tier: e.tier,
      parentId: e.parent && attested.has(e.parent) ? locationId(e.parent) : undefined,
      position: { x: e.at[0], y: e.at[1] },
      positionBasis: relations.some((r) => r.attested) ? 'stated-relation' : 'no-stated-position',
      relations,
    });
  }

  // ---- places the documents list that the gazetteer does not know: kept, but unplaced
  for (const ent of b.entities.values()) {
    if (ent.kind !== 'location' || geo.some((g) => g.id === ent.id)) continue;
    scan(ent.id, [bareName(ent.name)]);
    geo.push({ id: ent.id, name: ent.name, kind: 'site', tier: 1, position: null, positionBasis: 'unplaced', relations: [] });
    b.issue('location-unplaced', 'info', ent.id, `"${ent.name}" is listed as a place but has no provisional position yet. It can be placed by hand on the map.`,
      { entityIds: [ent.id], refs: ent.records.map((r) => r.ref) });
  }

  // ---- character mentions: full name, aliases, and an unambiguous first name
  const chars = [...b.entities.values()].filter((e) => e.kind === 'character');
  const firstTokens = new Map<string, number>();
  const firstOf = (name: string) => stripHonorifics(name).split(/\s+/)[0];
  for (const c of chars) firstTokens.set(firstOf(c.name), (firstTokens.get(firstOf(c.name)) ?? 0) + 1);
  for (const c of chars) {
    const names = [stripHonorifics(c.name), ...c.aliases.filter((a) => /^\p{Lu}/u.test(a) && a.length >= 5)];
    const first = firstOf(c.name);
    if (first.length >= 3 && /^\p{Lu}[\p{L}-]+$/u.test(first) && firstTokens.get(first) === 1) names.push(first);
    scan(c.id, names);
  }

  // ---- faction presence: a faction's own record names a known place (co-mention, not control)
  for (const f of b.entities.values()) {
    if (f.kind !== 'faction') continue;
    for (const rec of f.records) {
      for (const g of geo) {
        if (mentions[g.id]?.includes(rec.ref.blockId)) {
          b.relations.push({ type: 'presence', from: f.id, to: g.id, certainty: 'co-mention', note: stripMd(rec.text), ref: rec.ref });
        }
      }
    }
  }

  return { geo, mentions, silences: extractSilences(b, gazetteer, attested), current: extractCurrent(b, geo, plain, gazetteer) };
}

/** journal.md "The Seven Silences": Awake / Holding / Dark lists. */
function extractSilences(b: WorldBuilder, gazetteer: readonly GazetteerEntry[], attested: Set<string>): SilenceStatus[] {
  const out: SilenceStatus[] = [];
  const statusOf = (x: Block): SilenceState | null => {
    const lead = leadOf(x.text).lead.replace(/:$/, '').toLowerCase();
    if (lead === 'awake' || lead === 'holding' || lead === 'dark') return lead;
    const parent = x.parentId ? b.blockById.get(x.parentId) : undefined;
    return parent ? statusOf(parent) : null;
  };
  for (const x of b.blocks) {
    if (x.docId !== 'journal' || x.kind !== 'item' || !x.headingPath.some((h) => /Seven Silences/i.test(h))) continue;
    const status = statusOf(x);
    if (!status) continue;
    const text = stripMd(x.text);
    for (const e of gazetteer) {
      if (!attested.has(e.id) || !e.silenceAliases?.some((a) => nameRegex(a).test(text))) continue;
      if (!out.some((s) => s.locationId === locationId(e.id))) out.push({ locationId: locationId(e.id), status, text, ref: b.ref(x) });
    }
  }
  return out;
}

/** chronicle.md "CURRENT STATE": labelled fields, plus the first known place named on the Location line. */
function extractCurrent(
  b: WorldBuilder, geo: GeoLocation[], plain: Map<string, string>, gazetteer: readonly GazetteerEntry[],
): CurrentState | null {
  const items = b.blocks.filter((x) => x.docId === 'chronicle' && x.kind === 'item' && (x.headingPath[1] ?? '').toUpperCase() === 'CURRENT STATE');
  if (!items.length) return null;
  const state: CurrentState = { fields: [], partyLocationId: null, day: null };
  for (const x of items) {
    const lead = leadOf(x.text);
    state.fields.push({ label: lead.lead || 'Note', text: lead.lead ? lead.rest : x.text, ref: b.ref(x) });
    if (lead.lead === 'Date') state.day = parseTime(stripMd(lead.rest))?.dayEnd ?? null;
    if (lead.lead === 'Location') {
      let best: { id: string; index: number } | null = null;
      for (const g of geo) {
        const entry = gazetteer.find((e) => locationId(e.id) === g.id);
        for (const n of entry ? entryNames(entry) : [bareName(g.name)]) {
          const m = nameRegex(n).exec(plain.get(x.id)!);
          if (m && (!best || m.index < best.index)) best = { id: g.id, index: m.index };
        }
      }
      if (best) {
        state.partyLocationId = best.id;
        state.partyLocationRef = b.ref(x);
      }
    }
  }
  return state;
}
