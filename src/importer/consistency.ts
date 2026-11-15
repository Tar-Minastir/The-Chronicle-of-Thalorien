/**
 * Consistency checks. These never change or drop data: they attach Issues that
 * point at the conflicting source lines so a human can decide.
 */
import type { Claim, SourceMeta } from '../domain/types';
import { slugify, stripMd } from '../domain/text';
import { formatTime, timeOrder, type TimeContext } from '../domain/time';
import { FACT_PROBES, type FactProbe } from '../campaign/profile';
import { stripHonorifics, type WorldBuilder } from './builder';

const where = (c: Claim) => `${c.ref.docId}:${c.ref.line}`;

/** Run the fact probes over every block and register a Claim per hit. */
export function probeClaims(b: WorldBuilder, probes: FactProbe[] = FACT_PROBES): void {
  for (const x of b.blocks) {
    if (x.kind === 'table') continue;
    const plain = stripMd(x.text);
    for (const probe of probes) {
      for (const p of probe.patterns) {
        const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
        for (const m of plain.matchAll(re)) {
          const value = p.value ?? m[1];
          if (!value) continue;
          const from = Math.max(0, m.index - 30);
          b.claim(probe.key, probe.label, value, x, plain.slice(from, m.index + m[0].length + 40).trim());
        }
      }
    }
  }
}

export interface ClaimResolution {
  key: string;
  label: string;
  values: string[];
  /** Value(s) held by the latest dated claims; empty when nothing is dated. */
  latest: string[];
  state: 'consistent' | 'superseded' | 'conflict';
  claims: Claim[];
}

/**
 * Decide how the claims for one key relate:
 *  - consistent: one value;
 *  - superseded: several values, every claim is dated, and the latest date has exactly one value;
 *  - conflict:   several values at the latest date, or undated claims disagreeing with the latest.
 */
export function resolveClaims(claims: Claim[], ctx: TimeContext): ClaimResolution[] {
  const byKey = new Map<string, Claim[]>();
  for (const c of claims) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  const out: ClaimResolution[] = [];
  for (const [key, list] of byKey) {
    const values = [...new Set(list.map((c) => c.value))];
    const orders = list.map((c) => timeOrder(c.asOf, ctx));
    const known = orders.filter((o): o is number => o !== null);
    const max = known.length ? Math.max(...known) : null;
    const latest = max === null ? [] : [...new Set(list.filter((_, i) => orders[i] === max).map((c) => c.value))];
    let state: ClaimResolution['state'] = 'consistent';
    if (values.length > 1) {
      const undatedDisagree = list.some((c, i) => orders[i] === null && !latest.includes(c.value));
      state = latest.length === 1 && !undatedDisagree ? 'superseded' : 'conflict';
    }
    out.push({ key, label: list[0].label, values, latest, state, claims: list });
  }
  return out;
}

export function reportClaims(b: WorldBuilder, ctx: TimeContext): void {
  for (const r of resolveClaims(b.claims, ctx)) {
    if (r.state === 'consistent') continue;
    const details = r.claims.map((c) => `"${c.value}" — ${where(c)} (${formatTime(c.asOf)}) — ${c.excerpt}`);
    const entityIds = [...new Set(r.claims.map((c) => c.entityId).filter((x): x is string => Boolean(x)))];
    const refs = r.claims.map((c) => c.ref);
    if (r.state === 'superseded') {
      b.issue('claim-superseded', 'info', r.key,
        `${r.label}: older records give ${r.values.filter((v) => !r.latest.includes(v)).map((v) => `"${v}"`).join(', ')}; the latest dated record gives "${r.latest[0]}".`,
        { details, refs, entityIds });
    } else {
      const latest = r.latest.length ? ` Latest dated value(s): ${r.latest.map((v) => `"${v}"`).join(', ')}.` : ' No record is dated.';
      b.issue('claim-conflict', 'warning', r.key,
        `${r.label}: the documents give ${r.values.map((v) => `"${v}"`).join(' and ')} and the dates do not settle it.${latest}`,
        { details, refs, entityIds });
    }
  }
}

