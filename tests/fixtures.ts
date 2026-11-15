/**
 * Synthetic mini-campaign used by the unit tests. All names are invented for
 * testing; nothing here is campaign content. It mirrors the structural
 * conventions of the real documents (sections, bold leads, SAVE markers).
 */
import type { GazetteerEntry } from '../src/campaign/gazetteer';
import type { FactProbe } from '../src/campaign/profile';
import type { ImportOptions, RawSource } from '../src/importer';

export const SHEET = `# CHARACTER SHEET

Rules edition: 5e
Last updated: **SAVE 3** — Day 40, at Northkeep. Married to Mira (Day 35).

## IDENTITY
- Name: Tavin, son of Orl
- Known as: Greycloak (north); "the Quiet" (river-folk)
- **Betrothed:** Mira Vale, heir of Southmere.

## WEAPONS
- Longbow — +9 — 1d8+4
- **Star-Arrow** — SPENT (Day 12)

## MAGIC ITEMS
- Longbow — rare
- Potion of Healing ×4 · Antitoxin ×2

## OATHS & PROMISES
- To Mira: come home.
- Before the fire: carry the blade — **FULFILLED**.

## COMPANIONS

### Mira Vale — betrothed — Wizard 9
- Heir of Southmere.

### Joss Reed — Fighter 8
- Loyal.
`;

export const JOURNAL = `# JOURNAL OF TAVIN

Last updated: SAVE, Session 2 — dawn of Day 20

## QUESTS

### ACTIVE

#### The Lost Bell (new)
- Find the bell under Northkeep.

#### The Seven Silences
- **Awake:** the first, **the Tree of Eastwood**.
- **Dark:**
  - **Farholt** — cold; a fire gone out.

### COMPLETED
- **The Bridge** (Day 12): held.
- Session 1: The First Road. The Old Mill.

## PEOPLE

### Allies
- **Captain Hale Dorn** — Trusted. Keeps the gate.
- **Old Sella** — Friendly.
- **Brakk** (smith); **Mira Vale** — Devoted.

### Enemies
- **Varn the Red** — SLAIN.

## PLACES
- **Northkeep:** the hall; the stair.
- **The Sunken Chapel:** below the weir.

## SAVE 3 — Days 21-40
**Quests:**
- The Lost Bell: found, not yet rung.
- **The Red Hunt** (contract): two slain.
`;

export const CHRONICLE = `# CAMPAIGN CHRONICLE

## CURRENT STATE
- Session number: 2 (saved, **SAVE 3**)
- Date: **Day 40**; winter.
- Location: **Northkeep**, in the hall. The horses are at Eastwood.

## ESTABLISHED WORLD FACTS
- Farholt lies three leagues north of the Tollgate.
- **The Tree of Eastwood** woke on Day 15.

## NPC REGISTRY
- **Hale Dorn** — gate-captain; scarred — Friendly.
- **Mira Vale** — heir; **betrothed** — Devoted.
- **Sella Brook** — fletcher.
- **Varn the Red** — SLAIN (Day 12).
- **SAVE 3 additions:**
  - **Master Brakk**: smith. **Dessa**: his apprentice.
  - Attitudes: Hale Devoted.

## FACTIONS
- **Varn and his riders** — raiding near the Tollgate.
- **House Vale** — allied; holds Northkeep.

## OPEN THREADS & PROMISES
- ~~Kill Varn~~ — DONE.
- **The bell**: ring it at Northkeep.

## SESSION LOG

### Session 1 — The First Road
- Summary: Tavin reached Northkeep.

### Session 2 — The Hold
- **The bridge** (Days 10–12): held against Varn at the Tollgate.
- **The council:** undated talk at Northkeep.
- Saved at: night of Day 20, Northkeep.
`;

export const RULINGS = `# RULINGS & HOUSE RULES

## CAMPAIGN SETTINGS
- Rest variant: Standard (long rest 8 hours).

## RULINGS LOG
- Session 1 — Climbing ice — Athletics DC 12.
- Session 1 — Milestone — Joss Fighter 7.

### SAVE 3 rulings (Days 21-40)
- **Rations**: one per person per day.
`;

/** Stands in for a private DM file. The marker must never reach any output or store. */
export const SEALED_MARKER = 'ZZ-SEALED-PLOT-TWIST-ZZ';
export const SEALED = `# SEALED DM NOTES\n\n- ${SEALED_MARKER}: the villain is secretly the innkeeper.\n`;

export const ALL: RawSource[] = [
  { fileName: 'character-sheet.md', text: SHEET },
  { fileName: 'journal.md', text: JOURNAL },
  { fileName: 'campaign-chronicle.md', text: CHRONICLE },
  { fileName: 'rulings-and-house-rules.md', text: RULINGS },
];

export const TEST_GAZETTEER: GazetteerEntry[] = [
  { id: 'northkeep', name: 'Northkeep', kind: 'settlement', tier: 0, at: [500, 500] },
  {
    id: 'eastwood', name: 'Eastwood', silenceAliases: ['Tree of Eastwood'], kind: 'region', tier: 0, at: [700, 500],
    relations: [{ kind: 'near', target: 'northkeep', quote: 'a day east of Northkeep', certainty: 'stated' }], // NOT in the documents
  },
  { id: 'tollgate', name: 'The Tollgate', aliases: ['Tollgate'], kind: 'site', tier: 1, at: [300, 400] },
  {
    id: 'farholt', name: 'Farholt', silenceAliases: ['Farholt'], kind: 'site', tier: 2, at: [300, 200],
    relations: [{ kind: 'bearing', target: 'tollgate', bearing: 'N', quote: 'three leagues north of the Tollgate', certainty: 'stated' }],
  },
  { id: 'ghostmere', name: 'Ghostmere', kind: 'water', tier: 0, at: [100, 100] }, // never mentioned
];

export const TEST_PROBES: FactProbe[] = [
  {
    key: 'relationship', label: 'Tavin and Mira',
    patterns: [
      { re: /Mira[^.]{0,40}?\bbetrothed\b|\bBetrothed:\s*Mira/i, value: 'betrothed' },
      { re: /Married to Mira/, value: 'married' },
    ],
  },
  { key: 'joss.level', label: 'Joss level', patterns: [{ re: /Joss(?: Reed)?[^.;]{0,20}?Fighter (\d+)/ }] },
];

export const TEST_OPTIONS: ImportOptions = { gazetteer: TEST_GAZETTEER, probes: TEST_PROBES };
