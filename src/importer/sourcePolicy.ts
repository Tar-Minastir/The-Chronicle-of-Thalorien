/**
 * Source safety gate. EVERY path by which text can enter the app goes through here.
 *
 * Three independent checks, in this order:
 *   1. forbidden-name pattern  (sealed / DM notes / playbook ...)   -> never read
 *   2. exact-filename allowlist (the four authorized documents)     -> never read otherwise
 *   3. content signature (the document's own H1)                    -> read, then discarded if wrong
 *
 * Checks 1-2 need only the file NAME, so callers must run `classifyFileName`
 * before opening a file. Check 3 stops a sealed file that was renamed to an
 * allowlisted name.
 */
import type { DocId } from '../domain/types';

export interface AuthorizedDoc {
  docId: DocId;
  fileName: string;
  title: string;
  /** Must match the first non-blank line of the file. */
  signature: RegExp;
}

export const AUTHORIZED_DOCS: readonly AuthorizedDoc[] = [
  { docId: 'character-sheet', fileName: 'character-sheet.md', title: 'Character sheet', signature: /^#\s+CHARACTER SHEET\b/i },
  { docId: 'journal', fileName: 'journal.md', title: 'Journal', signature: /^#\s+JOURNAL\b/i },
  { docId: 'chronicle', fileName: 'campaign-chronicle.md', title: 'Campaign chronicle', signature: /^#\s+CAMPAIGN CHRONICLE\b/i },
  { docId: 'rulings', fileName: 'rulings-and-house-rules.md', title: 'Rulings & house rules', signature: /^#\s+RULINGS\b/i },
];

/** Names that must never be opened, whatever else is true about them. */
export const FORBIDDEN_NAME = /sealed|dm[-_ ]?notes|dm[-_ ]?only|playbook|dungeon[-_ ]?master|secret|spoiler/i;
/** First-line content that marks a private document. */
export const FORBIDDEN_TITLE = /sealed|dm[-_ ]?notes|dm[-_ ]?only|playbook|dungeon master|for the dm/i;

export type RejectReason = 'forbidden-name' | 'not-allowlisted' | 'forbidden-content' | 'signature-mismatch';

export type NameVerdict = { ok: true; doc: AuthorizedDoc } | { ok: false; reason: RejectReason };

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}

/** Decide from the name alone whether a file may be opened. */
export function classifyFileName(path: string): NameVerdict {
  const name = baseName(path).trim().toLowerCase();
  if (FORBIDDEN_NAME.test(name)) return { ok: false, reason: 'forbidden-name' };
  const doc = AUTHORIZED_DOCS.find((d) => d.fileName === name);
  if (!doc) return { ok: false, reason: 'not-allowlisted' };
  return { ok: true, doc };
}

/** Decide whether text that claims to be `doc` really is that document. */
export function verifyContent(doc: AuthorizedDoc, text: string): { ok: true } | { ok: false; reason: RejectReason } {
  const firstLine =
    text
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .find((l) => l.trim().length > 0) ?? '';
  if (FORBIDDEN_TITLE.test(firstLine)) return { ok: false, reason: 'forbidden-content' };
  if (!doc.signature.test(firstLine.trim())) return { ok: false, reason: 'signature-mismatch' };
  return { ok: true };
}

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  'forbidden-name': 'File name matches the sealed/private pattern. It was not opened.',
  'not-allowlisted': 'Not one of the four authorized documents. It was not opened.',
  'forbidden-content': 'First line marks this as a private document. Its content was discarded.',
  'signature-mismatch': 'Content does not match the document this file name claims to be. Its content was discarded.',
};
