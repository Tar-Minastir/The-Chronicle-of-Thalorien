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

type SourceBundle = { documents: RawSource[]; missing: string[]; rejected: RejectedSource[] };

async function jsonOrNull(fetchFn: typeof fetch, url: string): Promise<SourceBundle | null> {
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    return res.ok && type.includes('application/json') ? ((await res.json()) as SourceBundle) : null;
  } catch {
    return null;
  }
}

/**
 * The four authorized files: from the dev/preview server endpoint when running locally, else from the
 * copy a hosted build (GitHub Pages) was published with. Either way the repository re-applies the source policy.
 */
export async function fetchDiskSources(fetchFn: typeof fetch = fetch, base: string = import.meta.env?.BASE_URL ?? '/'): Promise<GatheredSources> {
  const body = (await jsonOrNull(fetchFn, `${base}__campaign/sources`)) ?? (await jsonOrNull(fetchFn, `${base}campaign-sources.json`));
  if (!body) {
    throw new Error('Disk sync is only available while running `npm run dev` or `npm run preview`. Use "Choose files" instead.');
  }
  return { sources: body.documents, rejected: body.rejected, missing: body.missing };
}
