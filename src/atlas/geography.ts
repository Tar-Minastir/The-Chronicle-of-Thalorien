/**
 * Atlas geography: the physical world drawn under the campaign's places.
 *
 * THREE KINDS OF GEOGRAPHICAL INFORMATION — keep them apart:
 *   confirmed    facts in the four authorized documents. These live in the gazetteer (places) and in
 *                the `basis` quotes below. Never contradicted here.
 *   interpreted  the atlas's interpolation of a confirmed fact into a drawable shape: the documents say
 *                Kharûn has a peak, the atlas draws a massif around it. Extent, course and outline are
 *                NOT canon. Every interpreted feature carries the verbatim quote(s) it rests on, or says
 *                that it rests on a place's name alone (tests verify the quotes against the documents).
 *   proposed     invented by the atlas to make a coherent world: new woods, ranges, rivers, hamlets,
 *                names. NOT canon. They can be hidden, renamed, re-described or removed by the player,
 *                and exported as a Markdown proposal for the Dungeon Master. Nothing promotes them.
 *
 * Rules for editing this file:
 *  - Do not move, rename or contradict gazetteer places. Geometry is laid out around their provisional points.
 *  - Proposed features must not assert events, ownership, armies, politics or hidden lore.
 *  - Geometry is in world units (0..1000, north up); it is authored, not surveyed.
 */
import { GAZETTEER } from '../campaign/gazetteer';

export type CanonStatus = 'confirmed' | 'interpreted' | 'proposed';
export type FeatureType =
  | 'sea' | 'forest' | 'mountains' | 'hills' | 'ice' | 'waste' | 'fen' | 'heath'
  | 'river' | 'lake' | 'road' | 'settlement' | 'ruin' | 'landmark' | 'bridge';
export type AtlasRegion = 'The North' | 'The West' | 'The Heartlands' | 'The East' | 'The South';
export type XY = [number, number];

export type FeatureShape =
  | { kind: 'area'; points: XY[] }
  | { kind: 'line'; points: XY[] }
  | { kind: 'point'; at: XY };

export interface AtlasFeature {
  /** Stable id (`atlas:slug`). User edits and removals key on it. */
  id: string;
  name?: string;
  type: FeatureType;
  status: Exclude<CanonStatus, 'confirmed'>;
  region: AtlasRegion;
  description: string;
  /** Interpreted features: verbatim quote(s) of the confirmed fact being interpreted. Empty = rests on a place name. */
  basis?: string[];
  /** Gazetteer slug of the established place this feature draws (interpreted) or lies near (proposed). */
  near?: string[];
  /** How it sits relative to established geography, in words. */
  relation?: string;
  shape: FeatureShape;
  /** Relief: 0..1 for mountains/hills. Half-width of a range or river in world units. */
  height?: number;
  width?: number;
  snowy?: boolean;
  tone?: 'green' | 'silver' | 'scarred';
  /** Where to letter the name, for named area/line features. */
  label?: { at: XY; angle?: number; tier: 0 | 1 | 2 };
}

/** A roughly round outline, for meres and tarns. Deterministic. */
function blob(cx: number, cy: number, r: number, wobble = 0.22): XY[] {
  const pts: XY[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(i * 2.3 + cx * 0.05) * Math.cos(i * 1.1 + cy * 0.03);
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * 0.78 * k]);
  }
  return pts;
}

const f = (x: AtlasFeature) => x;

