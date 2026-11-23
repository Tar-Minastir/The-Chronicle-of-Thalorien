/**
 * Base geography (rendering system 1 of 4): a <canvas> under the SVG layers.
 * It knows nothing about places, labels, heroes or selection, and stays on screen when every
 * cartographic and interactive layer is hidden.
 *
 * ARTWORK SLOT: if a painted base map exists at /atlas-art/world.webp it is drawn in place of the
 * procedural painting, aligned to the same 0..1000 world square, so coordinates, markers and routes
 * are unaffected. Without it, the procedural terrain from fields.ts / paint.ts is used.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Size, Viewport } from '../map/viewport';
import { scaleOf } from '../map/viewport';
import type { AtlasFeature } from './geography';
import { WORLD, buildRaster, drawBase, type AtlasRaster, type BaseLayers } from './paint';
import { loadRegionArt, type RegionArt } from './regionArt';
import { artUrl, useArtwork } from './vignettes';

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
  const [painting, setPainting] = useState<HTMLImageElement | null>(null);
  const [regionArt, setRegionArt] = useState<RegionArt[]>([]);
  const paintedUrl = useArtwork(artUrl.world);
  // Geometry is fixed per feature id, so the id list identifies a painting.
  const key = features.map((f) => f.id).join('|');

  useEffect(() => {
    if (!paintedUrl) {
      setPainting(null);
      return;
    }
    const img = new Image();
    img.onload = () => setPainting(img);
    img.src = paintedUrl;
  }, [paintedUrl]);

  useEffect(() => {
    let alive = true;
    void loadRegionArt().then((list) => alive && list.length && setRegionArt(list));
    return () => {
      alive = false;
    };
  }, []);

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
    const s = scaleOf(viewport, size) * dpr;
    const ox = w / 2 - viewport.cx * s;
    const oy = h / 2 - viewport.cy * s;
    ctx.imageSmoothingQuality = 'high';
    if (painting && layers.terrain) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(painting, ox, oy, WORLD * s, WORLD * s);
    } else if (raster) {
      drawBase(ctx, raster, layers, ox, oy, s, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    // Illustrated regions sit over whatever terrain is beneath them, in the same world space.
    if (layers.terrain) {
      for (const { region, image } of regionArt) {
        const b = region.bounds;
        ctx.drawImage(image, ox + b.x0 * s, oy + b.y0 * s, (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
      }
    }
  }, [raster, painting, regionArt, viewport, size, layers.terrain, layers.forests, layers.mountains, layers.waters]);

  return (
    <>
      <canvas ref={ref} className="base-map" aria-hidden="true" />
      {stage && layers.terrain && !painting && <p className="inking" role="status">{stage}</p>}
    </>
  );
}
