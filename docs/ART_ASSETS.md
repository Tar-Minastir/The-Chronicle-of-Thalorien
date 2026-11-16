# Artwork assets — specification and integration points

The atlas runs with **no image assets**: terrain is painted procedurally (`src/atlas/paint.ts`), settlements are
vector vignettes (`src/atlas/vignettes.tsx`), and the sidebar scene is a vector landscape. That is a working
fallback, not the intended final look. The approved reference is a painted illustration, and reaching it needs real
artwork. This document says exactly what to supply and where it goes. Supplying a file is all that is needed: no
code, coordinates or campaign data change.

## How the slots work

Put files in `public/atlas-art/`. On load the app probes each URL once (`useArtwork`); if the image exists it is
used, otherwise the fallback is drawn. Missing files are normal and produce no error.

| Slot | Path | Replaces | Used by |
|---|---|---|---|
| World base map | `public/atlas-art/world.webp` | the whole procedural terrain painting | `BaseMap.tsx` |
| Place vignette | `public/atlas-art/places/<slug>.webp` | that place's vector vignette on the map | `MapView.tsx` → `PlaceArtwork` |
| Panel scene | `public/atlas-art/panels/<slug>.webp` | the sidebar illustration for that place | `LocationPreview.tsx` |

`<slug>` is the gazetteer id (`src/campaign/gazetteer.ts`), e.g. `uchkeken`, `dun-ommar`, `taur-galen`.
Hero portraits are **not** an asset slot here: they come through `MapView`'s `portraitFor(characterId)` resolver,
reserved for the Character Appearance Registry.

## 1. World base map — `world.webp`

- **Geometry:** must cover exactly the square world, `0..1000` on both axes, north up, no perspective distortion of
  positions. Pixel `(x/1000·W, y/1000·H)` is world point `(x, y)`. Recommended 4096×4096 (minimum 2048×2048).
- **Must not contain:** place names, labels, markers, routes, banners, portraits, borders. Those are drawn live by
  the cartography and overlay layers and must stay toggleable and movable.
- **Must agree with the geography data.** Export the layout as a guide by painting over a screenshot of the
  procedural map with all overlays hidden (Map Layers → switch off everything except World Geography). Forest
  outlines, ridgelines, river courses, the coast and the fens are defined in `src/atlas/geography.ts`; places sit at
  the gazetteer's provisional points. A slightly oblique, painterly rendering of relief is fine as long as features
  stay where the data puts them.
- **Canon constraints (do not "improve" these):**
  - Uchkeken is a **fire-scarred, recovering** wood: burnt stumps, dead timber, burnt hills to the north, green
    returning around the White Tree. Not a lush forest.
  - The Silver Mere of Calanor is **fens and open water**. No harbour, town or ships.
  - Taur-Galen's Green Flame is **out**: a cold hall on a height, no green glow.
  - No borders, territories, armies or roads other than those in `geography.ts` / `terrain.ts`.
- **Effect on layers:** with a painted base in place, the separate Forests / Mountains / Rivers toggles no longer
  apply (the painting is one image); the Terrain toggle still hides it. To keep those toggles, supply layered files
  instead and extend `BaseMap.tsx` (see "Possible extension").
- **Proposed additions:** if the painting includes the 17 proposed features, hiding or removing proposals will not
  remove them from the image. Either paint only confirmed/interpreted geography, or accept that limitation.

## 2. Place vignettes — `places/<slug>.webp`

- Transparent background, about 272×248 px (drawn at 68×62 screen units, scaled by zoom tier), subject standing on
  the bottom edge, centred. Viewed from a slightly raised angle to match the map.
- Style by culture (`PLACE_ART` in `vignettes.tsx` records the current choice and the reason for each):

| Slug | Kind | What the documents support |
|---|---|---|
| `elendrath`, `ithilmar`, `greyfold` | elven | realm of King Larendil; the Hall of Singers; woodwardens' watch |
| `dun-ommar`, `khazad-urbal` | dwarven | Haldrik's hall, the Anvil-stair of a thousand steps; the Redseam hold |
| `harrowmere`, `aranthal`, `foxhollow` | human | Harrowmere's north tower; Aranthal's river wards and bridge |
| `taur-galen`, `tirn-ostar` | ruin | a cold hearth and cracked lantern; walls of names |
| `heart-of-uchkeken`, `uchkeken` | the young White Tree | white stones, cairns, burnt ground |
| `ennor-luth` | glade | the Singing Glade |
| `kharun`, `hirnost` | peak | "under Kharûn's peak"; a hall on Hirnost's crown |
| `silver-mere`, `whispering-ice` | water / ice | fens; a glacier |

  Architecture beyond those phrases is artistic interpretation. Do not add heraldry, garrisons or inhabitants.

## 3. Panel scenes — `panels/<slug>.webp`

- 2:1, at least 600×300, opaque. An atmospheric view of the place for the sidebar card. Same canon constraints.
- Priority order: `uchkeken`, `dun-ommar`, `elendrath`, `kharun`, `taur-galen`, `harrowmere`, `aranthal`,
  `ennor-luth`, `silver-mere`, `whispering-ice`.

## Licensing and provenance

Use original work made for this project, or assets whose licence permits this use. Do not use the approved
reference screenshot itself, and do not use copyrighted game or film map artwork. If images are AI-generated,
review each against the canon constraints above before adding it: generators will happily paint a lush Uchkeken or
a harbour on the Silver Mere.

## Possible extension: layered painted terrain

To keep independent Forests / Mountains / Waters toggles with painted art, supply `world-ground.webp`,
`world-forests.webp`, `world-mountains.webp`, `world-waters.webp` (same geometry; the last three transparent) and
have `BaseMap.tsx` draw them in the order `drawBase` uses for the procedural bitmaps. This is not implemented.
