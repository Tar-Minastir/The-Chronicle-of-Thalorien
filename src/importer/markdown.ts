/**
 * Line-preserving Markdown block parser.
 *
 * Deliberately not a full CommonMark parser: the campaign documents are
 * line-oriented (one fact per list item or line). We keep exact line numbers
 * and exact text so every derived fact can cite its source, and so that text
 * no extraction rule understands is still retained verbatim.
 */
import type { Block, BlockKind, CampaignTime, DocId } from '../domain/types';
import { firstDelimiter, hashString, stripMd } from '../domain/text';
import { mergeTime, parseTime } from '../domain/time';

interface Draft {
  kind: BlockKind;
  headingPath: string[];
  depth: number;
  parent?: Draft;
  line: number;
  endLine: number;
  parts: string[];
  block?: Block;
}

export interface Lead {
  /** Plain-text lead: bold title plus an immediately following parenthetical, or text before ':' / ' — '. */
  lead: string;
  bold: boolean;
  /** Remainder of the text after the lead and its delimiter. */
  rest: string;
}

/** The "title" part of a list item, which is where these documents put names and dates. */
export function leadOf(text: string): Lead {
  const m = /^(?:~~)?\*\*(.+?)\*\*(?:~~)?(\s*\([^)]*\))?/.exec(text);
  if (m) {
    const rest = text.slice(m[0].length).replace(/^\s*(?:[:.]|—)\s*/, '');
    return { lead: (stripMd(m[1]) + (m[2] ?? '')).trim(), bold: true, rest };
  }
  const d = firstDelimiter(text);
  if (d && d.index > 0 && d.index <= 60) {
    return { lead: stripMd(text.slice(0, d.index)).trim(), bold: false, rest: text.slice(d.index + d.length).trim() };
  }
  return { lead: '', bold: false, rest: text };
}

export function parseMarkdown(docId: DocId, source: string): Block[] {
  const lines = source.replace(/^﻿/, '').split(/\r?\n/);
  const headings: string[] = [];
  const drafts: Draft[] = [];
  let stack: { indent: number; draft: Draft }[] = [];
  let open: Draft | null = null;

  const path = () => headings.filter((h) => h);
  const add = (d: Draft) => {
    drafts.push(d);
    return d;
  };

  lines.forEach((rawLine, i) => {
    const n = i + 1;
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) {
      open = null;
      return;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      headings.length = level - 1;
      for (let k = 0; k < level - 1; k++) headings[k] ??= '';
      headings[level - 1] = stripMd(h[2]).trim();
      stack = [];
      open = null;
      add({ kind: 'heading', headingPath: path(), depth: 0, line: n, endLine: n, parts: [h[2].trim()] });
      return;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      stack = [];
      open = null;
      return;
    }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const indent = li[1].replace(/\t/g, '  ').length;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parent = stack[stack.length - 1]?.draft;
      const d = add({ kind: 'item', headingPath: path(), depth: stack.length, parent, line: n, endLine: n, parts: [li[2]] });
      stack.push({ indent, draft: d });
      open = d;
      return;
    }
    if (/^\s*\|/.test(line)) {
      if (open && open.kind === 'table') {
        open.parts.push(line.trim());
        open.endLine = n;
      } else {
        stack = [];
        open = add({ kind: 'table', headingPath: path(), depth: 0, line: n, endLine: n, parts: [line.trim()] });
      }
      return;
    }
    // Indented continuation of the list item directly above.
    if (open && open.kind === 'item' && /^\s+/.test(line)) {
      open.parts.push(line.trim());
      open.endLine = n;
      return;
    }
    // Otherwise each line is its own paragraph (the documents are line-oriented).
    stack = [];
    open = add({ kind: 'paragraph', headingPath: path(), depth: 0, line: n, endLine: n, parts: [line.trim()] });
    open = null;
  });

  const seen = new Map<string, number>();
  for (const d of drafts) {
    const text = d.parts.join(d.kind === 'table' ? '\n' : ' ');
    const base = `${docId}:${hashString(d.headingPath.join('/') + '\n' + d.kind + '\n' + text)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    d.block = {
      id: count === 1 ? base : `${base}~${count}`,
      docId,
      kind: d.kind,
      headingPath: d.headingPath,
      depth: d.depth,
      parentId: d.parent?.block?.id,
      line: d.line,
      endLine: d.endLine,
      text,
    };
  }

  // Time context: headings (outer -> inner), then ancestor list items, then own lead.
  for (const d of drafts) {
    const b = d.block!;
    const headingTimes = b.headingPath.map((t) => parseTime(t));
    const ancestors: (CampaignTime | undefined)[] = [];
    for (let p = d.parent; p; p = p.parent) ancestors.unshift(parseTime(leadOf(p.block!.text).lead));
    const own = b.kind === 'heading' ? undefined : parseTime(leadOf(b.text).lead);
    if (own) b.ownTime = own;
    const asOf = mergeTime(...headingTimes, ...ancestors, own);
    if (asOf) b.asOf = asOf;
  }
  return drafts.map((d) => d.block!);
}
