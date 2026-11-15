# Architecture — The Chronicle of Thalorien

A local-first companion for one D&D campaign. It reads four player-facing Markdown documents, derives a
structured, fully source-cited model from them, and shows it on an interactive map. No server, no account,
no AI API: everything is deterministic code running in the browser, with data in IndexedDB.

## 1. Principles

| Principle | How it is enforced |
|---|---|
| **Only the four authorized documents are ever read.** | One gate, `src/importer/sourcePolicy.ts`, used by every entry path. Name allowlist + sealed-name denylist are checked *before* a file is opened; an H1 signature check rejects a private file renamed to an allowed name. Nothing lists the source directory. |
| **Originals are never modified.** | The only write path in the app is the key-value store (`src/storage`). Node-side code (`server/`, `scripts/`) is read-only; a test scans it for write/delete/list calls. |
| **Nothing is invented.** | Every entity record, claim and relation carries a `SourceRef` (document, line, heading path) and the verbatim text. Map relations must quote the documents and are re-verified on every import. |
| **Contradictions are kept, not resolved.** | Conflicting values coexist as dated `Claim`s; the importer reports them as `Issue`s and never picks a winner silently. |
| **User work survives re-imports.** | User data lives in a separate layer keyed by stable entity ids. The importer cannot read or write it. |

## 2. Layers

```
.source-files/*.md  (read-only, 4 allowlisted files)
        │  adapters: dev-server endpoint · browser file picker · CLI
        ▼
 sourcePolicy ──► runImport(texts)  ── pure, deterministic ──────────────────────────┐
        │                                                                             │
        │  1 Source   SourceMeta { hash, lines, declaredAsOf }  + exact text          │
        │  2 Blocks   Block { id, docId, line, headingPath, text, asOf }   lossless   │
        │  3 Derived  Entity · Claim · Relation · GeoLocation · SilenceStatus · Issue │
        ▼                                                                             │
 CampaignRepository ── snapshots (append-only) + source texts by hash ◄──────────────┘
        │
        ├── UserLayer (separate store): marker positions, annotations, merge decisions, dismissed issues
        ▼
 applyUserDecisions → indexWorld → selectors            (read side, pure)
        ▼
 mapReducer (state) + buildMapViewModel (geo + user layer + state → MarkerVM[])
        ▼
 React UI: MapView (SVG renderer) · DetailsPanel · SidePanel
```

**Layer 2 is the safety net.** The block parser keeps every non-blank line with its exact text and line number.
Extraction rules in layer 3 only *add* structure on top; text that no rule understands is still stored, cited and
searchable. A test asserts that no source line falls outside a block.

## 3. Directory map

```
src/domain/      types.ts (the data model) · time.ts · text.ts · selectors.ts (read queries)
src/campaign/    gazetteer.ts (place names + provisional points + quoted relations)
                 profile.ts   (honorifics, attitude scale, inventory sections, fact probes, mention masks)
src/importer/    sourcePolicy.ts · markdown.ts · builder.ts · extract/{documents,people}.ts
                 geography.ts · consistency.ts · diff.ts · index.ts (runImport)
src/storage/     kv.ts (KeyValueStore: IndexedDB / memory) · repository.ts · userLayer.ts
src/map/         viewport.ts (math) · mapState.ts (reducer) · layers.ts (view-model)
src/ui/          App.tsx · MapView.tsx · DetailsPanel.tsx · SidePanel.tsx · sources.ts · styles.css
server/          readSources.ts (allowlisted reader) · sourcesPlugin.ts (Vite dev/preview endpoint)
scripts/         import-report.ts (CLI)
tests/           fixtures.ts (synthetic campaign) + 5 suites
```

Dependency rule: `domain` ← `campaign` ← `importer` ← `storage` ← `map` ← `ui`. `domain`, `importer`, `storage`
and `map` contain no React and no DOM (except `IndexedDbStore`). `server/` is never bundled into the app.

## 4. Data model (`src/domain/types.ts`)

- **Block** — one heading, list item, paragraph line or table. `id` is a hash of heading path + text (stable when
  other lines move). `asOf` is its time context (see §6).
- **Entity** — `{ id, kind, name, aliases, status?, time?, attrs, records[] }`, one generic shape for all kinds:
  `character · location · quest · thread · faction · item · event · ruling · promise · lore`.
  `id = kind:slug` and is the stable key for user data. `records[]` are the verbatim statements
  (`role: primary | detail | update`), each with a `SourceRef`. Kind-specific facts are deliberately *not* promoted to
  typed fields unless a rule can extract them reliably; the record text is the authority.
- **Claim** — one sourced assertion of a value for a key (`attitude:character:…`, `command.dc`, …). Many claims per key.
- **Relation** — `within | bearing | near` (geography, with quote), `presence` (faction ↔ place, co-mention only),
  `companion`.
- **GeoLocation** — geography only: `position` (provisional or `null`), `positionBasis`, `tier` (level of detail),
  `relations[]` each with `quote`, `certainty: stated | inferred`, `attested`, `ref`.
- **SilenceStatus** — `awake | holding | dark` per place, read from the journal's "The Seven Silences" list.
- **CurrentState** — the chronicle's "CURRENT STATE" fields, the current day, and the party's place.
- **Issue** — `{ id, code, severity, message, details[], refs[], entityIds[] }`. Ids are stable hashes so a dismissal
  survives re-imports.
- **mentions** — `entityId → blockIds`: where a known name occurs. Heuristic; used only for "appears with" links.

### What each document contributes

