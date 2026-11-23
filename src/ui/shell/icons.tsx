/**
 * Engraved-style line icons and ornaments for the application shell. All original vector work;
 * strokes inherit `currentColor` so the same icon serves gold, ivory and ink contexts.
 */
import type { ReactNode } from 'react';

export type IconName =
  | 'compass' | 'scroll' | 'companions' | 'book' | 'hero' | 'codex' | 'rules' | 'history'
  | 'tower' | 'banner' | 'route' | 'search' | 'bookmark' | 'gear' | 'layers' | 'hourglass'
  | 'plus' | 'minus' | 'frame' | 'world' | 'move' | 'status' | 'people' | 'calendar' | 'quest' | 'pin' | 'close'
  | 'first' | 'prev' | 'next' | 'last';

const PATHS: Record<IconName, ReactNode> = {
  compass: <><circle cx="12" cy="12" r="9" /><path d="M12 3.5 L14 10 L20.5 12 L14 14 L12 20.5 L10 14 L3.5 12 L10 10 Z" /><circle cx="12" cy="12" r="1.2" /></>,
  scroll: <><path d="M7 4 H18 Q20 4 20 6 V7 H16" /><path d="M16 4 V18 Q16 20 14 20 H5 Q3 20 3 18 V17 H13 V18 Q13 20 14.5 20" /><path d="M7 4 Q5 4 5 6 V17" /><path d="M8 8 H13 M8 11 H13 M8 14 H11" /></>,
  companions: <><circle cx="8" cy="8" r="2.6" /><circle cx="16" cy="8" r="2.6" /><path d="M2.5 19 Q3 13 8 13 Q11 13 12 16 Q13 13 16 13 Q21 13 21.5 19" /><circle cx="12" cy="6" r="2.2" /></>,
  book: <><path d="M12 6 Q8 3.5 3 4.5 V18.5 Q8 17.5 12 20 Q16 17.5 21 18.5 V4.5 Q16 3.5 12 6 Z" /><path d="M12 6 V20 M6 8.5 H9.5 M6 11.5 H9.5 M14.5 8.5 H18 M14.5 11.5 H18" /></>,
  hero: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20 Q5.5 13 12 13 Q18.5 13 19 20" /><path d="M9 5 L12 2.5 L15 5" /></>,
  codex: <><path d="M5 3.5 H17 Q19 3.5 19 5.5 V20.5 H7 Q5 20.5 5 18.5 Z" /><path d="M5 18.5 Q5 16.5 7 16.5 H19" /><path d="M12 6.5 L13.2 9 L16 9.3 L14 11.2 L14.5 14 L12 12.6 L9.5 14 L10 11.2 L8 9.3 L10.8 9 Z" /></>,
  rules: <><path d="M12 3 V21 M6 21 H18" /><path d="M4 8 H20" /><path d="M6.5 8 L3.5 14 Q6.5 16.5 9.5 14 Z M17.5 8 L14.5 14 Q17.5 16.5 20.5 14 Z" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7 V12 L15.5 14" /><path d="M3.5 8 V4.5 M3.5 8 H7" /></>,
  tower: <><path d="M6 21 V9 H4.5 V5 H7 V7 H10.5 V5 H13.5 V7 H17 V5 H19.5 V9 H18 V21 Z" /><path d="M10.5 21 V16 Q12 13.5 13.5 16 V21 M9 11.5 H10.5 M13.5 11.5 H15" /></>,
  banner: <><path d="M6 3 V21" /><path d="M6 4.5 H19 V15 L15.5 12.5 L12 15 L8.5 12.5 L6 15" /><circle cx="6" cy="2.8" r="1" /></>,
  route: <><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12.5" cy="12" r="1.2" /><path d="M7 17.5 Q11 17 11.6 13 M13.4 11 Q14 7 17 6.3" strokeDasharray="1.2 2.4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15 L20.5 20.5" /></>,
  bookmark: <path d="M6.5 3.5 H17.5 V20.5 L12 16.5 L6.5 20.5 Z" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8 V5.4 M12 18.6 V21.2 M2.8 12 H5.4 M18.6 12 H21.2 M5.5 5.5 L7.3 7.3 M16.7 16.7 L18.5 18.5 M18.5 5.5 L16.7 7.3 M7.3 16.7 L5.5 18.5" /><circle cx="12" cy="12" r="6.6" /></>,
  layers: <><path d="M12 3.5 L21 8 L12 12.5 L3 8 Z" /><path d="M3 12 L12 16.5 L21 12 M3 16 L12 20.5 L21 16" /></>,
  hourglass: <><path d="M6.5 3 H17.5 M6.5 21 H17.5" /><path d="M7.5 3 V6 Q7.5 9.5 12 12 Q16.5 9.5 16.5 6 V3 M7.5 21 V18 Q7.5 14.5 12 12 Q16.5 14.5 16.5 18 V21" /><path d="M10 18.5 Q12 16 14 18.5" /></>,
  plus: <path d="M12 5 V19 M5 12 H19" />,
  minus: <path d="M5 12 H19" />,
  frame: <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />,
  world: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12 H20.5 M12 3.5 Q7 12 12 20.5 Q17 12 12 3.5" /></>,
  move: <path d="M12 3 V21 M3 12 H21 M12 3 L9.5 5.5 M12 3 L14.5 5.5 M12 21 L9.5 18.5 M12 21 L14.5 18.5 M3 12 L5.5 9.5 M3 12 L5.5 14.5 M21 12 L18.5 9.5 M21 12 L18.5 14.5" />,
  status: <><path d="M12 21 V11" /><path d="M12 11 Q6 10 6 4.5 Q11.5 5 12 11 Q12.5 5 18 4.5 Q18 10 12 11" /><path d="M8 21 H16" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20 Q3.5 13.5 9 13.5 Q14.5 13.5 15 20" /><path d="M15.5 5.5 Q18.5 6 18.5 9 Q18.5 11.5 16 12 M17 14 Q20.5 15 21 20" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="15" rx="1.5" /><path d="M4 10 H20 M8 3.5 V7.5 M16 3.5 V7.5 M8 14 H11 M13.5 14 H16 M8 17 H11" /></>,
  quest: <><path d="M12 3 L14.6 9 L21 9.6 L16.2 13.8 L17.7 20 L12 16.6 L6.3 20 L7.8 13.8 L3 9.6 L9.4 9 Z" /></>,
  pin: <><path d="M12 21 Q5.5 13.5 5.5 9.5 A6.5 6.5 0 0 1 18.5 9.5 Q18.5 13.5 12 21 Z" /><circle cx="12" cy="9.5" r="2.3" /></>,
  close: <path d="M6 6 L18 18 M18 6 L6 18" />,
  first: <path d="M12 6 L6 12 L12 18 M19 6 L13 12 L19 18" />,
  prev: <path d="M15 6 L9 12 L15 18" />,
  next: <path d="M9 6 L15 12 L9 18" />,
  last: <path d="M12 6 L18 12 L12 18 M5 6 L11 12 L5 18" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/**
 * The emblem of the Chronicle. Its form follows the chronicle's own description of the first
 * silence's sign: "the Tree whose roots are its crown" — the roots mirror the branches.
 */
export function WhiteTreeEmblem({ size = 96 }: { size?: number }) {
  const limb = (dir: 1 | -1) => (
    <g transform={`scale(${dir} 1)`}>
      <path d="M0 -2 Q3 -12 13 -17 M6 -11 Q13 -11 19 -8 M2 -8 Q8 -20 6 -27 M9 -15 Q17 -20 23 -19 M5 -20 Q11 -26 16 -27" />
      <g className="leaves">
        {[[13, -17], [19, -8], [6, -27], [23, -19], [16, -27], [10, -22], [16, -13], [3, -15]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} q2.6 -2.6 5 0 q-2.4 2.6 -5 0 Z`} transform={`rotate(${-35 + i * 17} ${x} ${y})`} />
        ))}
      </g>
    </g>
  );
  return (
    <svg className="emblem" viewBox="-34 -36 68 72" width={size} height={size * 1.06} aria-hidden="true">
      <circle className="halo" r="31" />
      <g className="crown">{limb(1)}{limb(-1)}<path d="M0 6 V-24 M0 -24 Q-2 -29 0 -33 Q2 -29 0 -24" /></g>
      {/* The roots repeat the crown, inverted: "the Tree whose roots are its crown". */}
      <g className="roots" transform="translate(0 4) scale(0.72 -0.62)">{limb(1)}{limb(-1)}</g>
      <path className="ground" d="M-24 5 Q-12 2.5 0 5 Q12 7.5 24 5" />
    </svg>
  );
}

/** Botanical corner flourish; rotate/mirror with CSS for the other corners. */
export function Flourish({ className = '' }: { className?: string }) {
  return (
    <svg className={`flourish ${className}`} viewBox="0 0 60 60" aria-hidden="true">
      <path d="M3 57 V22 Q3 3 22 3 H57" />
      <path d="M9 50 V26 Q9 9 26 9 H50" />
      <path d="M9 30 Q20 30 22 20 Q24 12 32 12 M22 20 Q30 24 30 32 M14 40 Q22 40 24 34" />
      <path className="leaf" d="M32 12 q5 -3 8 1 q-5 3 -8 -1 Z M30 32 q4 4 1 8 q-4 -4 -1 -8 Z M24 34 q5 0 6 5 q-5 0 -6 -5 Z" />
      <circle cx="3" cy="57" r="1.6" /><circle cx="57" cy="3" r="1.6" />
    </svg>
  );
}

/** Thin gold rule with a centre lozenge. */
export function Divider() {
  return (
    <svg className="divider" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 5 H88 M112 5 H200" /><path d="M94 5 L100 1.5 L106 5 L100 8.5 Z" /><circle cx="88" cy="5" r="1.2" /><circle cx="112" cy="5" r="1.2" />
    </svg>
  );
}
