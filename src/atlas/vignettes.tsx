/**
 * Settlement and landmark vignettes, and the artwork slots that can replace them.
 *
 * WHAT THIS IS: small original vector illustrations that stand in for a place on the map and in the
 * sidebar panel, chosen by the place's architectural character. They are artistic interpretation:
 * the documents name these places and say who lives there, but describe almost no architecture.
 *
 * ARTWORK PIPELINE (see docs/ART_ASSETS.md): every vignette, every panel scene and the terrain itself
 * can be replaced by a supplied image without touching coordinates or data. `useArtwork(url)` returns
 * the URL once the file is known to exist under /atlas-art/, and null otherwise, so the app falls back
 * to the vector work when no painting has been supplied.
 */
import { useEffect, useState } from 'react';

export type PlaceArt = 'elven' | 'dwarven' | 'human' | 'ruin' | 'tree' | 'peak' | 'glade' | 'mere' | 'ice';

/**
 * Which vignette a place gets. Keyed by gazetteer slug. Presentation only: changing an entry changes
 * a drawing, never a fact. The comment gives the reason for each choice.
 */
export const PLACE_ART: Record<string, PlaceArt> = {
  'elendrath': 'elven',          // realm of King Larendil and the Moon-Well
  'ithilmar': 'elven',           // Queen Aelindra's chamber, the Hall of Singers
  'greyfold': 'elven',           // woodwardens' watch under Captain Saelith
  'dun-ommar': 'dwarven',        // Haldrik's hall, the Anvil-stair
  'khazad-urbal': 'dwarven',     // hold of the Redseam dwarves
  'kharun': 'peak',              // "under Kharûn's peak"
  'hirnost': 'peak',
  'harrowmere': 'human',         // its north tower and map table
  'aranthal': 'human',           // river wards, the Weavers' Bridge
  'foxhollow': 'human',
  'taur-galen': 'ruin',          // the Green Flame gone out; a cracked lantern on a cold hearth
  'tirn-ostar': 'ruin',          // walls of names
  'heart-of-uchkeken': 'tree',   // the young White Tree
  'uchkeken': 'tree',
  'ennor-luth': 'glade',         // the Singing Glade
  'silver-mere': 'mere',
  'whispering-ice': 'ice',
};

const cache = new Map<string, Promise<boolean>>();

/** Resolve to `url` if an image exists there, else null. One probe per URL per session. */
export function useArtwork(url: string | null): string | null {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(false);
    if (!url || typeof Image === 'undefined') return;
    let alive = true;
    let probe = cache.get(url);
    if (!probe) {
      probe = new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      cache.set(url, probe);
    }
    void probe.then((exists) => alive && setOk(exists));
    return () => {
      alive = false;
    };
  }, [url]);
  return ok ? url : null;
}

export const artUrl = {
  /** Painted base map covering the whole 0..1000 world square. */
  world: '/atlas-art/world.webp',
  place: (slug: string) => `/atlas-art/places/${slug}.webp`,
  panel: (slug: string) => `/atlas-art/panels/${slug}.webp`,
};