export const ATLAS_FEATURES: readonly AtlasFeature[] = [
  // ------------------------------------------------------------------ interpreted: sea and ice
  f({
    id: 'atlas:western-sea', type: 'sea', status: 'interpreted', region: 'The West',
    description: 'A sea to the south-west. The documents say only that it exists where the fens of the Silver Mere end; the coastline is the atlas’s drawing.',
    basis: ['the low fens where rivers meet the sea'], near: ['silver-mere'],
    shape: { kind: 'area', points: [[-80, 520], [14, 580], [50, 650], [26, 735], [64, 805], [40, 872], [72, 926], [54, 1080], [-80, 1080]] },
  }),
  f({
    id: 'atlas:southern-bight', type: 'sea', status: 'interpreted', region: 'The South',
    description: 'A small bight of the same sea south of the Silver Mere, so that the fens lie between two shores.',
    basis: ['the low fens where rivers meet the sea'], near: ['silver-mere'],
    shape: { kind: 'area', points: [[54, 1080], [70, 992], [128, 1006], [200, 1080]] },
  }),
  f({
    id: 'atlas:whispering-ice', type: 'ice', status: 'interpreted', region: 'The North',
    description: 'The glacier of the Whispering Ice, north of Kharûn. Its extent is drawn, not recorded.',
    basis: ['Beneath the glacier lies a hollow cavern', 'the Whispering Ice north of Kharûn'], near: ['whispering-ice'],
    shape: { kind: 'area', points: [[224, 74], [330, 62], [480, 64], [596, 82], [604, 126], [500, 142], [380, 140], [268, 132], [212, 102]] },
  }),
  f({
    id: 'atlas:ashen-waste', type: 'waste', status: 'interpreted', region: 'The North',
    description: 'The Ashen Waste, crossed going north from Kharûn toward the ice.',
    basis: ['north across the Ashen Waste toward the ice'], near: ['ashen-waste'],
    shape: { kind: 'area', points: [[288, 154], [400, 144], [530, 152], [548, 188], [450, 204], [330, 200]] },
  }),
  // ------------------------------------------------------------------ interpreted: high ground
  f({
    id: 'atlas:kharun-massif', type: 'mountains', status: 'interpreted', region: 'The North',
    description: 'The mountain of Kharûn, drawn as a massif. The documents give it a peak; the range around it is interpolation.',
    basis: ["under Kharûn's peak"], near: ['kharun'], height: 1, width: 36, snowy: true,
    shape: { kind: 'line', points: [[300, 256], [352, 236], [405, 228], [458, 240], [512, 266]] },
  }),
  f({
    id: 'atlas:pass-west', type: 'mountains', status: 'interpreted', region: 'The North',
    description: 'Western shoulder of the pass crossed on the way north from Harrowmere. Only the pass itself is recorded.',
    basis: ['The pass; the Ashen Waste'], near: ['kharun', 'harrowmere'], height: 0.55, width: 24,
    shape: { kind: 'line', points: [[318, 322], [384, 331]] },
  }),
  f({
    id: 'atlas:pass-east', type: 'mountains', status: 'interpreted', region: 'The North',
    description: 'Eastern shoulder of the same pass.',
    basis: ['The pass; the Ashen Waste'], near: ['kharun', 'harrowmere'], height: 0.6, width: 26,
    shape: { kind: 'line', points: [[430, 331], [500, 313], [566, 297]] },
  }),
  f({
    id: 'atlas:northern-fells', type: 'mountains', status: 'interpreted', region: 'The East',
    description: 'The high fells of the north-east, beyond the Ironway, where Taur-Galen stands.',
    basis: ['the high fells'], near: ['northern-fells', 'taur-galen'], height: 0.7, width: 40,
    shape: { kind: 'line', points: [[628, 338], [690, 308], [752, 293], [812, 264], [880, 238], [956, 230]] },
  }),
  f({
    id: 'atlas:hirnost', type: 'mountains', status: 'interpreted', region: 'The East',
    description: 'Hirnost, the height climbed from the Three Cairns, with Taur-Galen’s hall on its crown.',
    basis: ['at the Three Cairns climb Hirnost; the hall on its crown'], near: ['hirnost', 'taur-galen'], height: 0.95, width: 17, snowy: true,
    shape: { kind: 'line', points: [[808, 263], [823, 254]] },
  }),
  f({
    id: 'atlas:long-hills', type: 'hills', status: 'interpreted', region: 'The South',
    description: 'The long hills that lie between Uchkeken and Ennor-Lûth.',
    basis: ['beyond the long hills'], near: ['ennor-luth', 'uchkeken'], height: 0.34, width: 34,
    shape: { kind: 'line', points: [[360, 772], [450, 792], [545, 782], [650, 800], [742, 790]] },
  }),
  f({
    id: 'atlas:willow-hills', type: 'hills', status: 'interpreted', region: 'The West',
    description: 'Hill-country west of the Willowford.',
    basis: ['hill-country west of the Willowford'], near: ['willowford'], height: 0.3, width: 30,
    shape: { kind: 'line', points: [[86, 428], [132, 460], [122, 510]] },
  }),
  // ------------------------------------------------------------------ interpreted: woods, moors, fens
  f({
    id: 'atlas:uchkeken-wood', type: 'forest', status: 'interpreted', region: 'The Heartlands', tone: 'scarred',
    description: 'The ancient wood of Uchkeken. Drawn fire-scarred, because the documents speak of burnt stumps and burnt hills; its bounds are the atlas’s.',
    basis: ['hidden elven wood', 'burnt hills north', 'among the burnt stumps beyond the White Tree'], near: ['uchkeken'],
    shape: { kind: 'area', points: [[436, 572], [498, 548], [566, 562], [596, 620], [580, 684], [522, 712], [452, 700], [422, 642]] },
  }),
  f({
    id: 'atlas:silverwood', type: 'forest', status: 'interpreted', region: 'The West', tone: 'silver',
    description: 'The Silverwood. Drawn as a great wood on the strength of its name alone; nothing is recorded of its extent.',
    basis: [], near: ['silverwood', 'elendrath'],
    shape: { kind: 'area', points: [[190, 560], [292, 540], [372, 566], [404, 628], [388, 702], [322, 734], [240, 724], [196, 676], [184, 612]] },
  }),
  f({
    id: 'atlas:the-harrow', type: 'heath', status: 'interpreted', region: 'The East',
    description: 'The Harrow: shepherds’ country with peat. Drawn as open heath.',
    basis: ['Harrow shepherds', 'Harrow peat'], near: ['harrow'],
    shape: { kind: 'area', points: [[580, 560], [650, 548], [700, 585], [690, 640], [620, 650], [575, 610]] },
  }),
  f({
    id: 'atlas:sarnmoor', type: 'heath', status: 'interpreted', region: 'The South',
    description: 'The Sarnmoor, drawn as moorland on the strength of its name.',
    basis: [], near: ['sarnmoor'],
    shape: { kind: 'area', points: [[300, 835], [360, 826], [400, 860], [385, 900], [320, 905], [290, 870]] },
  }),
  f({
    id: 'atlas:calanor-fens', type: 'fen', status: 'interpreted', region: 'The South',
    description: 'The low fens of Calanor around the Silver Mere.',
    basis: ['the low fens where rivers meet the sea'], near: ['silver-mere'],
    shape: { kind: 'area', points: [[78, 905], [140, 890], [202, 915], [216, 965], [150, 996], [86, 986]] },
  }),
  // ------------------------------------------------------------------ interpreted: waters
  f({
    id: 'atlas:nindor', type: 'river', status: 'interpreted', region: 'The East', width: 2.4,
    description: 'The river Nindor. Recorded: one goes north-east up it from the Grey Step to the Three Cairns. Its course below the Grey Step is the atlas’s guess.',
    basis: ['the river Nindor', 'from the Grey Step, NE up the Nindor 4 days'], near: ['nindor', 'grey-step', 'three-cairns'],
    shape: { kind: 'line', points: [[834, 238], [806, 272], [770, 312], [735, 346], [696, 386], [668, 426], [656, 474], [632, 520], [590, 544], [522, 522]] },
  }),
  f({
    id: 'atlas:senn', type: 'river', status: 'interpreted', region: 'The Heartlands', width: 3.2,
    description: 'The Senn. Recorded: river-folk, a ford, and Aranthal’s river wards. That it runs from the northern spurs past Aranthal to the sea is interpolation.',
    basis: ['river-folk of the Senn', 'Senn ford', 'the river wards of Aranthal'], near: ['senn', 'aranthal', 'sennhold'],
    shape: { kind: 'line', points: [[592, 332], [572, 400], [548, 466], [522, 522], [470, 541], [424, 562], [413, 606], [410, 652], [404, 706], [370, 746], [300, 766], [262, 773], [202, 820], [152, 880], [112, 936], [70, 964]] },
  }),
  f({
    id: 'atlas:harrowmere-water', type: 'lake', status: 'interpreted', region: 'The Heartlands',
    description: 'A mere beside Harrowmere, drawn only because of the town’s name.',
    basis: [], near: ['harrowmere'], shape: { kind: 'area', points: blob(374, 462, 13) },
  }),
  f({
    id: 'atlas:gorge-tarn', type: 'lake', status: 'interpreted', region: 'The East',
    description: 'The tarn north of the Cinder Gorge.',
    basis: ['the tarn half a mile north'], near: ['cinder-gorge'], shape: { kind: 'area', points: blob(612, 440, 4.5) },
  }),
  f({
    id: 'atlas:silver-mere-water', type: 'lake', status: 'interpreted', region: 'The South',
    description: 'The Silver Mere itself, drawn as open water among the fens.',
    basis: ['the low fens where rivers meet the sea'], near: ['silver-mere'], shape: { kind: 'area', points: blob(106, 950, 15) },
  }),

  // ================================================================== PROPOSED ATLAS ADDITIONS (not canon)
  f({
    id: 'atlas:frostwall', name: 'The Frostwall', type: 'mountains', status: 'proposed', region: 'The North',
    description: 'A wall of snow-bound peaks closing the far north behind the Whispering Ice. Proposed so that the glacier has high ground to descend from.',
    near: ['whispering-ice'], relation: 'North of the Whispering Ice, along the top edge of the map.', height: 0.95, width: 34, snowy: true,
    shape: { kind: 'line', points: [[36, 72], [170, 52], [330, 34], [520, 36], [700, 58], [860, 52], [984, 72]] },
    label: { at: [760, 34], tier: 1 },
  }),
  f({
    id: 'atlas:grey-shoulders', name: 'The Grey Shoulders', type: 'mountains', status: 'proposed', region: 'The North',
    description: 'A lower western arm of the Kharûn heights, bare grey rock above the tree line.',
    near: ['kharun'], relation: 'Runs west from the Kharûn massif.', height: 0.7, width: 30,
    shape: { kind: 'line', points: [[96, 236], [170, 262], [240, 250], [300, 256]] },
    label: { at: [176, 222], angle: 6, tier: 1 },
  }),
  f({
    id: 'atlas:anvil-heights', name: 'The Anvil Heights', type: 'mountains', status: 'proposed', region: 'The East',
    description: 'Steep heights behind Dun Ommar. Proposed as the rock a dwarf-hold with a thousand-step stair would be cut into.',
    near: ['dun-ommar', 'deephold-gate'], relation: 'East of Dun Ommar, running north to south.', height: 0.7, width: 30,
    shape: { kind: 'line', points: [[792, 398], [828, 462], [844, 540], [814, 614]] },
    label: { at: [886, 486], angle: 78, tier: 1 },
  }),
  f({
    id: 'atlas:alderwilds', name: 'The Alderwilds', type: 'forest', status: 'proposed', region: 'The West', tone: 'green',
    description: 'Wet alder and willow woodland between Harrowmere and the Willowford.',
    near: ['harrowmere', 'willowford'], relation: 'West of Harrowmere, east of the Willowford.',
    shape: { kind: 'area', points: [[236, 372], [300, 356], [346, 392], [338, 440], [280, 462], [232, 430]] },
    label: { at: [288, 408], angle: -8, tier: 1 },
  }),
  f({
    id: 'atlas:eastmere-forest', name: 'Eastmere Forest', type: 'forest', status: 'proposed', region: 'The East', tone: 'green',
    description: 'A broad lowland forest in the south-east, unvisited and unremarked in the record.',
    near: ['harrow', 'deephold-gate'], relation: 'South-east of the Harrow.',
    shape: { kind: 'area', points: [[760, 668], [840, 650], [900, 700], [892, 770], [820, 792], [756, 748]] },
    label: { at: [826, 722], angle: 10, tier: 1 },
  }),
  f({
    id: 'atlas:southing-wood', name: 'The Southing Wood', type: 'forest', status: 'proposed', region: 'The South', tone: 'green',
    description: 'Woodland south of the long hills. Proposed as the country a place called the Singing Glade might lie beside.',
    near: ['ennor-luth'], relation: 'East of Ennor-Lûth, south of the long hills.',
    shape: { kind: 'area', points: [[590, 862], [668, 846], [720, 888], [700, 948], [626, 958], [580, 916]] },
    label: { at: [650, 904], angle: 6, tier: 1 },
  }),
  f({
    id: 'atlas:willowwater', name: 'The Willowwater', type: 'river', status: 'proposed', region: 'The West', width: 2.2,
    description: 'The river crossed at the Willowford. A ford implies a river; its name and course are proposed.',
    near: ['willowford'], relation: 'Flows south from the Grey Shoulders through the Willowford to the western sea.',
    shape: { kind: 'line', points: [[214, 268], [226, 330], [210, 400], [200, 480], [168, 530], [120, 560], [36, 602]] },
    label: { at: [232, 452], angle: 78, tier: 2 },
  }),
  f({
    id: 'atlas:eastrun', name: 'The Eastrun', type: 'river', status: 'proposed', region: 'The East', width: 2.2,
    description: 'A river draining the Anvil Heights southward through Eastmere Forest.',
    near: ['deephold-gate'], relation: 'Rises south of the Anvil Heights and leaves the map to the south.',
    shape: { kind: 'line', points: [[822, 612], [800, 664], [782, 722], [770, 802], [790, 884], [772, 1020]] },
    label: { at: [752, 842], angle: 84, tier: 2 },
  }),
  f({
    id: 'atlas:fell-beck', name: 'The Fell Beck', type: 'river', status: 'proposed', region: 'The East', width: 1.5,
    description: 'A cold stream out of Cairnwater that joins the Nindor.',
    near: ['nindor', 'three-cairns'], relation: 'Tributary of the Nindor from the east.',
    shape: { kind: 'line', points: [[848, 300], [806, 306], [770, 312]] },
  }),
  f({
    id: 'atlas:hill-brook', name: 'The Hill Brook', type: 'river', status: 'proposed', region: 'The South', width: 1.5,
    description: 'A brook off the long hills that joins the Senn above Aranthal.',
    near: ['aranthal'], relation: 'Tributary of the Senn from the south-east.',
    shape: { kind: 'line', points: [[474, 782], [432, 752], [392, 742], [370, 746]] },
  }),
  f({
    id: 'atlas:cairnwater', name: 'Cairnwater', type: 'lake', status: 'proposed', region: 'The East',
    description: 'A tarn under the northern fells.',
    near: ['three-cairns', 'hirnost'], relation: 'East of the Three Cairns.',
    shape: { kind: 'area', points: blob(856, 300, 10) }, label: { at: [868, 318], tier: 2 },
  }),
  f({
    id: 'atlas:hillway', name: 'The Hillway', type: 'road', status: 'proposed', region: 'The South',
    description: 'An old drove-road along the northern foot of the long hills. No record mentions it.',
    near: ['aranthal'], relation: 'From Aranthal east along the long hills toward Fallowsteading.',
    shape: { kind: 'line', points: [[250, 760], [330, 792], [420, 804], [500, 794], [600, 814], [690, 776], [700, 706]] },
  }),
  f({
    id: 'atlas:sennbridge', name: 'Sennbridge', type: 'bridge', status: 'proposed', region: 'The Heartlands',
    description: 'An old stone bridge over the Senn. (The record has a Senn ford; this bridge is an addition, not that ford.)',
    near: ['senn', 'harrowmere'], relation: 'On the Senn south-east of Harrowmere.', shape: { kind: 'point', at: [470, 541] },
  }),
  f({
    id: 'atlas:three-sisters', name: 'The Three Sisters', type: 'landmark', status: 'proposed', region: 'The South',
    description: 'Three standing stones on a crest of the long hills, a waymark for travellers.',
    near: ['ennor-luth'], relation: 'On the long hills, north of Ennor-Lûth.', shape: { kind: 'point', at: [500, 784] },
  }),
  f({
    id: 'atlas:broken-beacon', name: 'The Broken Beacon', type: 'ruin', status: 'proposed', region: 'The West',
    description: 'A fallen beacon-tower on the western shore, long unlit.',
    near: ['elendrath'], relation: 'On the coast south-west of Elendrath.', shape: { kind: 'point', at: [60, 702] },
  }),
  f({
    id: 'atlas:reedhaven', name: 'Reedhaven', type: 'settlement', status: 'proposed', region: 'The South',
    description: 'A fishing and reed-cutting hamlet on the lower Senn, at the edge of the fens.',
    near: ['silver-mere', 'aranthal'], relation: 'On the Senn between Aranthal and the Silver Mere.', shape: { kind: 'point', at: [152, 878] },
  }),
  f({
    id: 'atlas:fallowsteading', name: 'Fallowsteading', type: 'settlement', status: 'proposed', region: 'The East',
    description: 'A farmstead village on the open ground south of the Harrow.',
    near: ['harrow'], relation: 'South of the Harrow, north-west of Eastmere Forest.', shape: { kind: 'point', at: [700, 706] },
  }),
];

