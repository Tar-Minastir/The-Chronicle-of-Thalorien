/**
 * Browser-side source adapters. Both funnel into CampaignRepository.sync(),
 * which re-applies the source policy; these adapters additionally make sure a
 * disallowed file's CONTENT is never read in the first place.
 */
import type { RawSource, RejectedSource } from '../importer';
import { classifyFileName } from '../importer/sourcePolicy';

export interface PickedFile {
  name: string;
  text(): Promise<string>;
}

export interface GatheredSources {
  sources: RawSource[];
  rejected: RejectedSource[];
  missing: string[];
}

/** Files chosen in a file picker / dropped on the page. Name is checked BEFORE text() is called. */
export async function readPickedFiles(files: Iterable<PickedFile>): Promise<GatheredSources> {
  const out: GatheredSources = { sources: [], rejected: [], missing: [] };
  for (const f of files) {
    const verdict = classifyFileName(f.name);
    if (!verdict.ok) {
      out.rejected.push({ fileName: f.name, reason: verdict.reason });
      continue;
    }
    out.sources.push({ fileName: verdict.doc.fileName, text: await f.text() });
  }
  return out;
}

/** The dev/preview server endpoint that serves the four authorized files from disk. */
export async function fetchDiskSources(fetchFn: typeof fetch = fetch): Promise<GatheredSources> {
  const res = await fetchFn('/__campaign/sources', { cache: 'no-store' });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('application/json')) {
    throw new Error('Disk sync is only available while running `npm run dev` or `npm run preview`. Use "Choose files" instead.');
  }
  const body = (await res.json()) as { documents: RawSource[]; missing: string[]; rejected: RejectedSource[] };
  return { sources: body.documents, rejected: body.rejected, missing: body.missing };
}
