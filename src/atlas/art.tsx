/**
 * Reusable cartographic symbols (SVG). Presentation only: they receive plain values and own no campaign data.
 *
 *  Cartography (system 2):  RouteLayer, PlaceIcon, ProposedIcon
 *  Overlays    (system 3):  HeroToken, Banner, SilenceSigil
 *  Chrome:                  CompassRose, AtlasFrame
 *
 * Each overlay family has its own silhouette so they can be told apart without colour:
 *   places = small inked pictograms · heroes = round framed medallions · factions = pennants on poles
 *   silences = eight-pointed star sigils · reports = wax seals · proposed additions = dotted ring + leaf
 */
import { memo } from 'react';
import type { GeoKind, Point, SilenceState } from '../domain/types';
import { locationId } from '../campaign/gazetteer';
import type { AtlasFeature, FeatureType, XY } from './geography';
import { bannerDevice, monogram, routePath } from './glyphs';
import { ROUTES, type TerrainType } from './terrain';

interface RouteProps {
  /** location id -> effective position. */
  positions: Record<string, Point>;
  /** Proposed roads to ink (already filtered by the "proposed additions" layer). */
  roads: AtlasFeature[];
}

/** Routes, inked in world space inside the map's transformed <g>. Stated routes join their markers; proposed roads use their own line. */
export const RouteLayer = memo(function RouteLayer({ positions, roads }: RouteProps) {
  return (
    <g className="routes" aria-hidden="true">
      {roads.map((r) => (
        <path key={r.id} className="route proposed-road" d={routePath(r.id, (r.shape as { points: XY[] }).points.map(([x, y]) => ({ x, y })))} />
      ))}
      {ROUTES.map((r) => {
        const pts = r.stops.map((s) => positions[locationId(s)]);
        if (pts.some((p) => !p)) return null;
        const d = routePath(r.id, pts);
        return (
          <g key={r.id}>
            <path className="route-casing" d={d} />
            <path className={`route ${r.kind}`} d={d} />
          </g>
        );
      })}
    </g>
  );
});

/** Inked place symbol, drawn in screen space around (0,0). */
export function PlaceIcon({ kind, terrain, size = 1 }: { kind: GeoKind; terrain?: TerrainType; size?: number }) {
  let body;
  if (terrain === 'mountain') body = <><path className="fillp" d="M-8 6 L0 -9 L8 6 Z" /><path d="M0 -9 L2 -1 L0 6" /></>;
  else if (terrain === 'forest') body = <><path d="M0 8 V2" /><path className="fillp" d="M-6 2 C-9 -4 -4 -10 0 -8 C4 -11 9 -4 6 2 Z" /></>;
  else if (terrain === 'ice') body = <path className="fillp" d="M-7 6 L-3 -6 L0 0 L3 -8 L7 6 Z" />;
  else if (terrain === 'fen' || kind === 'water') body = <><circle className="fillp" r="7" /><path d="M-5 -1 q1.7 -2.4 3.4 0 t3.4 0 t3.4 0 M-4 3 q1.4 -2 2.8 0 t2.8 0 t2.8 0" /></>;
  else if (kind === 'settlement') body = <><path className="fillp" d="M-7 7 V-2 H-5 V-5 H-3 V-2 H-1 V-8 H1 V-2 H3 V-5 H5 V-2 H7 V7 Z" /><path d="M-1.5 7 V3 Q0 1 1.5 3 V7" /></>;
  else if (kind === 'route') body = <><rect className="fillp" x="-8" y="-4" width="16" height="8" rx="1" /><path d="M-5 0 H5 M-5 -2 V2 M0 -2 V2 M5 -2 V2" /></>;
  else if (kind === 'region') body = <><circle className="fillp" r="3.2" /><circle r="6.5" strokeDasharray="1 3" /></>;
  else body = <><path className="fillp" d="M0 -8 L5.5 0 L0 8 L-5.5 0 Z" /><path d="M0 -3 V3 M-2 0 H2" /></>;
  return <g className="place-icon" transform={`scale(${size})`}>{body}</g>;
}

/** Symbol for a proposed point feature: a small pictogram inside a dotted ring with a leaf, so it never reads as canon. */
export function ProposedIcon({ type }: { type: FeatureType }) {
  let body;
  if (type === 'settlement') body = <path className="fillp" d="M-4.5 4 V-1 L0 -5 L4.5 -1 V4 Z M-1 4 V1 H1 V4" />;
  else if (type === 'ruin') body = <path className="fillp" d="M-4 4 V-3 L-2 -1.5 L-0.5 -5 L1 -2 L3 -3.5 V1 L4 4 Z" />;
  else if (type === 'bridge') body = <path d="M-6 3 V0 Q0 -6 6 0 V3 M-6 0 H6 M-2.5 3 V1.5 Q0 -1 2.5 1.5 V3" />;
  else body = <path className="fillp" d="M-4.5 4 V-2 Q-3.5 -4 -2.5 -2 V4 Z M-1 4 V-4 Q0 -6 1 -4 V4 Z M2.5 4 V-1 Q3.5 -3 4.5 -1 V4 Z" />;
  return (
    <g className="proposed-icon">
      <circle className="ring" r="9.5" />
      {body}
      <path className="leaf" d="M7 -11 q5 -1 5 4 q-5 1 -5 -4 Z" />
    </g>
  );
}