/** The player's changes to proposed features. Stored in the user layer; never touches confirmed data. */
export interface AtlasEdits {
  /** Ids of proposed features the player removed (restorable). */
  removed: string[];
  /** Renames and re-descriptions of proposed features. */
  edits: Record<string, { name?: string; description?: string }>;
}

export const emptyAtlasEdits = (): AtlasEdits => ({ removed: [], edits: {} });

/** Features as the player has them: edits applied, removed ones dropped, optionally without any proposed additions. */
export function resolveFeatures(edits: AtlasEdits, showProposed: boolean, all: readonly AtlasFeature[] = ATLAS_FEATURES): AtlasFeature[] {
  const removed = new Set(edits.removed);
  return all
    .filter((x) => x.status !== 'proposed' || (showProposed && !removed.has(x.id)))
    .map((x) => {
      const e = x.status === 'proposed' ? edits.edits[x.id] : undefined;
      return e ? { ...x, name: e.name?.trim() || x.name, description: e.description?.trim() || x.description } : x;
    });
}

const TYPE_HEADING: Record<FeatureType, string> = {
  sea: 'Seas and coasts', forest: 'Forests and woodlands', mountains: 'Mountains', hills: 'Hills', ice: 'Ice', waste: 'Wastes',
  fen: 'Fens and marshes', heath: 'Heaths and moors', river: 'Rivers and streams', lake: 'Lakes and meres', road: 'Roads',
  settlement: 'Minor settlements', ruin: 'Ruins', landmark: 'Landmarks', bridge: 'Bridges',
};
export const typeHeading = (t: FeatureType) => TYPE_HEADING[t];
const REGIONS: AtlasRegion[] = ['The North', 'The West', 'The Heartlands', 'The East', 'The South'];
const placeName = (slug: string) => GAZETTEER.find((g) => g.id === slug)?.name ?? slug;

