# Handoff — The Chronicle of Thalorien

Read `docs/ARCHITECTURE.md` first. This file says what works, what the contracts are, and what is left.

## Run it

```
npm install
npm run dev            # http://localhost:5173  → click "Sync from disk"
npm test               # 102 tests (vitest)
npm run typecheck
npm run build          # typecheck + production bundle in dist/
npm run preview        # serves dist/ with disk sync still available
npm run import:report  # CLI: summary + issues  (add  -- --all  to list every entity)
```

Requirements: Node 20+ (developed on Node 26). Source documents are looked up in `CHRONICLE_SOURCE_DIR`, else
`source-files/`, else `.source-files/` (the folder currently on disk is **`.source-files/`**).

## Hard rules (do not relax)

1. **Sources.** Only `character-sheet.md`, `journal.md`, `campaign-chronicle.md`, `rulings-and-house-rules.md`.
   Never open, list, import or summarise `sealed-dm-notes.md`, any playbook, or any other file in the source folder.
   All input must pass `src/importer/sourcePolicy.ts`; check the *name* before reading content. Do not add a
   "browse folder" feature, a directory listing, or a generic file endpoint.
2. **Originals are read-only.** No code may write, rename or delete under the source folder.
3. **No invented facts.** Anything shown as campaign fact must come from a record/claim/relation with a `SourceRef`.
   No armies, borders, territories, terrain, distances or coordinates that the documents do not state. Faction
   "presence" is a co-mention and must be labelled as such, never as control.
4. **Provisional stays visibly provisional.** Do not present a provisional or user-placed point as established.
5. **Keep contradictions visible.** Do not auto-resolve `claim-conflict` or auto-merge `possible-duplicate`.
6. **No AI/LLM API calls**, at import time or anywhere else.
7. **Layer separation.** Imported snapshots are immutable; user data goes only in `UserLayer`; user drags never edit
   `gazetteer.ts`; renderers consume `MapViewModel` and own no campaign data.
8. House rules in the rulings file (content limits, tone, pacing) are campaign facts: display them verbatim, do not
   paraphrase or "improve" them.

## Implemented

- **Source safety**: allowlist, sealed-name denylist, content signature; identical policy for dev endpoint, file
  picker and CLI.
- **Importer** (`runImport`): block parser with exact line refs; extraction of 10 entity kinds; attitudes and fact
  probes as dated claims; duplicate handling; metadata checks; verified geography; silence status; current state.
  On the real corpus: 766 blocks → 557 entities (79 characters, 79 items, 34 quests, 21 threads, 32 events, 39 lore,
  19 promises, 8 factions, 40 places, 206 rulings), 23 issues.
- **Sync & history**: per-document change detection, partial sync, append-only snapshots with structural diff,
  exact source text retrievable per snapshot.
- **Persistence**: IndexedDB; user layer and map state restored on load and validated.
- **Map engine**: zoom at cursor, pan, clickable/keyboard-focusable markers, level of detail, exploration/strategic
  modes, historical overlay with day slider, draggable markers saved as user positions, reset to provisional,
  placing of unplaced places, relation hints for the selected place.
- **Minimal UI**: import panel (sync, file picker, documents, snapshot history, change list), issues panel
  (details, dismiss, same/different person), location details (position basis, quoted relations, silence, faction
  mentions, events, quests, threads, people, notes, source mentions with citations).

## Integration contracts

### Data access — `CampaignRepository` (`src/storage/repository.ts`)
```ts
sync(sources: RawSource[]): Promise<SyncOutcome>      // 'created' | 'unchanged', + rejected[]
listSnapshots(): Promise<SnapshotInfo[]>               // oldest → newest
getSnapshot(id) / latestSnapshot(): Promise<Snapshot | null>   // { world, issues, diff }
getSourceText(snapshotId, docId): Promise<string | null>
loadUserLayer() / saveUserLayer(layer)
loadUi<T>(key) / saveUi<T>(key, value)                 // 'mapState' is taken
```
The UI must not use IndexedDB or `localStorage` directly.

### Reading the world — `src/domain/selectors.ts`
Always: `applyUserDecisions(snapshot.world, snapshot.issues, layer)` → `indexWorld(world)` → selectors
(`mentionBlocks`, `entitiesMentioning`, `coMentioned`, `eventsAt`, `relationsFrom/To`, `silenceOf`).
Add new queries here as pure functions with tests; do not walk `WorldData` inside components.

To render sections that have no entity kind yet (spells, abilities, loot log), filter
`world.blocks` by `docId` + `headingPath` and show `block.text` with its `line`.

