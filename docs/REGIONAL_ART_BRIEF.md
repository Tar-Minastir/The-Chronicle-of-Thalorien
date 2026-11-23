# Regional art brief — Uchkeken and the Heartlands

This is the brief for the first painted terrain region of the atlas. It goes to whoever (or whatever image
model) produces the illustration, together with the three files in `artwork-guides/uchkeken-region/`.

| File | What it is |
|---|---|
| `artwork-guides/uchkeken-region/artwork-guide.png` | Unlabelled colour composition. **Give this to the image model** as the structure / composition reference. |
| `artwork-guides/uchkeken-region/geography-guide.png` | The same geography with names, grid, ridgelines, routes and a legend. For people: checking and correcting the result. Do not feed it to the model (it would paint the lettering). |
| `artwork-guides/uchkeken-region/region-manifest.json` | Every coordinate, outline, river course, canon status and source reference, machine-readable. |

All three share one coordinate system and one pixel grid. Regenerate them at any time with `npm run art:guides`
(see "Regenerating and exporting").

## 1. The region

- **World bounds:** x 80 → 920, y 290 → 850 (world units; the whole atlas is 0..1000, x east, y south, north up).
- **Size:** 840 × 560 world units. **Aspect ratio 3:2.** Centre (500, 570).
- **Guide images:** 4200 × 2800 px, exactly **5 px per world unit**.
  `pixel = ((x − 80) × 5, (y − 290) × 5)`; `world = (px ÷ 5 + 80, py ÷ 5 + 290)`.
- **No distance scale.** The campaign documents give no distances precise enough to fix one. Do not add a scale bar.

Why these bounds: Uchkeken's heart is at (520, 640). The rectangle is the smallest 3:2 frame around it that holds
Elendrath in the west, Harrowmere and Dun Ommar on the Ironway, the pass shoulders and the first of the northern
fells in the north, the Anvil Heights in the east and the long hills in the south, while stopping short of the
western sea (x < 64), Kharûn (y 230) and the three distant silences. Nothing was moved to improve the composition.

## 2. What is in it, and how sure it is

Three categories, kept apart in the manifest (`canon` on every entry):

- **Confirmed canon** — the place exists and has this name in the campaign documents; quoted relations between
  places ("the Mask east to Dun Ommar").
- **Atlas interpretation** — every coordinate, outline, extent, river course and ridgeline. The documents fix no
  positions. Each interpreted feature lists the quote(s) it rests on, or says it rests on a name alone.
- **Proposed atlas addition** — invented by the atlas, awaiting the Dungeon Master. Magenta in the geography guide.

### Confirmed places (27 anchors; positions provisional)

Principal anchors, world → pixel:

| Place | World | Pixel | Notes |
|---|---|---|---|
| Uchkeken (region anchor) | 508, 624 | 2140, 1670 | fire-scarred elven wood |
| The heart of Uchkeken (the White Tree) | 520, 640 | 2200, 1750 | white dot in the artwork guide |
| Elendrath (region anchor) | 170, 632 | 450, 1710 | elven realm, western edge of the Silverwood |
| Harrowmere | 400, 470 | 1600, 900 | human town with a north tower |
| Dun Ommar | 720, 470 | 3200, 900 | dwarf-hold; "east" of Harrowmere is stated |
| The Cinder Gorge | 610, 455 | 2650, 825 | narrow gorge on the Ironway; "north of the Toll-stone" is stated |
| Aranthal | 250, 760 | 850, 2350 | human town on the Senn |

Also inside: the Thornwall, the Bough-House, the Moon-Well, Ithilmar, the Silverwood, Greyfold, the Moonroad,
the Grey Step, the Nindor, the Northern Fells (anchor only; the range runs off the north-east corner), the Deep
Anvil, the Ironway, the Toll-stone, Deephold Gate, the Harrow, the Senn, the Sennhold, Elsmere, Foxhollow, the
Willowford. All coordinates are in the manifest under `anchors`.

