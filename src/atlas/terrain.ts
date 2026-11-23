/**
 * Illustration data for the atlas: which places get terrain drawings, and which routes are inked.
 *
 * Rules (same spirit as the gazetteer):
 *  - Terrain is drawn ONLY around a place whose character the documents describe. `quote` is the
 *    verbatim basis and is verified against the real documents by tests/atlas.test.ts. An entry
 *    without a quote rests on the place's own name ("the Silverwood") and says so.
 *  - Terrain has no position of its own: it is drawn around the place's (provisional or user-set)
 *    marker and moves with it. Extent, shape and exact siting are artistic, not campaign fact.
 *  - A route is drawn only where the documents state travel or a road between named places.
 *    The line between two markers is schematic; no actual road geometry is known.
 *  - Nothing here may add coasts, borders, roads or settlements the documents do not mention.
 */
export type TerrainType = 'forest' | 'mountain' | 'hills' | 'ice' | 'waste' | 'fen' | 'moor' | 'thorn' | 'gorge' | 'river';

export interface TerrainFeature {
  /** Gazetteer slug. */
  place: string;
  type: TerrainType;
  /** Verbatim basis in the documents; omitted when the basis is the place name itself. */
  quote?: string;
  /** Extent in world units, and number of glyphs. Artistic. */
  radius: number;
  count: number;
  /** For rivers: orient the stroke toward this place (when the documents relate the two). */
  towards?: string;
}

export const TERRAIN: readonly TerrainFeature[] = [
  { place: 'uchkeken', type: 'forest', quote: 'hidden elven wood', radius: 46, count: 46 },
  { place: 'thornwall', type: 'thorn', quote: 'three leagues of blossoming blackthorn', radius: 16, count: 9 },
  { place: 'silverwood', type: 'forest', radius: 34, count: 26 },
  { place: 'kharun', type: 'mountain', quote: "under Kharûn's peak", radius: 30, count: 12 },
  { place: 'hirnost', type: 'mountain', quote: 'climb Hirnost', radius: 16, count: 6 },
  { place: 'northern-fells', type: 'hills', quote: 'the high fells', radius: 44, count: 22 },
  { place: 'whispering-ice', type: 'ice', quote: 'Beneath the glacier lies a hollow cavern', radius: 44, count: 22 },
  { place: 'ashen-waste', type: 'waste', radius: 30, count: 20 },
  { place: 'silver-mere', type: 'fen', quote: 'the low fens where rivers meet the sea', radius: 34, count: 18 },
  { place: 'sarnmoor', type: 'moor', radius: 30, count: 18 },
  { place: 'cinder-gorge', type: 'gorge', quote: 'narrow gorge on the Ironway', radius: 12, count: 1 },
  { place: 'nindor', type: 'river', quote: 'the river Nindor', radius: 60, count: 1, towards: 'three-cairns' },
  { place: 'senn', type: 'river', quote: 'river-folk of the Senn', radius: 36, count: 1 },
];

export interface AtlasRoute {
  id: string;
  label: string;
  /** Gazetteer slugs, in order. */
  stops: string[];
  /** 'travelled' = the chronicle records the journey; 'planned' = directions the hero holds; 'road' = a named road. */
  kind: 'travelled' | 'planned' | 'road';
  quote: string;
}

export const ROUTES: readonly AtlasRoute[] = [
  { id: 'moonroad', label: 'The Moonroad', stops: ['greyfold', 'elendrath'], kind: 'travelled', quote: 'twelve days on the Moonroad' },
  { id: 'ironway-gorge', label: 'The Ironway', stops: ['toll-stone', 'cinder-gorge'], kind: 'road', quote: 'narrow gorge on the Ironway three leagues north of the Toll-stone' },
  { id: 'to-the-ice', label: 'Across the Ashen Waste', stops: ['kharun', 'ashen-waste', 'whispering-ice'], kind: 'travelled', quote: 'north across the Ashen Waste toward the ice' },
  { id: 'to-taur-galen', label: 'Way to Taur-Galen', stops: ['grey-step', 'three-cairns', 'hirnost'], kind: 'planned', quote: 'from the Grey Step, NE up the Nindor 4 days; at the Three Cairns climb Hirnost' },
];

export const terrainOf = (slug: string): TerrainType | undefined => TERRAIN.find((t) => t.place === slug)?.type;