### Entities
`Entity.id` (`kind:slug`) is the join key everywhere. `records[0]` is the primary statement; show `record.text`
(Markdown emphasis intact — use `stripMd` or render it) and cite `record.ref.docId:line`. `status` values in use:
quest `active | completed | noted`, thread `open | done`, promise `open | fulfilled`,
item `spent | given-away | commissioned`, character `slain`.

### User layer — `src/storage/userLayer.ts`
Pure updaters: `setMarkerPosition`, `clearMarkerPosition`, `addAnnotation` (attach via `entityId`, or free pin via
`position`), `removeAnnotation`, `decideMerge`, `dismissIssue`. Persist with `repo.saveUserLayer`. To add a field:
extend `UserLayer`, default it in `emptyUserLayer`, accept old data in `normalizeUserLayer`, add a test.

### Map
- State: `mapReducer(state, action)`; actions `set-mode | pan | zoom | set-viewport | select | toggle-overlay |
  set-timeline-day | toggle-edit-positions | restore`. Add overlays to `Overlays` + `restoreMapState`.
- View-model: `buildMapViewModel(ix, layer, state) → { markers, unplaced, pins, relationLines, orphanedUserData, timeline }`.
  New strategic/exploration information belongs here (derived from sourced data), then in the renderer.
- Renderer: `MapView` props `{ vm, state, dispatch, onMoveMarker, onSize }`. It may be restyled or replaced freely.
- Coordinates: `worldToScreen` / `screenToWorld` in `src/map/viewport.ts`. World is 0–1000, y grows south.

### Extending the importer
- New place: add to `GAZETTEER` with a provisional `at`, and relations **only with a verbatim quote**. Run tests
  (`campaign.test.ts` checks attestation against the real documents and bearing consistency).
- New contradiction check: add a `FactProbe`.
- New section/kind: add a rule in `extract/documents.ts`, a kind in `EntityKind`, fixture lines + assertions in
  `tests/importer.test.ts`, then bump `IMPORTER_VERSION`.
- Check results with `npm run import:report -- --all`.

## Known limitations

- **Names are promoted conservatively.** A person only named mid-sentence (e.g. a merchant listed inside another
  NPC's line) is not a character entity; the sentence is still stored and cited.
- **Inventory is a ledger, not a typed inventory.** Rows like "Coin", "Mounts", "Given away" are entries; quantity is
  parsed only from `×N`.
- **Journal SAVE-note quests** get status `noted` and a heuristic title; quest status is not recomputed from updates.
- **Mentions are name matches**, so "appears with" lists can include coincidental matches (`MENTION_MASKS` handles
  known ones such as "Deep Bell" vs Bell).
- **Fact probes are hand-written**; contradictions nobody wrote a probe for are not detected.
- **Time ordering is approximate** for facts dated only by session.
- **Event/ruling ids** use title + occurrence index: stable under edits elsewhere, but reordering two same-titled
  entries swaps their ids.
- Viewing an older snapshot shows it with the *current* user layer.
- A purely static `dist/` (no dev/preview server) has no disk sync; use the file picker.
- `songs-of-the-world.md` is mentioned by the rulings file but is not an authorized source, so it is not imported.

## Remaining work (suggested order)

**UI (the main delegated work)**
1. Visual design of the atlas: base-map artwork slot (an image layer under the grid; keep it clearly decorative),
   typography, marker iconography per `GeoKind`, label collision handling, legend, dark theme.
2. Pages beyond the map: character sheet (from blocks), quests/threads, people with attitude history
   (`world.claims` by `attitude:<id>`), rulings browser with search, inventory, timeline of events.
3. Source viewer: open a document at a cited line (`repo.getSourceText` + `ref.line`), with snapshot-to-snapshot diff.
4. Free map pins and note editing (model and rendering exist; creation UI is missing). Undo for dismissed issues and
   merge decisions (data is in `UserLayer`).
5. Strategic overlay polish: faction panel, silence legend, route drawing **only** for routes the documents state.
6. Touch gestures (pinch zoom), keyboard pan/zoom, focus management, accessibility review.

**Core**
7. Export/import of the local database (JSON backup) and a "reset local data" action.
8. Promote more sections to entities when needed (spells, features, loot log).
9. Gazetteer editor in-app (currently a source file), keeping the quote-verification rule.
10. Optional: merge decisions across kinds, e.g. linking a journal quest to its chronicle thread.

## Notes for the project owner

- `.source-files/` also contains `sealed-dm-notes.md` and a pasted `.txt`. Neither was opened or used. Neither is
  git-ignored; decide whether they should be before pushing the repository anywhere.
- Nothing was committed (`git` is not on PATH in this environment).