/** Map vignette, drawn around (0,0) with its base on y = 0. About 44 units wide. */
export function Vignette({ art }: { art: PlaceArt }) {
  switch (art) {
    case 'elven':
      return (
        <g className="vignette elven">
          <ellipse className="ground" cx="0" cy="1" rx="23" ry="4.5" />
          <path className="stone" d="M-17 0 V-13 L-14.5 -20 L-12 -13 V0 Z M12 0 V-11 L14.5 -17 L17 -11 V0 Z" />
          <path className="stone" d="M-11 0 V-16 H-5 V0 Z M5 0 V-14 H11 V0 Z" />
          <path className="roof" d="M-12 -16 L-8 -27 L-4 -16 Z M4 -14 L8 -24 L12 -14 Z" />
          <path className="stone" d="M-5 0 V-22 H5 V0 Z" />
          <path className="roof" d="M-6.5 -22 L0 -40 L6.5 -22 Z" />
          <path className="ink" d="M-2 0 V-6 Q0 -9.5 2 -6 V0 M0 -18 V-14 M-8 -11 V-7 M8 -10 V-6 M0 -40 V-45" />
          <path className="pennon" d="M0 -45 L5 -43.5 L0 -42 Z" />
        </g>
      );
    case 'dwarven':
      return (
        <g className="vignette dwarven">
          <path className="rock" d="M-25 0 L-17 -17 L-9 -11 L0 -31 L9 -13 L16 -21 L25 0 Z" />
          <path className="rock dark" d="M0 -31 L9 -13 L16 -21 L25 0 H6 Z" />
          <path className="stone" d="M-14 0 V-13 H14 V0 Z" />
          <path className="stone dark" d="M-16 -13 H16 V-16 H12 V-18.5 H8 V-16 H4 V-18.5 H-4 V-16 H-8 V-18.5 H-12 V-16 H-16 Z" />
          <path className="gate" d="M-4.5 0 V-7.5 Q0 -12 4.5 -7.5 V0 Z" />
          <path className="ink" d="M-10 -9 V-5 M10 -9 V-5 M-14 -6 H-7 M7 -6 H14" />
          <path className="fire" d="M-10 -4.5 q1 -2 0 -3 q-1 1 0 3 Z M10 -4.5 q1 -2 0 -3 q-1 1 0 3 Z" />
        </g>
      );
    case 'human':
      return (
        <g className="vignette human">
          <ellipse className="ground" cx="0" cy="1" rx="23" ry="4.5" />
          <path className="stone" d="M-19 0 V-8 H-16.5 V-10 H-14 V-8 H-11 V-10 H-8.5 V-8 H8.5 V-10 H11 V-8 H14 V-10 H16.5 V-8 H19 V0 Z" />
          <path className="stone" d="M-4.5 0 V-21 H4.5 V0 Z" />
          <path className="roof" d="M-6 -21 L0 -31 L6 -21 Z" />
          <path className="timber" d="M-17 -8 V-13 L-12.5 -17 L-8 -13 V-8 Z M8 -8 V-12 L12.5 -16 L17 -12 V-8 Z" />
          <path className="ink" d="M-2 0 V-5 Q0 -8 2 -5 V0 M0 -17 V-13 M0 -31 V-36" />
          <path className="pennon" d="M0 -36 L5 -34.5 L0 -33 Z" />
        </g>
      );
    case 'ruin':
      return (
        <g className="vignette ruin">
          <ellipse className="ground" cx="0" cy="1" rx="22" ry="4.5" />
          <path className="stone" d="M-17 0 V-17 L-14 -19 L-12 -15 V0 Z M-6 0 V-23 L-3 -26 L-1 -21 L1 -24 V0 Z" />
          <path className="stone dark" d="M7 0 V-12 Q11 -19 15 -12 V0 H12.5 V-10 Q11 -13 9.5 -10 V0 Z" />
          <path className="ink" d="M-12 -9 Q-9 -14 -6 -11 M-20 0 H20 M17 -2 l2 -3 M-9 -2 l-1.5 -3" />
          <path className="moss" d="M-17 -6 q3 -1 5 1 M-6 -12 q3 -2 7 0 M7 -4 q2 -1.5 4 0" />
        </g>
      );
    case 'tree':
      return (
        <g className="vignette tree">
          <ellipse className="glow" cx="0" cy="-20" rx="24" ry="21" />
          <ellipse className="ground" cx="0" cy="1" rx="19" ry="4" />
          <path className="trunk" d="M-2.5 0 Q-1.5 -9 -4 -14 M2.5 0 Q1.5 -9 4 -14 M-2.5 0 H2.5" />
          <path className="bough" d="M0 -8 V-30 M0 -14 Q-9 -17 -15 -25 M0 -14 Q9 -17 15 -25 M0 -20 Q-7 -25 -9 -34 M0 -20 Q7 -25 9 -34 M-7 -19 Q-14 -18 -19 -20 M7 -19 Q14 -18 19 -20" />
          <g className="blossom">
            {[[-15, -25], [15, -25], [-9, -34], [9, -34], [-19, -20], [19, -20], [0, -31], [-5, -28], [5, -28], [-12, -30], [12, -30], [-11, -21], [11, -21]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} />)}
          </g>
        </g>
      );
    case 'peak':
      return (
        <g className="vignette peak">
          <path className="rock" d="M-23 0 L-9 -22 L-3 -15 L4 -33 L13 -16 L23 0 Z" />
          <path className="rock dark" d="M4 -33 L13 -16 L23 0 H8 L5 -14 Z" />
          <path className="snow" d="M4 -33 L0 -23 L3 -24.5 L5 -21 L7.5 -24 L9.5 -22.5 Z M-9 -22 L-12 -17 L-9 -18 L-6.5 -18.5 Z" />
        </g>
      );
    case 'glade':
      return (
        <g className="vignette glade">
          <ellipse className="ground" cx="0" cy="1" rx="22" ry="5" />
          <path className="canopy" d="M-21 0 Q-24 -10 -16 -13 Q-14 -21 -6 -17 Q-7 -8 -11 0 Z M21 0 Q24 -10 16 -13 Q14 -21 6 -17 Q7 -8 11 0 Z" />
          <path className="stone" d="M-3 0 V-9 Q0 -13 3 -9 V0 Z" />
          <path className="ink" d="M-11 0 V-6 M11 0 V-6" />
        </g>
      );
    case 'mere':
      return (
        <g className="vignette mere">
          <ellipse className="water" cx="0" cy="-3" rx="21" ry="8" />
          <path className="ink" d="M-13 -4 q2.5 -2.5 5 0 t5 0 t5 0 M-6 0 q2.5 -2.5 5 0 t5 0 t5 0" />
          <path className="reed" d="M-18 -4 V-13 M-15.5 -3 V-15 M-13 -3 V-11 M15 -5 V-14 M17.5 -4 V-11" />
        </g>
      );
    case 'ice':
      return (
        <g className="vignette ice">
          <path className="snow" d="M-22 0 L-13 -16 L-7 -7 L0 -24 L8 -9 L14 -17 L22 0 Z" />
          <path className="ink" d="M0 -24 L1.5 -10 M-13 -16 L-11 -5 M14 -17 L13 -6 M-20 0 H20" />
        </g>
      );
  }
}