No marker had been moved by the player when this package was built, so every position is the gazetteer's
provisional one. If markers are moved later, regenerate with `--user-layer` (below).

### Atlas interpretation (drawn shapes of confirmed things)

- **Forests:** Uchkeken wood (fire-scarred), the Silverwood (pale foliage; extent rests on the name only).
- **Heath:** the Harrow. The top edge of the Sarnmoor touches the southern border.
- **High ground:** two shoulders of the pass north of Harrowmere; the south-west end of the northern fells; the long
  hills along the south; the hills west of the Willowford.
- **Waters:** the Senn (north spurs → past Uchkeken's west side → Aranthal → off the south-west corner); the Nindor
  (north-east corner → Grey Step → joins the Senn); a mere beside Harrowmere (name only); the tarn north of the
  Cinder Gorge.

### Proposed additions inside the bounds (14; not canon)

The Alderwilds, Eastmere Forest, the Anvil Heights, the Willowwater, the Eastrun, the Fell Beck, the Hill Brook,
Cairnwater, the Hillway (road), Sennbridge, the Three Sisters, Fallowsteading, and the edges of the Grey
Shoulders and the Southing Wood. Listed under `proposedAdditions`.

**Decision to make before generating:** anything painted into the image cannot be hidden by the website's
"proposed additions" toggle. Either accept that for this region, or remove unwanted proposals in the app first
and regenerate the guides with `--user-layer`.

## 3. Desired appearance

- A richly illustrated medieval-fantasy landscape in the tradition of hand-painted, Tolkien-inspired cartography,
  with the atmosphere of a strategic "war of the ring" campaign map: a living land seen from above.
- **Viewpoint:** slightly elevated, oblique bird's-eye. Relief, trees and buildings may lean "up the page" a little,
  but the **footprint** of every feature stays where the guide puts it. No horizon, no sky, no vanishing point.
- **Forests:** dense and continuous, with visible canopy texture, clearings and soft edges that thin into groves.
- **Mountains:** connected ranges with dramatic relief along the ridgelines, lit consistently.
- **Rivers:** natural, winding, sitting in their valleys; widening downstream.
- **Settlements:** small, distinct architecture at the marked dots (see §5), no larger than the dot's surroundings.
- Subtle ground mist in valleys and over water. Rich terrain colour, painterly light.
- **Light:** from the north-west (upper left), late afternoon, warm. Keep this fixed for every future region.
- Original work only. Do not copy any published game, film or book map.

## 4. Reading the artwork guide

Flat colours mean terrain type, not final colour. Paint over them freely; keep the boundaries.

| Guide colour | Terrain | Paint as |
|---|---|---|
| `#a9b77a` | Open lowland | grassland, meadow, farmed valley floor |
| `#8fa765` | Scattered groves | loose copses thinning into open country. **Texture only**: placement is free |
| `#3f6b3a` | Green forest | dense broadleaf canopy |
| `#7fa39a` | The Silverwood | dense canopy with pale, silver-grey foliage |
| `#6b5a43` | Uchkeken | **burnt and recovering** wood (see §6) |
| `#b59f6a` | Heath and moor | heather, peat, rough grass, few trees |
| `#9c9a6c` | Hills and foothills | rolling hills, lower slopes |
| `#8a8378` | Mountains | connected rocky mountains |
| `#bcb7b0` | High crests | bare rock at the top of a range (no range in this region is snow-capped) |
| blue lines / shapes | Rivers and lakes | water |
| dark line along a range | Ridgeline | the crest of the range runs here |
| dark dot, pale ring | Settlement, site or landmark | see §5 |
| white dot, dark ring | The White Tree | see §6 |

Forest and heath edges are drawn irregular on purpose; the true outline is only known to within about 22 world
units (≈110 px), so follow the shape, not every wiggle. River courses and ridgelines should be followed closely.

## 5. What stands at the dots

The website draws its own markers, labels and settlement vignettes over the painting. In the terrain image, a dot
should become at most a **small, quiet** hint of the place, or simply a clearing:

- Harrowmere, Aranthal, Foxhollow — human: timber and stone, Harrowmere with one tower; Aranthal beside its river.
- Dun Ommar, the Deep Anvil, Deephold Gate — dwarven: gates and stair cut into the foot of the Anvil Heights.
- Ithilmar, Greyfold, the Moon-Well — elven: pale halls among trees; a still pool for the Moon-Well.
- The Cinder Gorge — a narrow dark cleft; a small tarn just north of it.
- The Toll-stone, the Grey Step, the Willowford — a standing stone; a rock step by the Nindor; a river ford.
- The Thornwall — a long band of blackthorn inside Uchkeken's south-west.

Anything beyond those phrases is artistic licence. No heraldry, garrisons, camps or crowds.

## 6. Canon constraints (do not "improve" these)

- **Uchkeken is fire-scarred and recovering.** Charred stumps, dead grey timber, ash-dark ground, burnt hills on its
  north side, young green returning, strongest round the White Tree. It must not read as a lush forest.
- **The White Tree** is a single young white tree among white stones at (520, 640). Small. No glow, no beams.
- No sea, harbour or ships anywhere in this region.
- No borders, territories, armies, banners or battle damage other than Uchkeken's fire.
- Do not add towns, castles, roads, bridges, lakes or ranges that are not in the guide.
- Roads and routes are **not** in the artwork guide and should not be painted: the documents name the Ironway and
  the Moonroad but give no geometry, and the website draws them as live lines. A faint, unobtrusive cart-track
  along those two corridors (coordinates in `recordedRoutes`) is acceptable; nothing more.

## 7. The image must contain none of these

No UI, panels or frames. No labels, lettering, runes or typography. No character portraits. No hero tokens. No
faction banners or heraldry. No timeline. No compass rose. No scale bar. No markers, pins or icons. No border,
vignette, parchment edge or cartouche. The website renders all of these itself, above the terrain.

The painting must run **edge to edge**: its outer 100 px are faded into the neighbouring terrain by the website,
so keep important detail out of that margin and do not darken or frame the edges.

## 8. Deliverable

- **Aspect 3:2**, covering exactly the guide's frame, unrotated, uncropped, north up.
- Preferably 4200 × 2800 px (the guide size). Smaller 3:2 outputs (for example 1536 × 1024) work and are scaled by
  the website; upscale where possible, since the map zooms to several times this.
- WebP (quality ≈ 90), PNG or JPEG, opaque.
- Save as `public/atlas-art/regions/uchkeken-region.webp` (or `.png` / `.jpg`).

### Suggested generation method

1. Use an image model that accepts a structure reference (image-to-image, "composition reference", ControlNet-style
   segmentation or depth conditioning). Supply `artwork-guide.png`, downscaled to the model's 3:2 size.
2. Keep reference strength high enough that rivers, forest masses and ranges stay in place; a text-only prompt will
   not preserve the geography.
3. Prompt from §3, §4 and §6, and put §7 in the negative prompt.
4. **Check the result:** overlay `geography-guide.png` at 50 % opacity in any image editor. Rivers, ridgelines and
   the dots should line up. Regenerate or inpaint what drifted. The manifest's `anchors[].pixel` give exact targets.
5. Review against §6 before installing. Generators tend to paint a green Uchkeken and to invent castles.

## 9. How the painting is integrated

Render order, bottom to top:

1. **Illustrated regional terrain** — canvas (`src/atlas/BaseMap.tsx`). The procedural terrain is drawn first; each
   supplied region painting is drawn over it at its world bounds.
2. **Cartography** — SVG labels, rivers' names, routes.
3. **Interactive overlays** — SVG markers, heroes, banners, sigils, pins.
4. **Fixed application UI.**

- The registry is `src/atlas/regions.ts`. `uchkeken-region` is already registered; `src/atlas/regionArt.ts` probes
  `/atlas-art/regions/uchkeken-region.{webp,png,jpg}` once per session.
- **Until a file exists there, nothing changes**: the procedural terrain is the fallback and is still drawn
  everywhere outside painted regions.
- The image is placed in world coordinates, so zoom, pan, marker selection and dragging, map modes, the historical
  overlay and saved views are unaffected. The Terrain layer toggle hides paintings too. Inside a painted region the
  separate Forests / Mountains / Rivers toggles have no visible effect (the painting is one image).
- A whole-world painting (`public/atlas-art/world.webp`, see `docs/ART_ASSETS.md`) still works; regions draw over it.

## 10. Expanding the world

- **One scale:** every region uses 5 px per world unit, so paintings join without resampling differences.
- **Add a region:** add an entry to `ART_REGIONS` in `src/atlas/regions.ts`, run `npm run art:guides`, generate, drop
  the file in `public/atlas-art/regions/`. No other code changes.
- **Alignment:** all regions live in the one world coordinate system; a region's bounds are its alignment.
- **Seams:** neighbouring regions must **overlap by at least 40 world units** (2 × the 20-unit feather). Each
  painting fades out over its outer 20 units, so across an overlap one is always opaque while the other fades in: a
  cross-fade, never a gap. Later entries in the registry draw on top.
- **Continuity when painting a neighbour:** give the generator the overlapping strip of the finished neighbour as
  fixed context (outpainting), and reuse this brief's light direction, palette and viewpoint.
- **Replacing one region:** overwrite its file. Nothing else is touched.
- **Geography changes:** edit `geography.ts` / the gazetteer as before; `tests/regions.test.ts` then fails until
  the guides are regenerated, which flags that the painting may need a touch-up in the changed area.
- A tile pyramid is deliberately not built. Five or six 4200 × 2800 images are within what a canvas handles; if the
  world outgrows that, tiling can be added behind the same registry.

## 11. Regenerating and exporting

```
npm run art:guides
```

writes the three files to `artwork-guides/uchkeken-region/` inside the project folder. To hand them over, copy
that folder (or just `artwork-guide.png` plus this brief). Requires Microsoft Edge or Chrome to be installed (used
headlessly to rasterise the drawings; set `GUIDE_BROWSER` to its path if it is not found).

To build guides that include markers the player has moved, or proposals they removed or renamed, save the app's
user layer as JSON (`{ "markerOverrides": { "location:harrowmere": { "x": 410, "y": 462 } }, "atlas": { "removed":
[], "edits": {} } }`) and run `npm run art:guides -- --user-layer path/to/layer.json`. Moved places are starred in
the geography guide and flagged `userAdjusted` in the manifest. There is no export button for this in the app yet.

## 12. Limitations and ambiguities

- **Every position is provisional.** The guides are exact about where the atlas puts things, not about where they
  "really" are. A painting bakes in terrain; if a marker is later dragged far from its painted site, the picture
  under it will no longer match.
- The Silverwood, the Harrowmere mere and Elsmere rest on names alone. Elendrath's anchor sits at the wood's
  western edge only because nothing says where in its realm the anchor belongs.
- The Senn's course is interpolation between a ford, "river-folk" and Aranthal's river wards. Where the Nindor
  goes below the Grey Step is a guess; its junction with the Senn at (522, 522) is the atlas's.
- "Burnt hills north" of Uchkeken is recorded, but no hill geometry exists in the data; the brief asks for it in
  words only.
- The Ironway is recorded between the Toll-stone and the Cinder Gorge only. Its anchor at (530, 492) and its
  presumed continuation toward Harrowmere and Dun Ommar are not drawn as a road.
- The northern fells, the Nindor's upper course, the Eastrun, the Willowwater, the Senn's lower course and the
  Sarnmoor are cut by the frame; they continue in future regions.
- Scattered groves are procedural texture, not data.
- Small stair-steps remain on a few forest edges in the guides where a wood meets a grove; they are within the
  stated edge uncertainty.
- The legend of the geography guide covers world x 85–199, y 295–403 (open lowland only).
- Not tested: the integration with a real painting. The slot was exercised only for the "no file" case.
