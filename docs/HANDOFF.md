# Handoff — The Chronicle of Thalorien

Read `docs/ARCHITECTURE.md` first. This file says what works, what the contracts are, and what is left.

## Run it

```
npm install
npm run dev            # http://localhost:5173  → click "Sync from disk"
npm test               # 148 tests (vitest)
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

---

# Milestones 2 and 2B — the illustrated atlas

Everything above still holds (hard rules included). This section describes what was added on top. Where the
"Implemented / Remaining work" lists above mention the old plain SVG map, this section supersedes them.

## Rendering architecture: three separate systems

`src/ui/MapView.tsx` stacks three systems. Each can be switched off without affecting the others.

| # | System | Where | Draws | Never contains |
|---|---|---|---|---|
| 1 | **Base geography** | `<BaseMap>` — a `<canvas>` (`src/atlas/BaseMap.tsx`, `paint.ts`, `fields.ts`) | ground relief and biomes, sea, forests, mountains, rivers, lakes, edge clouds | names, markers, anything from the campaign record |
| 2 | **Cartography** | `<g class="carto">` (SVG) | routes and their stops, place names, names of proposed features | interactive tokens |
| 3 | **Interactive overlays** | `<g class="overlays">` (SVG) | place symbols, proposed landmarks, silence sigils, banners, report seals, hero tokens, notes | terrain |

There is no flattened map image. With systems 2 and 3 hidden, the canvas alone is a complete map (verified).

### How the base geography is painted
1. `buildFields(features)` (`fields.ts`, pure) turns feature polygons and ridgelines into scalar fields on a
   501×501 grid: `elev`, `sea` (signed distance), `forest` (cover 0..1), `tone`, `fen`, `waste`, `ice`, `heath`.
   Lookups are domain-warped with noise, so authored straight-edged polygons come out with natural outlines, and
   forest cover falls off across a band instead of at a line. Scattered groves fill the lowlands.
2. `shadeGround(fields, R)` (`paint.ts`, pure, unit-tested) colours every pixel: biome colour by elevation and
   masks, snow line that drops toward the north, beaches and foam, hill-shading lit from the north-west, soft
   irregular world edge.
3. Canvas painters add, each into its **own bitmap**: `paintForests` (dark floor wash + ~25k overlapping canopy
   stamps with shadow and highlight), `paintMountains` (illustrated peaks with lit/shadow faces and snow caps placed
   along each ridgeline, plus rolling hills on the plains), `paintWaters` (rivers with banks and growing width,
   lakes), `paintSky`.
4. `drawBase` scales the bitmaps onto the screen for the current camera. One bitmap per layer is what makes
   terrain / forests / mountains / waters independently toggleable.
5. **Level of detail**: above ~2.6 screen px per world unit, `drawTreeDetail` draws individual trees for the
   visible area only, sampling the same `forest` field, at three spacings (`treeSpacing`).

Cost: bitmaps are 2048² (`RASTER_SIZE`), painted once in about 2.5 s with a status line, cached for the session,
and repainted only when the set of features changes (proposed layer toggled, a proposal removed/restored).
No dependency was added; it is plain Canvas 2D.

## Geography data (`src/atlas/geography.ts`)

`AtlasFeature { id, name?, type, status, region, description, basis?, near?, relation?, shape, height?, width?,
snowy?, tone?, label? }`, with `shape` = `area` (polygon) | `line` (ridgeline, river, road) | `point`.

### Canon versus proposed

| Status | Meaning | Where it lives | Rules |
|---|---|---|---|
| **confirmed** | stated in the four documents | gazetteer places; `basis` quotes | never changed here |
| **interpreted** | the atlas's shape for a confirmed fact (range around a recorded peak, course of a recorded river) | `ATLAS_FEATURES`, `status: 'interpreted'` | must carry `basis` (verbatim quotes, verified by `tests/geography.test.ts`; `[]` = rests on the place's name) and `near` (the place it draws); has no name of its own; cannot be edited or removed by the player |
| **proposed** | invented geography (17 features: 3 ranges, 3 forests, 4 rivers, 1 lake, 1 road, 5 landmarks/hamlets) | `ATLAS_FEATURES`, `status: 'proposed'` | must have `name`, `relation`, `near`; must **not** have `basis`; must not describe events, forces, ownership or politics (a test scans for such words); not canon until the DM says so |

Tests also check that the painted geography agrees with the stated directions (Kharûn north of Harrowmere, ice
north of the waste north of Kharûn, fells north-east of the Tree, long hills between the Tree and Ennor-Lûth, sea
by the south-west fens, the Nindor passing the Grey Step and the Three Cairns).

**Canon decision to keep:** Uchkeken is drawn as a *fire-scarred* wood (`tone: 'scarred'`: bare patches, dead
timber, muted canopy), because the documents speak of "burnt stumps" and "burnt hills north" and list seeing it
green again as a goal. Do not repaint it lush.

### The player's control over proposals (`UserLayer.atlas`)
`{ removed: string[], edits: Record<id, { name?, description? }> }`, updaters `editAtlasFeature`,
`removeAtlasFeature`, `restoreAtlasFeature`. `resolveFeatures(edits, showProposed)` applies them. Proposed point
features can also be dragged (their id goes into `markerOverrides`). Interpreted features ignore all of this.
The user layer is now version 2; `normalizeUserLayer` upgrades version 1 data.

### Export
`exportProposalsMarkdown(edits, date)` (pure, tested) → Markdown grouped by region then feature type, with a
"proposals, not campaign facts" header, each feature's description, where it lies, nearby established places and an
accept/change/reject line; removed proposals are omitted, renames applied. A final section lists the interpretations
with their basis, for information. UI: Map Layers → *Preview the proposal* / *Save as Markdown…*. Nothing promotes a
proposal to canon; that would be a deliberate edit of `geography.ts` after the DM's decision.

## Layer management (`src/map/mapState.ts`)

`LayerVisibility`: `terrain, forests, mountains, waters, routes, proposed, places, labels, heroes, factions, reports,
silences, sites`; all independent; persisted; older saved states are upgraded. `Overlays` (history, annotations,
provisional) are unchanged. `highlight: 'none' | 'geography' | 'characters' | 'mystical'` dims the other overlay
families via CSS (`.hl-*`), never hiding them. Actions: `toggle-layer`, `set-layers`, `set-highlight`.
The panel is `src/ui/LayersPanel.tsx`; its legend renders the same symbol components the map uses.

Symbol families are distinguishable by shape, not only colour: places = inked pictogram on a round plinth;
heroes = framed round medallion on a pointer; factions = pennant on a pole; reports = red star-seal;
silences = eight-pointed star (gold with halo / blue with ring / dark, broken); proposed = dotted ring with a leaf,
and names prefixed with ❧.

## Other additions since milestone 1
- Exploration: "recorded in play" vs "known by report" (`recordedInPlay`: named in the session log; this is not
  proof of a visit and the UI says so), uncertainty halo for places with no stated position, four stated routes
  (`src/atlas/terrain.ts` `ROUTES`, quotes verified) with visible stops.
- Strategic: silence sigils, faction banners (placeholder devices; the documents describe no heraldry), "allied"
  only where a faction entry says it, force reports as quoted dispatches (`forceReports`), never as unit positions.
- Hero tokens (`heroPlacements`): Thalorien, plus sheet companions only if the chronicle's Location line names
  them. `MapView` takes a `portraitFor(characterId)` resolver for the future appearance registry.
- Shell: masthead with seven sections; the six non-atlas pages are plain cited indexes (`src/ui/Codex.tsx`).
  The import/snapshot/issues panel now lives under Campaign History.
- Search covers places, people, factions and proposed additions.

## Verification performed (this milestone)

Automated: 148 tests pass; `tsc --noEmit` clean; production build succeeds.

In the running app (dev server, Chromium):
- Import: "Sync from disk" created snapshot #2 (importer version bump), same 557 records; a second sync reported
  no changes.
- Each of the 13 layers toggled individually. Terrain layers changed only the canvas; overlay layers changed only
  their own SVG elements and left the canvas byte-identical; hiding proposed additions repainted the land and
  restoring them reproduced the identical image.
- All overlays off: the terrain alone remained a complete map.
- Exploration ↔ Strategic: sigils, banners and seals appear only in Strategic; quest badges only in Exploration.
- A place marker and a proposed landmark were dragged; both positions, and a rename, survived a page reload; both
  were then reset.
- Proposal workflow: search → select → rename → export preview showed the new name; remove → listed as removed and
  absent from the export → restore.
- Viewed at whole-map, normal and close zoom; labels did not overlap at normal zoom.

Not verified: other browsers; touch input; frame rate under profiling (panning felt immediate; no measurement);
the *Save as Markdown…* download itself (the same text was checked in the preview).

## Known limitations

- **Not a painted illustration.** The terrain is procedural: shaded relief plus stamped peaks and canopies. It is
  continuous and readable but less ornate than a hand-painted or generated map; in particular mountains are stamped
  symbols on relief, not an oblique painting.
- **Terrain is anchored to the provisional layout.** Dragging a place marker does not move the forest or range drawn
  for it. Changing a place's provisional point in the gazetteer means re-authoring nearby geometry.
- **Area features have fixed geometry.** The player can rename, re-describe, hide or remove a proposed forest, range
  or river, and move proposed landmarks, but cannot reshape outlines in the UI.
- **Rivers do not carve the height field**; their courses are authored to run through low ground.
- The world is a square; on a wide window there is parchment either side at whole-map zoom.
- Bitmaps are fixed at 2048², so above about 4× zoom the ground softens (trees stay crisp). Maximum zoom is 10.
- Repainting after toggling proposed additions takes about 2.5 s on the main thread.
- At window widths under ~1100 px the floating controls crowd the dock.
- `src/atlas/terrain.ts` `TERRAIN` is now used only to pick place icons; the glyph-cluster renderer was removed.

## Recommended next steps

1. Art pass on the painters: richer mountain forms, coastal detail, field/meadow textures, seasonal palette.
2. Move painting to a Web Worker (`OffscreenCanvas`) and cache the bitmaps in IndexedDB.
3. Tiled high-zoom rendering so the ground stays sharp when zoomed in.
4. In-app geometry editing for proposed areas and lines, and adding new proposals from the UI.
5. Record the DM's decisions: an "accepted" status that moves a proposal into the confirmed set with a citation.
6. Optional non-square world or extended margins for wide screens.

## Notes for the project owner

- During milestone 1 `.source-files/` also held `sealed-dm-notes.md` and a pasted `.txt`. Neither was opened or used.
  As of milestone 2B the folder lists only the four authorized documents. If private files are put there again,
  note that the folder is not git-ignored.
- Nothing was committed (`git` is not on PATH in this environment).

---

# Milestone 2C — redesigned shell and illustrated overlays

Built on branch `feature/fantasy-atlas`. Note for the owner: `UI-redesign` was created from `main` and does **not**
contain milestones 2/2B; this work is not on it.

## What changed

**Fourth rendering layer: the application shell** (never moves with the map)
- `src/ui/shell/Sidebar.tsx` — ornate sidebar: logo, primary navigation (World Atlas, Quests, Companions, Journal),
  secondary "Codex" group (Character, Encyclopedia, Rules, History), slot for the contextual panel.
- `src/ui/shell/icons.tsx` — engraved line icons, corner `Flourish`, `Divider`, and `WhiteTreeEmblem`. The emblem
  follows the chronicle's description of the first silence's sign, "the Tree whose roots are its crown": the roots
  mirror the branches.
- `src/ui/LocationPreview.tsx` — contextual panel: illustration, title, description, fact rows, action button.
  Rows are derived from the record and omitted when nothing is recorded. The description is the place's own record,
  else a line of the documents that defines it; "CURRENT STATE" planning lines are skipped.
- `src/ui/AtlasPage.tsx` — top atlas bar (Atlas / Locations / Factions / Routes open the dock with an index;
  search; saved views; settings → layers), floating mode switch, controls, legend, timeline, and the dock.
- `src/ui/Codex.tsx` — `Tome` page frame (dark frame, parchment leaf) used by every book page; chapters fold;
  `SheetPage` has a summary plate (monogram portrait placeholder, ability table, vitals) and section navigation.
- `src/ui/styles.css` — the design system, in twelve labelled sections; tokens follow the brief's palette.

**Map composition**
- `coverViewport(focus, size, extra)` / `showsMargin` (`src/map/viewport.ts`): the land fills the viewport on any
  aspect ratio without stretching. On first load, a stored view that would show empty space is reframed on the
  company's location. "Reset view" returns there; "Whole world" still shows the complete square world.
- Beyond the world's edge the surface is dark mist, not blank parchment (`.mist`, `.atlas-map`).

**Overlays and cartography**
- Major places (tier 0) are lettered on parchment ribbons; lesser names stay compact. Hero tokens reserve label
  space so names are not placed under them.
- `src/atlas/vignettes.tsx`: vector settlement vignettes by culture (`PLACE_ART`, with the reason for each choice),
  a 2:1 `PanelScene`, and the artwork slots (`useArtwork`, `artUrl`).
- `art.tsx`: hanging gonfalon banners, diamond silence sigils, hero medallion with silhouette and nameplate for the
  hero (initials for companions; `portraitFor` hook unchanged).
- Routes are gold dotted lines with dark casing and stop markers.

**State**
- `MapState.bookmarks` (saved camera views; `add-bookmark`, `remove-bookmark`), `set-overlay`; older saved states
  are upgraded by `restoreMapState`.
- Selectors `eventDays`, `lastLoggedDay`.

## Decisions worth knowing

- **The timeline moves through campaign days, not import snapshots.** Its milestones are the days the session log
  dates. Import snapshots are a different history (what the documents said at each import) and stay under History.
  The brief asked for snapshot navigation on the timeline; mixing the two would have shown "Day 75" for every
  snapshot. Say so if the snapshot behaviour is wanted there as well.
- **"Last in the session log", not "Last visited".** The documents do not record visits.
- **No "allegiance" row.** The documents establish no territorial allegiance for places.
- **Uchkeken stays fire-scarred** in terrain, vignette and panel; the Silver Mere stays fens (no harbour).

## Artwork

The terrain is still the procedural painting from milestone 2B. It is **not** a painted illustration and does not
match the approved reference's richness. Reaching that needs supplied artwork; the slots and a full specification
are in `docs/ART_ASSETS.md` (world base map, per-place vignettes, per-place panel scenes). No image assets exist yet.

## Verification (this milestone)

Automated: 159 tests pass (`tests/shell.test.ts` added); `tsc --noEmit` clean; production build succeeds.

In the running app at 1536×864: default view fills the viewport with no margin; selecting a place updates the
sidebar panel without opening the dock; "View Location Details" opens the dock; Locations / Factions / Routes
indexes; Exploration ↔ Strategic (7 sigils, banners); hero selection; timeline first / previous / latest and its
captions; saved views add and remove; search; layers panel (17 rows); marker drag survived a reload and was reset;
"Sync from disk" reported no changes; all seven book pages rendered with data; fresh load produced no console
errors. At 375×812: no horizontal overflow, map and timeline usable.

Not verified: other browsers; real touch gestures (pinch zoom is not implemented); frame rate; the Markdown
download itself; behaviour with real image assets in the slots.

## Remaining work

1. Supply artwork per `docs/ART_ASSETS.md`; optionally the layered painted-terrain extension described there.
2. Geometry editing for proposed regions and a distinct "move the label / illustration" action (brief §36). Today:
   place markers and proposed landmarks can be dragged; outlines are fixed.
3. Recording the DM's accept / reject decision per proposal (brief §37); export still has the checkboxes only.
4. Pinch zoom and a bottom-sheet dock on phones; fullscreen control.
5. Deeper page design: quest objectives and clues as structured fields, NPC profile pages, cross-links between pages.
6. Painting off the main thread and caching (carried over from 2B).
---

# Milestone 2D — geographical reference package for regional artwork

Goal: prepare everything an external image generator needs to paint the terrain of one region, without changing
the site's design. No artwork was generated.

**Branch note:** `Third-` was created from `main` (milestone 1). It was fast-forwarded to `feature/fantasy-atlas`
(commit "From Photo") with the user's approval so that it contains milestones 2-2C. Nothing was committed.

**Added**
- `src/atlas/regions.ts` — registry of illustrated regions (bounds, 5 px per world unit, feather). Single source of
  truth for the guides and for placing the finished painting. First entry: `uchkeken-region`, x 80..920, y 290..850.
- `src/atlas/regionArt.ts` + a few lines in `BaseMap.tsx` — probes `/atlas-art/regions/<id>.{webp,png,jpg}` and
  draws a supplied painting over the procedural terrain at its world bounds, edges feathered. With no file present
  the atlas renders exactly as before.
- `scripts/regionGuide.ts` (pure builders) and `scripts/art-guides.ts` (`npm run art:guides`) — derive the package
  from the gazetteer, `geography.ts`, `terrain.ts` and the terrain fields. Rasterised with headless Edge/Chrome.
- `artwork-guides/uchkeken-region/` — `geography-guide.png`, `artwork-guide.png` (both 4200 x 2800),
  `region-manifest.json`.
- `docs/REGIONAL_ART_BRIEF.md` — the brief for the artist / image model, integration and expansion rules,
  limitations.
- `tests/regions.test.ts` — registry sanity, exact world<->pixel mapping, and that the committed manifest still
  matches the geography data (fails when the guides are stale).

**Findings**
- No marker had been moved by the player (the stored user layer has no `markerOverrides`), so the guides use the
  gazetteer's provisional positions. `--user-layer` applies moves; the app has no export button for the layer yet.
- 14 of the 17 proposed additions fall inside the region. Painting them makes them permanent in the image.

**Verification:** 165 tests pass, `tsc --noEmit` clean. The app was reloaded with the slot code in place and no
region file: terrain unchanged. Not verified: the slot with a real painting, and the feathered seam between two
regions.

**Next:** generate the painting per the brief and place it at `public/atlas-art/regions/uchkeken-region.webp`;
check alignment against `geography-guide.png`; then define the neighbouring regions (40-unit overlap).
