/**
 * Campaign profile: the campaign-specific knobs the generic importer engine reads.
 * Extending the importer for new document conventions usually means editing
 * this file (and the gazetteer), not the engine.
 */

/** Leading words ignored when deciding whether two names are the same person. */
export const HONORIFICS = [
  'the', 'old', 'master', 'mistress', 'thane', 'king', 'queen', 'captain', 'mother', 'brother',
  'mage', 'treasurer', 'baron', 'lord', 'lady',
];

/** journal.md: "Attitude scale: Hostile · Wary · Neutral · Friendly · Trusted · Devoted". */
export const ATTITUDE_SCALE = ['Hostile', 'Wary', 'Neutral', 'Friendly', 'Trusted', 'Devoted'];

/** Phrases blanked out before name matching, to avoid known false mentions. */
export const MENTION_MASKS: RegExp[] = [/Deep Bell/g, /Bell's name-day/g];

/** character-sheet.md sections whose list items are inventory entries. */
export const INVENTORY_SECTIONS = [
  'WEAPONS', 'AMMUNITION', 'THROWABLES & COATINGS', 'ARMOR', 'MAGIC ITEMS',
  'CONSUMABLES', 'BOOKS, TOMES & TEXTS', 'GEAR & SUPPLIES', 'WEALTH',
];

/**
 * Fact probes: each scans every block for a labelled value. When one key yields
 * more than one distinct value, the importer reports it (dated -> "superseded",
 * otherwise "conflict") and keeps every claim with its source reference.
 * `value` may be a fixed string, or omitted to use capture group 1.
 */
export interface FactProbe {
  key: string;
  label: string;
  patterns: { re: RegExp; value?: string }[];
}

export const FACT_PROBES: FactProbe[] = [
  {
    key: 'thalorien.riveria-relationship',
    label: 'Thalorien and Riveria: relationship',
    patterns: [
      { re: /Riveria[^.]{0,60}?\bbetrothed\b|\bBetrothed:\s*Riveria/i, value: 'betrothed' },
      { re: /Riveria[^.]{0,40}?\b(?:wife|wed)\b|\bMarried to Riveria/i, value: 'married' },
    ],
  },
  { key: 'thalorien.level', label: 'Thalorien: Ranger level', patterns: [{ re: /(?:Thalorien[^.;]{0,20}?|Level:\s*)Ranger (\d+)/ }] },
  { key: 'bell.level', label: 'Bell Cranell: Fighter level', patterns: [{ re: /Bell(?: Cranell)?[^.;]{0,30}?Fighter (\d+)/ }] },
  { key: 'command.dc', label: 'Command (Fey-Touched): save DC', patterns: [{ re: /Command[^.;)]{0,40}?DC (\d+)/ }] },
  { key: 'natures-veil.uses', label: "Nature's Veil: uses", patterns: [{ re: /Nature's Veil(?: uses)?\s*(?:—|=)\s*(?:Wisdom modifier \()?(\d+)/ }] },
  { key: 'party.rations', label: 'Party rations', patterns: [{ re: /\b[Rr]ations(?: now)?:?\s+(\d+)/ }] },
  { key: 'thalorien.coin', label: 'Coin on hand', patterns: [{ re: /(?:Coin:|Purse|coin now)\s+([\d,]+ gp(?: \d+ sp)?)/ }] },
];
