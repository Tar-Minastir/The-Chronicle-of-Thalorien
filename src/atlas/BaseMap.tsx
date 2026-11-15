/**
 * Base geography (rendering system 1 of 3): a <canvas> under the SVG layers.
 * It knows nothing about places, labels, heroes or selection, and stays on screen when every
 * cartographic and interactive layer is hidden.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Size, Viewport } from '../map/viewport';
import { scaleOf } from '../map/viewport';
import type { AtlasFeature } from './geography';
import { buildRaster, drawBase, type AtlasRaster, type BaseLayers } from './paint';

/** Bitmap side in px for the 1000-unit world. 2048 keeps the painting sharp to about 4× zoom; trees take over beyond. */
export const RASTER_SIZE = 2048;

// Painting takes a second or two, so the result is kept while the player moves between pages.
let cached: { key: string; raster: Promise<AtlasRaster> } | null = null;

interface Props {
  features: AtlasFeature[];
  viewport: Viewport;
  size: Size;
  layers: BaseLayers;
}

export function BaseMap({ features, viewport, size, layers }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [raster, setRaster] = useState<AtlasRaster | null>(null);
  const [stage, setStage] = useState('');
  // Geometry is fixed per feature id, so the id list identifies a painting.
  const key = features.map((f) => f.id).join('|');

  useEffect(() => {
    let alive = true;
    if (cached?.key !== key) {
      cached = { key, raster: buildRaster(features, RASTER_SIZE, (s) => alive && setStage(s)) };
    }
    cached.raster.then(
      (r) => {
        if (!alive) return;
        setRaster(r);
        setStage('');
      },
      () => alive && setStage('The map could not be drawn.'),
    );
    return () => {
      alive = false;
    };
    // `features` is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!raster) {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    const s = scaleOf(viewport, size) * dpr;
    drawBase(ctx, raster, layers, w / 2 - viewport.cx * s, h / 2 - viewport.cy * s, s, w, h);
  }, [raster, viewport, size, layers.terrain, layers.forests, layers.mountains, layers.waters]);

  return (
    <>
      <canvas ref={ref} className="base-map" aria-hidden="true" />
      {stage && layers.terrain && <p className="inking" role="status">{stage}</p>}
    </>
  );
}