/** Sidebar scene (2:1) for the selected place: the same motif, large, in a landscape. */
export function PanelScene({ art }: { art: PlaceArt | null }) {
  return (
    <svg className={`panel-scene ${art ?? 'plain'}`} viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration (artistic interpretation)">
      <defs>
        <linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="sky-a" /><stop offset="1" className="sky-b" /></linearGradient>
        <radialGradient id="ps-light" cx="0.5" cy="0.42" r="0.6"><stop offset="0" stopColor="#fff6d2" stopOpacity="0.75" /><stop offset="1" stopColor="#fff6d2" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="240" height="120" fill="url(#ps-sky)" />
      <path className="far" d="M0 78 L26 52 L44 66 L70 40 L96 68 L120 56 L150 72 L176 46 L204 68 L240 54 V120 H0 Z" />
      <rect width="240" height="120" fill="url(#ps-light)" />
      <path className="mid" d="M0 92 Q40 74 84 86 T170 84 T240 80 V120 H0 Z" />
      <g className="trees">
        {[14, 30, 46, 196, 212, 228, 62, 180].map((x, i) => <path key={i} d={`M${x} ${98 - (i % 3) * 3} q-9 -6 -4 -17 q4 -9 9 0 q5 11 -5 17 Z`} />)}
      </g>
      <path className="near" d="M0 104 Q60 94 120 100 T240 98 V120 H0 Z" />
      {art && <g transform="translate(120 101) scale(1.75)"><Vignette art={art} /></g>}
      <rect className="vignette-shade" width="240" height="120" />
    </svg>
  );
}
