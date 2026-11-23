/**
 * Gazetteer: the place names the importer looks for, with PROVISIONAL coordinates.
 *
 * Rules for editing this file:
 *  - An entry only ever appears in the app if its name is found in the imported
 *    documents (otherwise it is reported as `gazetteer-unattested` and hidden).
 *  - Every relation must carry a verbatim `quote` from the authorized documents.
 *    The importer re-verifies each quote on every import and flags any that
 *    is no longer present (`relation-unattested`).
 *  - `at` is a provisional layout point in abstract world units (0..1000, north = up).
 *    The sources establish NO exact positions and NO scale. Points are chosen only
 *    so that they do not contradict the quoted relations (tests/gazetteer.test.ts
 *    enforces this for every 'bearing' relation). Users can drag markers; their
 *    positions are stored separately and never written back here.
 *  - Do not add places, borders, or relations that the documents do not state.
 */
import type { Bearing, GeoKind } from '../domain/types';

export interface GazetteerRelation {
  kind: 'within' | 'bearing' | 'near';
  target: string;
  bearing?: Bearing;
  quote: string;
  certainty: 'stated' | 'inferred';
}

export interface GazetteerEntry {
  /** Slug; the entity id is `location:${id}`. */
  id: string;
  name: string;
  /** Extra spellings to match in text (case-sensitive, whole-name). */
  aliases?: string[];
  /** Names by which the "Seven Silences" status list refers to this place. */
  silenceAliases?: string[];
  kind: GeoKind;
  tier: 0 | 1 | 2;
  parent?: string;
  at: [number, number];
  relations?: GazetteerRelation[];
}

