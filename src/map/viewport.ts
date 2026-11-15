/**
 * Viewport math. Pure functions over an abstract world space.
 *
 * World space: 0..WORLD_SIZE on both axes, x east, y south (north is up).
 * It has no scale: the sources state no distances precise enough to fix one.
 */
import type { Bearing, Point } from '../domain/types';

export const WORLD_SIZE = 1000;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 10;

export interface Viewport {
  /** World point at the centre of the screen. */
  cx: number;
  cy: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORT: Viewport = { cx: WORLD_SIZE / 2, cy: WORLD_SIZE / 2, zoom: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screen pixels per world unit. At zoom 1 the whole world fits the smaller screen dimension. */
export function scaleOf(vp: Viewport, size: Size): number {
  return (Math.min(size.width, size.height) / WORLD_SIZE) * vp.zoom;
}

export function worldToScreen(p: Point, vp: Viewport, size: Size): Point {
  const s = scaleOf(vp, size);
  return { x: (p.x - vp.cx) * s + size.width / 2, y: (p.y - vp.cy) * s + size.height / 2 };
}

export function screenToWorld(p: Point, vp: Viewport, size: Size): Point {
  const s = scaleOf(vp, size);
  return { x: (p.x - size.width / 2) / s + vp.cx, y: (p.y - size.height / 2) / s + vp.cy };
}

export function clampViewport(vp: Viewport): Viewport {
  return {
    cx: clamp(vp.cx, 0, WORLD_SIZE),
    cy: clamp(vp.cy, 0, WORLD_SIZE),
    zoom: clamp(vp.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

/** Pan by a screen-space drag delta (content follows the pointer). */
export function panBy(vp: Viewport, size: Size, dxScreen: number, dyScreen: number): Viewport {
  const s = scaleOf(vp, size);
  return clampViewport({ ...vp, cx: vp.cx - dxScreen / s, cy: vp.cy - dyScreen / s });
}

/** Zoom by `factor`, keeping the world point under `anchor` (screen px) fixed. */
export function zoomAt(vp: Viewport, size: Size, anchor: Point, factor: number): Viewport {
  const zoom = clamp(vp.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const before = screenToWorld(anchor, vp, size);
  const next = { ...vp, zoom };
  const after = screenToWorld(anchor, next, size);
  return clampViewport({ zoom, cx: vp.cx + (before.x - after.x), cy: vp.cy + (before.y - after.y) });
}

/** Viewport that shows all the given points with a margin. */
export function fitPoints(points: Point[], size: Size, margin = 0.15): Viewport {
  if (!points.length) return DEFAULT_VIEWPORT;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(Math.max(...xs) - Math.min(...xs), 1);
  const h = Math.max(Math.max(...ys) - Math.min(...ys), 1);
  const base = Math.min(size.width, size.height) / WORLD_SIZE;
  const zoom = Math.min(size.width / (w * (1 + margin * 2)), size.height / (h * (1 + margin * 2))) / base;
  return clampViewport({ cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, zoom });
}

export const clampToWorld = (p: Point): Point => ({ x: clamp(p.x, 0, WORLD_SIZE), y: clamp(p.y, 0, WORLD_SIZE) });

const BEARING_DEG: Record<Bearing, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

/** Compass bearing in degrees (0 = north, clockwise) from `from` to `to`. */
export function bearingDeg(from: Point, to: Point): number {
  const deg = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Does `to` lie in the stated compass direction from `from` (within ±tolerance degrees)? */
export function matchesBearing(from: Point, to: Point, bearing: Bearing, tolerance = 30): boolean {
  const diff = Math.abs(((bearingDeg(from, to) - BEARING_DEG[bearing] + 540) % 360) - 180);
  return diff <= tolerance;
}

/** Minimum zoom at which a level-of-detail tier is shown. */
export const TIER_MIN_ZOOM: Record<0 | 1 | 2, number> = { 0: 0, 1: 1.8, 2: 3.5 };
