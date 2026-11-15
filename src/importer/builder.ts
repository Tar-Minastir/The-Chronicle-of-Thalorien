import type {
  AttrValue, Block, CampaignTime, Claim, Entity, EntityKind, EntityRecord, Issue, IssueCode, IssueSeverity, Relation, SourceRef,
} from '../domain/types';
import { hashString, slugify, stripMd } from '../domain/text';
import { HONORIFICS } from '../campaign/profile';

export interface UpsertOptions {
  /** Overrides the slug source (default: the name). */
  key?: string;
  aliases?: string[];
  attrs?: Record<string, AttrValue>;
  status?: string;
  time?: CampaignTime;
  records?: EntityRecord[];
}

/** Drop leading honorifics/articles: "Old Mistress Hjördis" -> "Hjördis". Keeps at least one word. */
export function stripHonorifics(name: string): string {
  const words = stripMd(name).replace(/[.:,;]+$/, '').trim().split(/\s+/);
  while (words.length > 1 && HONORIFICS.includes(words[0].toLowerCase())) words.shift();
  return words.join(' ');
}

/** Accumulates derived data during one import. Merges records that resolve to the same entity id. */
export class WorldBuilder {
  readonly entities = new Map<string, Entity>();
  readonly claims: Claim[] = [];
  readonly relations: Relation[] = [];
  readonly issues: Issue[] = [];
  readonly blockById = new Map<string, Block>();
  private readonly children = new Map<string, Block[]>();

  constructor(readonly blocks: Block[]) {
    for (const b of blocks) {
      this.blockById.set(b.id, b);
      if (b.parentId) {
        const list = this.children.get(b.parentId) ?? [];
        list.push(b);
        this.children.set(b.parentId, list);
      }
    }
  }

  ref(b: Block): SourceRef {
    return { docId: b.docId, blockId: b.id, line: b.line, endLine: b.endLine, headingPath: b.headingPath };
  }

  record(b: Block, role = 'primary', text = b.text): EntityRecord {
    return { ref: this.ref(b), text, asOf: b.asOf, role };
  }

  childrenOf(b: Block): Block[] {
    return this.children.get(b.id) ?? [];
  }

  descendants(b: Block): Block[] {
    const out: Block[] = [];
    for (const c of this.childrenOf(b)) out.push(c, ...this.descendants(c));
    return out;
  }

  /** True for list items that only introduce their children ("**SAVE 4 additions:**"). */
  isContainer(b: Block): boolean {
    return this.childrenOf(b).length > 0 && stripMd(b.text).trim().endsWith(':');
  }

  private readonly keyCounts = new Map<string, number>();

  /**
   * Key for records that are distinct even when titled alike (events, rulings):
   * the n-th occurrence of a title gets `title-n`. Independent of line numbers,
   * so ids survive edits elsewhere in the document.
   */
  uniqueKey(kind: EntityKind, base: string): string {
    const k = `${kind}:${base}`;
    const n = (this.keyCounts.get(k) ?? 0) + 1;
    this.keyCounts.set(k, n);
    return n === 1 ? base : `${base}-${n}`;
  }

  upsert(kind: EntityKind, name: string, opts: UpsertOptions = {}): Entity {
    const display = stripMd(name).trim();
    const keySource = opts.key ?? (kind === 'character' ? stripHonorifics(display) : display);
    const id = `${kind}:${slugify(keySource) || hashString(display)}`;
    let e = this.entities.get(id);
    if (!e) {
      e = { id, kind, name: display, aliases: [], attrs: {}, records: [] };
      this.entities.set(id, e);
    } else if (display !== e.name && !e.aliases.includes(display)) {
      e.aliases.push(display);
    }
    for (const a of opts.aliases ?? []) if (a && a !== e.name && !e.aliases.includes(a)) e.aliases.push(a);
    for (const [k, v] of Object.entries(opts.attrs ?? {})) if (e.attrs[k] === undefined) e.attrs[k] = v;
    if (opts.status) e.status = opts.status;
    if (opts.time && !e.time) e.time = opts.time;
    for (const r of opts.records ?? []) {
      if (!e.records.some((x) => x.ref.blockId === r.ref.blockId && x.text === r.text)) e.records.push(r);
    }
    return e;
  }

  issue(
    code: IssueCode,
    severity: IssueSeverity,
    subject: string,
    message: string,
    extra: { details?: string[]; refs?: SourceRef[]; entityIds?: string[] } = {},
  ): void {
    const id = `${code}:${hashString(subject)}`;
    if (this.issues.some((i) => i.id === id)) return;
    this.issues.push({
      id, code, severity, message,
      details: extra.details ?? [],
      refs: extra.refs ?? [],
      entityIds: extra.entityIds ?? [],
    });
  }

  claim(key: string, label: string, value: string, b: Block, excerpt: string, entityId?: string): void {
    if (this.claims.some((c) => c.key === key && c.value === value && c.ref.blockId === b.id)) return;
    this.claims.push({ key, label, value, excerpt, ref: this.ref(b), asOf: b.asOf, entityId });
  }
}