export const GAZETTEER: readonly GazetteerEntry[] = [
  // --- Uchkeken ---
  { id: 'uchkeken', name: 'Uchkeken', kind: 'region', tier: 0, at: [500, 606] },
  {
    id: 'heart-of-uchkeken', name: 'The heart of Uchkeken', aliases: ['heart of Uchkeken'], silenceAliases: ['White Tree of Uchkeken'],
    kind: 'site', tier: 1, parent: 'uchkeken', at: [520, 640],
    relations: [{ kind: 'within', target: 'uchkeken', quote: 'heart of Uchkeken', certainty: 'stated' }],
  },
  {
    id: 'thornwall', name: 'The Thornwall', aliases: ['Thornwall'], kind: 'site', tier: 1, parent: 'uchkeken', at: [498, 662],
    relations: [{ kind: 'within', target: 'uchkeken', quote: 'the Thornwall blossomed white along three leagues', certainty: 'inferred' }],
  },
  {
    id: 'bough-house', name: 'The Bough-House', aliases: ['Bough-House'], kind: 'site', tier: 2, parent: 'uchkeken', at: [532, 652],
    relations: [{ kind: 'bearing', target: 'heart-of-uchkeken', bearing: 'SE', quote: '1.5 miles south-east of the heart', certainty: 'stated' }],
  },
  // --- Elendrath ---
  { id: 'elendrath', name: 'Elendrath', kind: 'region', tier: 0, at: [186, 604] },
  {
    id: 'moon-well', name: 'The Moon-Well', aliases: ['Moon-Well'], silenceAliases: ['Moon-Well'], kind: 'site', tier: 1, parent: 'elendrath', at: [152, 656],
    relations: [
      { kind: 'within', target: 'elendrath', quote: 'a crescent moon in a well (Elendrath)', certainty: 'stated' },
      { kind: 'bearing', target: 'heart-of-uchkeken', bearing: 'W', quote: 'the Moon-Well (still, sleeps well, west)', certainty: 'stated' },
    ],
  },
  {
    id: 'ithilmar', name: 'Ithilmar', kind: 'settlement', tier: 1, parent: 'elendrath', at: [212, 636],
    relations: [{ kind: 'within', target: 'elendrath', quote: "Queen Aelindra's chamber in Ithilmar", certainty: 'inferred' }],
  },
  { id: 'silverwood', name: 'The Silverwood', aliases: ['Silverwood'], kind: 'region', tier: 1, at: [300, 652] },
  { id: 'greyfold', name: 'Greyfold', kind: 'settlement', tier: 1, at: [400, 660] },
  { id: 'moonroad', name: 'The Moonroad', aliases: ['Moonroad'], kind: 'route', tier: 2, at: [285, 606] },
  // --- The three dark silences ---
  {
    id: 'taur-galen', name: 'Taur-Galen', silenceAliases: ['Taur-Galen'], kind: 'site', tier: 0, at: [820, 250],
    relations: [
      { kind: 'bearing', target: 'heart-of-uchkeken', bearing: 'NE', quote: 'north-east, the high fells beyond the Ironway', certainty: 'stated' },
      { kind: 'near', target: 'hirnost', quote: 'at the Three Cairns climb Hirnost; the hall on its crown', certainty: 'stated' },
    ],
  },
  {
    id: 'ennor-luth', name: 'Ennor-Lûth', silenceAliases: ['Ennor-Lûth'], kind: 'site', tier: 0, at: [526, 920],
    relations: [{ kind: 'bearing', target: 'heart-of-uchkeken', bearing: 'S', quote: "south, beyond the long hills, about twelve days' ride", certainty: 'stated' }],
  },
  {
    id: 'silver-mere', name: 'The Silver Mere of Calanor', aliases: ['Silver Mere'], silenceAliases: ['Silver Mere'], kind: 'water', tier: 0, at: [90, 960],
    relations: [{ kind: 'bearing', target: 'heart-of-uchkeken', bearing: 'SW', quote: 'south-west, the low fens where rivers meet the sea; the farthest', certainty: 'stated' }],
  },
  // --- The northern fells / road to Taur-Galen ---
  { id: 'northern-fells', name: 'The Northern Fells', aliases: ['Northern Fells', 'northern fells'], kind: 'region', tier: 1, at: [770, 305] },
  { id: 'grey-step', name: 'The Grey Step', aliases: ['Grey Step'], kind: 'site', tier: 1, at: [690, 381] },
  { id: 'nindor', name: 'The Nindor', aliases: ['Nindor'], kind: 'water', tier: 2, at: [748, 322] },
  {
    id: 'three-cairns', name: 'The Three Cairns', aliases: ['Three Cairns'], kind: 'site', tier: 2, at: [805, 266],
    relations: [{ kind: 'bearing', target: 'grey-step', bearing: 'NE', quote: 'from the Grey Step, NE up the Nindor 4 days', certainty: 'stated' }],
  },
  {
    id: 'hirnost', name: 'Hirnost', kind: 'site', tier: 2, at: [815, 256],
    relations: [{ kind: 'near', target: 'three-cairns', quote: 'at the Three Cairns climb Hirnost', certainty: 'stated' }],
  },
  // --- Harrowmere, Kharûn and the ice ---
  { id: 'harrowmere', name: 'Harrowmere', kind: 'settlement', tier: 0, at: [400, 470] },
  {
    id: 'kharun', name: 'Kharûn', kind: 'site', tier: 0, at: [405, 230],
    relations: [{ kind: 'bearing', target: 'harrowmere', bearing: 'N', quote: 'a small party north to Kharûn', certainty: 'stated' }],
  },
  {
    id: 'khazad-urbal', name: 'Khazad-Ûrbal', kind: 'settlement', tier: 1, parent: 'kharun', at: [400, 236],
    relations: [{ kind: 'within', target: 'kharun', quote: 'Khazad-Ûrbal, under Kharûn', certainty: 'stated' }],
  },
  {
    id: 'hall-of-kings', name: 'The Hall of Kings', aliases: ['Hall of Kings'], kind: 'site', tier: 2, parent: 'kharun', at: [411, 226],
    relations: [{ kind: 'within', target: 'kharun', quote: "the Hall of Kings under Kharûn's peak", certainty: 'stated' }],
  },
  {
    id: 'whispering-ice', name: 'The Whispering Ice', aliases: ['Whispering Ice'], silenceAliases: ['Aria'], kind: 'region', tier: 0, at: [405, 100],
    relations: [{ kind: 'bearing', target: 'kharun', bearing: 'N', quote: 'the Whispering Ice north of Kharûn', certainty: 'stated' }],
  },
  {
    id: 'ashen-waste', name: 'The Ashen Waste', aliases: ['Ashen Waste'], kind: 'region', tier: 1, at: [405, 165],
    relations: [{ kind: 'near', target: 'whispering-ice', quote: 'north across the Ashen Waste toward the ice', certainty: 'stated' }],
  },
  { id: 'teeth', name: 'The Teeth', aliases: ['Teeth'], kind: 'site', tier: 2, at: [440, 108] },
  // --- Dun Ommar and the Ironway ---
  {
    id: 'dun-ommar', name: 'Dun Ommar', kind: 'settlement', tier: 0, at: [720, 470],
    relations: [{ kind: 'bearing', target: 'harrowmere', bearing: 'E', quote: 'the Mask east to Dun Ommar', certainty: 'stated' }],
  },
  {
    id: 'deep-anvil', name: 'The Deep Anvil', aliases: ['Deep Anvil'], silenceAliases: ['Deep Anvil'], kind: 'site', tier: 1, parent: 'dun-ommar', at: [752, 508],
    relations: [{ kind: 'within', target: 'dun-ommar', quote: 'the Deep Anvil of Dun Ommar', certainty: 'stated' }],
  },
  { id: 'ironway', name: 'The Ironway', aliases: ['Ironway'], kind: 'route', tier: 1, at: [530, 492] },
  { id: 'toll-stone', name: 'The Toll-stone', aliases: ['Toll-stone'], kind: 'site', tier: 1, at: [610, 502] },
  {
    id: 'cinder-gorge', name: 'The Cinder Gorge', aliases: ['Cinder Gorge'], kind: 'site', tier: 0, at: [610, 455],
    relations: [{ kind: 'bearing', target: 'toll-stone', bearing: 'N', quote: 'three leagues north of the Toll-stone', certainty: 'stated' }],
  },
  { id: 'deephold-gate', name: 'Deephold Gate', aliases: ['Deephold'], kind: 'site', tier: 2, at: [780, 532] },
  { id: 'harrow', name: 'The Harrow', aliases: ['Harrow'], kind: 'region', tier: 1, at: [630, 592] },
  { id: 'senn', name: 'The Senn', aliases: ['Senn'], kind: 'water', tier: 2, at: [545, 468] },
  // --- The west and south (Session 1) ---
  { id: 'aranthal', name: 'Aranthal', kind: 'settlement', tier: 0, at: [250, 760] },
  { id: 'sennhold', name: 'The Sennhold', aliases: ['Sennhold'], kind: 'site', tier: 2, at: [243, 768] },
  { id: 'elsmere', name: 'Elsmere', kind: 'region', tier: 1, at: [292, 722] },
  { id: 'foxhollow', name: 'Foxhollow', kind: 'settlement', tier: 1, at: [302, 810] },
  { id: 'sarnmoor', name: 'The Sarnmoor', aliases: ['Sarnmoor'], kind: 'region', tier: 1, at: [345, 862] },
  {
    id: 'tirn-ostar', name: 'Tirn Ostar', kind: 'site', tier: 2, parent: 'sarnmoor', at: [350, 868],
    relations: [{ kind: 'within', target: 'sarnmoor', quote: "the Sarnmoor: Tirn Ostar's walls of names", certainty: 'inferred' }],
  },
  { id: 'willowford', name: 'The Willowford', aliases: ['Willowford'], kind: 'site', tier: 2, at: [200, 480] },
];

export const locationId = (slug: string) => `location:${slug}`;