| Document | Extracted | Kept as blocks only |
|---|---|---|
| character-sheet | player character + aliases, companions, inventory entries (9 sections), oaths/promises | abilities, combat, spells, features, rest log, backstory |
| journal | quests (active/completed + SAVE updates), people + attitudes, promises, lore, places, silence status | session entries, SAVE narrative paragraphs |
| campaign-chronicle | current state, world facts (lore), NPC registry + attitudes, factions, open threads, session-log events | loot & resources log |
| rulings-and-house-rules | every list item as a verbatim `ruling` | — |

## 5. Handling imperfect data

| Problem | Behaviour |
|---|---|
| **Duplicate records** (Dvalin ×3 in the registry) | Same normalized name (honorifics stripped) → one entity, all records kept, `duplicate-record` info issue. |
| **Possible duplicates** (Sigrún *Flintbeard* / *Blackpowder*; *Reeve* / *Tobin Reeve*) | Never merged automatically. `possible-duplicate` warning; the user decides (`UserLayer.mergeDecisions`), applied on read by `applyUserDecisions`. |
| **Contradictory values** (betrothed vs married; Command DC 18 vs 19) | All claims kept. `claim-superseded` (info) when every claim is dated and the latest date has one value; otherwise `claim-conflict` (warning) listing each value with its line. |
| **Stale headers** (journal says "Day 28", contains Day 75) | `stale-metadata` + `doc-date-mismatch`. Undated entries in a document inherit the date its own header declares. |
| **Stale entries** (faction entry about a slain character) | Flagged; `attrs.stale = true`; the strategic layer lists but does not count it. |
| **Incomplete dates** | `CampaignTime` fields are all optional. Undated events exist but are excluded from the historical overlay. |
| **Uncertain locations** | Every position is provisional (§7). Places the documents list but nobody positioned are `unplaced` and can be placed by hand. |
| **Gazetteer drift** | A gazetteer name not found in the documents is hidden (`gazetteer-unattested`); a relation quote not found is flagged (`relation-unattested`) and not drawn. |

Adding a new contradiction check is usually one entry in `FACT_PROBES` (`src/campaign/profile.ts`).

## 6. Time

`CampaignTime { session?, save?, dayStart?, dayEnd? }`. A block's `asOf` is merged from, in order: enclosing
headings (`## SAVE 4 — Days 28-48`), ancestor list items (`**SAVE 3 additions:**`), its own lead
(`**Title** (Days 13–16):`), and finally the document's `Last updated:` header. `timeOrder()` turns that into a
comparable number: a stated day; else a SAVE whose range the documents state; else an earlier session; the latest
session with no day is *unknown* and never used to settle a conflict. The SAVE→day table is read from the documents.

Two different histories exist and must not be confused:
- **Campaign time** (days/SAVEs inside the story) → drives the map's historical overlay.
- **Import history** (snapshots) → what the documents said at each import; see §8.

## 7. Map

- **World space**: abstract 0–1000 square, north up, **no scale**. The documents give directions and travel times
  but no coordinates, so nothing is "established".
- **Geography** (`campaign/gazetteer.ts` → `WorldData.geo`): provisional point + quoted relations. A test asserts the
  layout never contradicts a stated compass direction. No terrain, borders, or army positions exist in the data.
- **User annotations** (`storage/userLayer.ts`): `markerOverrides` (drag results), notes, pins. Never written back to
  geography; `effectivePosition()` picks user position over provisional.
- **Rendering** (`ui/MapView.tsx`): draws `MapViewModel` only. `map/layers.ts` decides *what* is shown;
  swapping SVG for canvas means replacing one file.
- **Modes**: *exploration* (places, active-quest badges) and *strategic* (silence status, factions whose entries name
  the place, party position). Same data, different view-model.
- **Historical overlay**: optional, orthogonal to mode; counts dated events naming a place up to the chosen day.
- **Level of detail**: `tier` 0/1/2 appear at zoom 0 / 1.8 / 3.5; selected, party, user-placed and (strategic) silence
  sites are always shown.

## 8. Persistence

`KeyValueStore` (stores: `meta`, `snapshots`, `sourceTexts`, `user`, `ui`) with IndexedDB and in-memory backends.
`CampaignRepository.sync(sources)`:
1. applies the source policy and imports;
2. fills in documents not supplied from the latest snapshot (so one edited file can be synced alone);
3. if no document hash changed (and the importer version is the same) → `unchanged`, nothing written;
4. otherwise stores the texts by hash, computes `diffWorlds(prev, next)`, appends an immutable `Snapshot`.

Stored state is validated on load (`normalizeUserLayer`, `restoreMapState`) so damaged or older data degrades to
defaults instead of crashing. Bump `IMPORTER_VERSION` when extraction rules change; the next sync then re-derives.

## 9. Major decisions

1. **Rule-based importer over a generic Markdown AST.** The documents are line-oriented with strong conventions; a
   small line parser gives exact line references and predictable behaviour. Cost: new document conventions need new rules.
2. **Generic `Entity` + verbatim records, not rich typed schemas.** Avoids asserting structure the text does not
   reliably have (e.g. item quantities, quest state transitions). UI code can render any kind uniformly.
3. **Curated gazetteer, machine-verified.** Without AI there is no reliable way to tell a place name from any other
   capitalised word, so place *names* are curated — but their existence and every relation are verified against
   the text at import time, which keeps the curation honest.
4. **Full recompute per import, snapshots for history.** The corpus is small (~900 lines); recomputing is instant and
   removes a whole class of incremental-update bugs. Snapshots store full worlds (≈ hundreds of KB each).
5. **User decisions applied on read.** Imported snapshots stay immutable; merges/dismissals are reversible.
6. **Dev-server endpoint for disk sync.** A browser cannot read local files unprompted; `vite dev/preview` serves the
   four files at `/__campaign/sources`. A static build falls back to the file picker.
7. **Non-cryptographic hash (cyrb53)** for ids/change detection: synchronous and sufficient; not a security feature.