/**
 * Markdown proposal for the Dungeon Master: the proposed additions as the player currently has them
 * (renamed/re-described; removed ones omitted), by region and feature type, followed by the list of
 * interpretations for information. Pure; the caller decides how to save it.
 */
export function exportProposalsMarkdown(edits: AtlasEdits, date = '', all: readonly AtlasFeature[] = ATLAS_FEATURES): string {
  const features = resolveFeatures(edits, true, all);
  const proposed = features.filter((x) => x.status === 'proposed');
  const out: string[] = [
    '# Proposed atlas additions — The Chronicle of Thalorien',
    '',
    '> **These are proposals, not campaign facts.** Everything below was invented for the player’s world atlas to make',
    '> the map geographically coherent. None of it is established in play. It is offered to the Dungeon Master to accept,',
    '> change or reject. Nothing here describes events, ownership, armies or secrets.',
    '',
    `${proposed.length} proposed feature${proposed.length === 1 ? '' : 's'}${date ? ` · prepared ${date}` : ''}.`,
    '',
  ];
  for (const region of REGIONS) {
    const inRegion = proposed.filter((x) => x.region === region);
    if (!inRegion.length) continue;
    out.push(`## ${region}`, '');
    for (const type of Object.keys(TYPE_HEADING) as FeatureType[]) {
      const list = inRegion.filter((x) => x.type === type);
      if (!list.length) continue;
      out.push(`### ${TYPE_HEADING[type]}`, '');
      for (const x of list) {
        out.push(`- **${x.name ?? '(unnamed)'}** — ${x.description}`);
        if (x.relation) out.push(`  - Where: ${x.relation}`);
        if (x.near?.length) out.push(`  - Near established places: ${x.near.map(placeName).join(', ')}`);
        out.push(`  - Decision: ☐ accept ☐ change ☐ reject  \`${x.id}\``);
      }
      out.push('');
    }
  }
  const interpreted = features.filter((x) => x.status === 'interpreted');
  out.push('## For information: how the atlas drew established geography', '',
    'These are not additions. Each takes something the campaign documents state and gives it a shape on the map.',
    'The shapes (extent, outline, course) are the atlas’s interpretation and are not canon either.', '');
  for (const x of interpreted) {
    const basis = x.basis?.length ? x.basis.map((q) => `“${q}”`).join('; ') : 'the place’s name only';
    out.push(`- ${x.near?.length ? placeName(x.near[0]) : x.id} (${x.type}): ${x.description} Basis: ${basis}.`);
  }
  out.push('');
  return out.join('\n');
}
