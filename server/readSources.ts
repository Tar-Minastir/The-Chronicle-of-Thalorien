/**
 * Node-side reader for the authorized source documents (dev server + CLI).
 *
 * Safety properties (covered by tests/sourceSafety.test.ts):
 *  - opens ONLY the four allowlisted file names, by exact path; never lists the directory,
 *    so a sealed file sitting next to them is never touched;
 *  - read-only: this module has no write/rename/delete calls;
 *  - content must pass the signature check or it is discarded.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AUTHORIZED_DOCS, classifyFileName, verifyContent, type RejectReason } from '../src/importer/sourcePolicy.ts';

export interface SourceBundle {
  documents: { fileName: string; text: string }[];
  missing: string[];
  rejected: { fileName: string; reason: RejectReason }[];
}

export type ReadTextFile = (path: string) => Promise<string>;

/** `CHRONICLE_SOURCE_DIR`, else `source-files/`, else `.source-files/` under the project root. */
export function resolveSourceDir(root: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.CHRONICLE_SOURCE_DIR) return resolve(root, env.CHRONICLE_SOURCE_DIR);
  for (const name of ['source-files', '.source-files']) {
    const dir = join(root, name);
    if (existsSync(dir)) return dir;
  }
  return join(root, 'source-files');
}

export async function readAuthorizedSources(
  dir: string,
  read: ReadTextFile = (p) => readFile(p, 'utf8'),
): Promise<SourceBundle> {
  const bundle: SourceBundle = { documents: [], missing: [], rejected: [] };
  for (const doc of AUTHORIZED_DOCS) {
    const verdict = classifyFileName(doc.fileName);
    if (!verdict.ok) continue; // unreachable unless the allowlist itself is misconfigured
    let text: string;
    try {
      text = await read(join(dir, doc.fileName));
    } catch {
      bundle.missing.push(doc.fileName);
      continue;
    }
    const content = verifyContent(doc, text);
    if (content.ok) bundle.documents.push({ fileName: doc.fileName, text });
    else bundle.rejected.push({ fileName: doc.fileName, reason: content.reason });
  }
  return bundle;
}
