/**
 * Domain model for The Chronicle of Thalorien.
 *
 * Layering (see docs/ARCHITECTURE.md):
 *   source text -> Block (lossless, line-referenced) -> Entity / Claim / Relation (derived)
 * Everything derived carries a SourceRef back to the block it came from.
 * Nothing in this file is user-authored state; that lives in storage/userLayer.ts.
 */

export type DocId = 'character-sheet' | 'journal' | 'chronicle' | 'rulings';
export const DOC_IDS: readonly DocId[] = ['character-sheet', 'journal', 'chronicle', 'rulings'];

export interface SourceMeta {
  docId: DocId;
  fileName: string;
  /** Content hash of the exact text imported (change detection, not security). */
  hash: string;
  bytes: number;
  lineCount: number;
  /** Verbatim "Last updated: ..." line, when the document declares one. */
  lastUpdatedText?: string;
  declaredAsOf?: CampaignTime;
}

export interface SourceRef {
  docId: DocId;
  blockId: string;
  /** 1-based, inclusive. */
  line: number;
  endLine: number;
  headingPath: string[];
}

/**
 * In-campaign time. All fields optional: the documents date some facts by day,
 * some only by SAVE number, some only by session, and many not at all.
 */
export interface CampaignTime {
  session?: number;
  save?: number;
  dayStart?: number;
  dayEnd?: number;
}

export type BlockKind = 'heading' | 'item' | 'paragraph' | 'table';

export interface Block {
  id: string;
  docId: DocId;
  kind: BlockKind;
  headingPath: string[];
  /** List nesting depth (0 for top-level items and non-list blocks). */
  depth: number;
  parentId?: string;
  line: number;
  endLine: number;
  /** Exact content (list marker / heading hashes removed, markdown emphasis kept). */
  text: string;
  /** Time context: own lead marker, else enclosing list item / heading, else document header. */
  asOf?: CampaignTime;
  /** Time stated in this block's own lead ("**Title** (Days 13–16): ..."). */
  ownTime?: CampaignTime;
}

export type EntityKind =
  | 'character'
  | 'location'
  | 'quest'
  | 'thread'
  | 'faction'
  | 'item'
  | 'event'
  | 'ruling'
  | 'promise'
  | 'lore';

export type AttrValue = string | number | boolean | null;

export interface EntityRecord {
  ref: SourceRef;
  /** Verbatim block text. This is the authoritative statement of the fact. */
  text: string;
  asOf?: CampaignTime;
  /** e.g. 'primary' | 'detail' | 'update'. */
  role: string;
}

export interface Entity {
  /** Stable across imports: `${kind}:${slug}`. User-layer data keys on this. */
  id: string;
  kind: EntityKind;
  name: string;
  aliases: string[];
  status?: string;
  time?: CampaignTime;
  attrs: Record<string, AttrValue>;
  records: EntityRecord[];
}

/** One sourced assertion of a value. Conflicting claims coexist; none is deleted. */
export interface Claim {
  key: string;
  label: string;
  value: string;
  excerpt: string;
  ref: SourceRef;
  asOf?: CampaignTime;
  entityId?: string;
}

export type RelationType = 'within' | 'bearing' | 'near' | 'presence' | 'companion';

export interface Relation {
  type: RelationType;
  from: string;
  to: string;
  certainty: 'stated' | 'inferred' | 'co-mention';
  note?: string;
  ref?: SourceRef;
}

export type IssueSeverity = 'info' | 'warning' | 'error';
export type IssueCode =
  | 'source-rejected'
  | 'source-missing'
  | 'stale-metadata'
  | 'doc-date-mismatch'
  | 'claim-conflict'
  | 'claim-superseded'
  | 'duplicate-record'
  | 'possible-duplicate'
  | 'gazetteer-unattested'
  | 'relation-unattested'
  | 'location-unplaced'
  | 'unresolved-reference';

export interface Issue {
  /** Stable hash of code + subject, so dismissals survive re-imports. */
  id: string;
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  details: string[];
  refs: SourceRef[];
  entityIds: string[];
}

// ---------- geography (data only; rendering lives in src/map) ----------

export type Bearing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type GeoKind = 'region' | 'settlement' | 'site' | 'route' | 'water';

export interface Point {
  x: number;
  y: number;
}

export interface GeoRelation {
  kind: 'within' | 'bearing' | 'near';
  target: string;
  bearing?: Bearing;
  /** Verbatim quote from the sources that the relation rests on. */
  quote: string;
  certainty: 'stated' | 'inferred';
  /** True when the quote was found in the currently imported documents. */
  attested: boolean;
  ref?: SourceRef;
}

export interface GeoLocation {
  /** Same id as the location Entity. */
  id: string;
  name: string;
  kind: GeoKind;
  /** Level of detail: 0 always visible, 1 from zoom 2, 2 from zoom 4. */
  tier: 0 | 1 | 2;
  parentId?: string;
  /** Provisional coordinates in world units (0..1000, north up). Null = not yet placed. */
  position: Point | null;
  /** Why the provisional point is where it is. No position is "established" by the sources. */
  positionBasis: 'stated-relation' | 'no-stated-position' | 'unplaced';
  relations: GeoRelation[];
}

export type SilenceState = 'awake' | 'holding' | 'dark';

export interface SilenceStatus {
  locationId: string;
  status: SilenceState;
  text: string;
  ref: SourceRef;
}

export interface CurrentState {
  fields: { label: string; text: string; ref: SourceRef }[];
  partyLocationId: string | null;
  partyLocationRef?: SourceRef;
  day: number | null;
}

export interface WorldData {
  importerVersion: number;
  sources: SourceMeta[];
  blocks: Block[];
  entities: Entity[];
  relations: Relation[];
  claims: Claim[];
  /** entityId -> ids of blocks that mention it by name (heuristic co-mention index). */
  mentions: Record<string, string[]>;
  geo: GeoLocation[];
  silences: SilenceStatus[];
  current: CurrentState | null;
  /** SAVE number -> day range, as stated by the documents' own SAVE headings. */
  saves: Record<number, { dayStart: number; dayEnd: number }>;
  maxDay: number | null;
  maxSession: number | null;
}