/** Document headers that disagree with their own contents or with each other. */
export function checkMetadata(b: WorldBuilder, sources: SourceMeta[], chronicleDay: number | null): void {
  const declared: { doc: string; day: number }[] = [];
  for (const s of sources) {
    const headingDays = b.blocks
      .filter((x) => x.docId === s.docId && x.kind === 'heading' && x.asOf?.dayEnd !== undefined)
      .map((x) => x.asOf!.dayEnd!);
    const bodyMax = headingDays.length ? Math.max(...headingDays) : null;
    const day = s.declaredAsOf?.dayEnd ?? (s.docId === 'chronicle' ? chronicleDay ?? undefined : undefined);
    if (day !== undefined) declared.push({ doc: s.fileName, day });
    if (s.declaredAsOf?.dayEnd !== undefined && bodyMax !== null && bodyMax > s.declaredAsOf.dayEnd) {
      b.issue('stale-metadata', 'warning', `header:${s.docId}`,
        `${s.fileName} says it was last updated on Day ${s.declaredAsOf.dayEnd}, but it contains sections dated up to Day ${bodyMax}. Undated entries in this file are treated as of Day ${s.declaredAsOf.dayEnd}.`,
        { details: [`Header: ${s.lastUpdatedText ?? ''}`] });
    }
  }
  if (new Set(declared.map((d) => d.day)).size > 1) {
    b.issue('doc-date-mismatch', 'warning', 'declared-days',
      'The documents declare different "current" days: ' + declared.map((d) => `${d.doc} Day ${d.day}`).join('; ') + '.');
  }
}

/** Duplicate and possibly-duplicate records. Exact name matches were merged; near matches are only flagged. */
export function checkDuplicates(b: WorldBuilder): void {
  const all = [...b.entities.values()];
  for (const e of all) {
    if (!['character', 'quest', 'faction'].includes(e.kind)) continue;
    const primary = e.records.filter((r) => r.role === 'primary');
    const perDoc = new Map<string, number>();
    for (const r of primary) perDoc.set(r.ref.docId, (perDoc.get(r.ref.docId) ?? 0) + 1);
    for (const [doc, n] of perDoc) {
      if (n < 2) continue;
      b.issue('duplicate-record', 'info', `${e.id}:${doc}`,
        `${e.name} has ${n} separate records in ${doc}; they were merged into one ${e.kind} and all are kept.`,
        { entityIds: [e.id], refs: primary.filter((r) => r.ref.docId === doc).map((r) => r.ref),
          details: primary.filter((r) => r.ref.docId === doc).map((r) => `${doc}:${r.ref.line} — ${stripMd(r.text).slice(0, 140)}`) });
    }
  }

  const chars = all.filter((e) => e.kind === 'character');
  const tokens = (name: string) => stripHonorifics(name).split(/\s+/).map((t) => slugify(t)).filter(Boolean);
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = tokens(chars[i].name);
      const c = tokens(chars[j].name);
      if (!a.length || !c.length) continue;
      const sameFirst = a[0] === c[0];
      const singleInOther = (a.length === 1 && c.includes(a[0])) || (c.length === 1 && a.includes(c[0]));
      if (!sameFirst && !singleInOther) continue;
      const pair = [chars[i].id, chars[j].id].sort();
      b.issue('possible-duplicate', 'warning', pair.join('|'),
        `"${chars[i].name}" and "${chars[j].name}" may be the same person. They were NOT merged; decide with a merge decision.`,
        { entityIds: pair, refs: [chars[i].records[0]?.ref, chars[j].records[0]?.ref].filter((r) => r !== undefined) });
    }
  }

  // A faction record that still describes a character recorded as slain is probably stale.
  const slain = chars.filter((c) => c.status === 'slain');
  for (const f of all.filter((e) => e.kind === 'faction')) {
    const dead = slain.find((c) => f.name.includes(stripHonorifics(c.name).split(/\s+/)[0]));
    if (!dead) continue;
    f.attrs.stale = true;
    b.issue('stale-metadata', 'warning', `faction:${f.id}`,
      `Faction entry "${f.name}" may be out of date: ${dead.name} is recorded as slain elsewhere.`,
      { entityIds: [f.id, dead.id], refs: [f.records[0].ref, dead.records[0].ref] });
  }
}