/** Mystical sigil for one of the seven silences: an eight-pointed star whose treatment shows its recorded state. */
export function SilenceSigil({ state, r }: { state: SilenceState; r: number }) {
  const star = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    const rad = i % 2 === 0 ? r : r * 0.52;
    return `${(Math.sin(a) * rad).toFixed(1)},${(-Math.cos(a) * rad).toFixed(1)}`;
  }).join(' ');
  return (
    <g className={`sigil ${state}`}>
      {state === 'awake' && <circle className="glow" r={r + 4} />}
      <polygon className="star" points={star} />
      <circle className="eye" r={r * 0.3} />
      {state === 'holding' && <circle className="outer" r={r + 3} />}
      {state === 'dark' && <path className="rift" d={`M${-r * 0.6} ${-r * 0.6} L${r * 0.6} ${r * 0.6}`} />}
    </g>
  );
}

/** Faction pennant. The device is an abstract placeholder: the documents describe no heraldry. */
export function Banner({ id, name, stale, allied }: { id: string; name: string; stale: boolean; allied: boolean }) {
  const d = bannerDevice(id, name);
  return (
    <g className={`banner${stale ? ' stale' : ''}`}>
      <title>{`${name}${stale ? ' — entry may be out of date' : ''}${allied ? ' — entry says “allied”' : ''} (named in the faction’s entry; not a claim of control)`}</title>
      <path className="pole" d="M0 4 V-24" />
      <path d="M0 -24 H15 L11.5 -16.5 L15 -9 H0 Z" fill={d.field} />
      {d.division === 1 && <path d="M7.5 -24 H15 L11.5 -16.5 L15 -9 H7.5 Z" fill={d.band} opacity="0.85" />}
      {d.division === 2 && <path d="M0 -16.5 H11.5 L15 -9 H0 Z" fill={d.band} opacity="0.85" />}
      {d.division === 3 && <path d="M0 -24 L7 -16.5 L0 -9" fill="none" stroke={d.band} strokeWidth="2.2" />}
      <path className="edge" d="M0 -24 H15 L11.5 -16.5 L15 -9 H0 Z" />
      <text x="6" y="-13">{stale ? '?' : d.letter}</text>
      {allied && <circle className="laurel" cx="0" cy="-25.5" r="2.4" />}
    </g>
  );
}

/**
 * Hero medallion. Shows an approved portrait when one is supplied; otherwise a monogram.
 * `portraitUrl` is the hook for the future Character Appearance Registry: nothing here invents a likeness.
 */
export function HeroToken({ id, name, lead, selected, portraitUrl }: { id: string; name: string; lead: boolean; selected: boolean; portraitUrl?: string | null }) {
  const r = lead ? 14 : 11.5;
  const clip = `hero-clip-${id.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <g className={`hero-token${lead ? ' lead' : ''}${selected ? ' selected' : ''}`}>
      <path className="stem" d={`M0 ${r + 2} L-4 ${r + 3} L0 ${r + 11} L4 ${r + 3} Z`} />
      <circle className="rim" r={r + 3} />
      <circle className="face" r={r} />
      {portraitUrl ? (
        <>
          <clipPath id={clip}><circle r={r} /></clipPath>
          <image href={portraitUrl} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        </>
      ) : (
        <text y={lead ? 4.6 : 4} style={{ fontSize: lead ? 12.5 : 10.5 }}>{monogram(name)}</text>
      )}
    </g>
  );
}

export function CompassRose() {
  const pts = (n: number, long: number, short: number, offset = 0) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = offset + (i * Math.PI) / n;
      const r = i % 2 === 0 ? long : short;
      return `${(Math.sin(a) * r).toFixed(1)},${(-Math.cos(a) * r).toFixed(1)}`;
    }).join(' ');
  return (
    <svg className="compass-rose" viewBox="-66 -68 132 134" aria-label="Compass: north is up" role="img">
      <circle r="50" className="plate" />
      <circle r="44" className="ring" />
      <circle r="38" className="ring thin" />
      <polygon className="minor" points={pts(8, 34, 7, Math.PI / 8)} />
      <polygon className="diag" points={pts(4, 40, 8, Math.PI / 4)} />
      <polygon className="major" points={pts(4, 52, 9)} />
      <path className="north" d="M0 -52 L9 0 L0 -9 Z" />
      <circle r="3" className="hub" />
      <text y="-55">N</text>
    </svg>
  );
}

/** Ornamental frame fixed to the map viewport. */
export function AtlasFrame() {
  const corner = 'M2 30 V10 Q2 2 10 2 H30 M8 24 V12 Q8 8 12 8 H24 M2 2 l7 7';
  return (
    <div className="atlas-frame" aria-hidden="true">
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <svg key={c} className={`corner ${c}`} viewBox="0 0 32 32"><path d={corner} /></svg>
      ))}
    </div>
  );
}
