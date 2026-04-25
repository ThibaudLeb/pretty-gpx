// ---------------------------------------------------------------------------
// Hillshading via ArcGIS World Hillshade tiles (free, no API key, CORS-enabled)
// Blending formula from pretty-gpx: https://github.com/ThomasParistech/pretty-gpx
// Mercator projection for correct tile alignment
// ---------------------------------------------------------------------------

export interface TileRegion {
  /** rendered hillshade canvas (same size as all fetched tiles stitched together) */
  canvas: HTMLCanvasElement;
  /** bounding box in normalized Mercator space [0,1] */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

// ── Mercator helpers ────────────────────────────────────────────────────────

export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

export function mercatorY(lat: number): number {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
}

function lonToTileX(lon: number, z: number): number {
  return mercatorX(lon) * Math.pow(2, z);
}

function latToTileY(lat: number, z: number): number {
  return mercatorY(lat) * Math.pow(2, z);
}

// ── Zoom selection ──────────────────────────────────────────────────────────

function pickZoom(
  lonMin: number, lonMax: number,
  latMin: number, latMax: number,
  maxTiles = 20
): number {
  for (let z = 14; z >= 4; z--) {
    const tx0 = Math.floor(lonToTileX(lonMin, z));
    const tx1 = Math.floor(lonToTileX(lonMax, z));
    const ty0 = Math.floor(latToTileY(latMax, z));
    const ty1 = Math.floor(latToTileY(latMin, z));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= maxTiles) return z;
  }
  return 4;
}

// ── Tile loading ────────────────────────────────────────────────────────────

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ── Hex → RGB ───────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetch hillshade tiles covering the given lat/lon bounds, composite them,
 * apply the pretty-gpx color blending formula, and return a canvas + its
 * normalized Mercator bounding box for correct positioning on the poster.
 *
 * Light mode:  result = hillshade × background   (shadows are darker than bg)
 * Dark  mode:  result = hillshade × (white − bg) + bg  (highlights brighter than bg)
 */
export async function buildHillshadeRegion(
  lonMin: number, lonMax: number,
  latMin: number, latMax: number,
  bgHex: string,
  isLight: boolean
): Promise<TileRegion | null> {
  const TILE_PX = 256;
  const z = pickZoom(lonMin, lonMax, latMin, latMax);
  const pow2z = Math.pow(2, z);

  const txMin = Math.floor(lonToTileX(lonMin, z));
  const txMax = Math.floor(lonToTileX(lonMax, z));
  const tyMin = Math.floor(latToTileY(latMax, z)); // latMax → smallest tile-y (top)
  const tyMax = Math.floor(latToTileY(latMin, z)); // latMin → largest  tile-y (bottom)

  const cols = txMax - txMin + 1;
  const rows = tyMax - tyMin + 1;
  const w = cols * TILE_PX;
  const h = rows * TILE_PX;

  // Composite raw tiles onto an offscreen canvas
  const raw = document.createElement('canvas');
  raw.width = w;
  raw.height = h;
  const rctx = raw.getContext('2d')!;

  // Neutral grey fallback so missing tiles don't leave blank patches
  rctx.fillStyle = isLight ? '#b0b0b0' : '#606060';
  rctx.fillRect(0, 0, w, h);

  const svc = isLight
    ? 'https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile'
    : 'https://server.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile';

  const fetches: Promise<void>[] = [];
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      const px = (tx - txMin) * TILE_PX;
      const py = (ty - tyMin) * TILE_PX;
      fetches.push(
        loadTile(`${svc}/${z}/${ty}/${tx}`)
          .then((img) => rctx.drawImage(img, px, py, TILE_PX, TILE_PX))
          .catch(() => { /* skip failed tile, keep fallback grey */ })
      );
    }
  }

  await Promise.allSettled(fetches);

  // Apply blending formula (operates on grayscale hillshade values)
  const [bgR, bgG, bgB] = hexToRgb(bgHex);
  const id = rctx.getImageData(0, 0, w, h);
  const d = id.data;

  for (let i = 0; i < d.length; i += 4) {
    const hs = d[i] / 255; // hillshade intensity [0 = shadow, 1 = lit]
    let r: number, g: number, b: number;

    if (isLight) {
      // Light bg: lerp(black → bg) — lit faces = bg colour, shadows = darker
      r = Math.round(hs * bgR);
      g = Math.round(hs * bgG);
      b = Math.round(hs * bgB);
    } else {
      // Dark bg: lerp(bg → white) — lit faces = lighter, shadows = bg colour
      r = Math.round(hs * (255 - bgR) + bgR);
      g = Math.round(hs * (255 - bgG) + bgG);
      b = Math.round(hs * (255 - bgB) + bgB);
    }

    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }

  rctx.putImageData(id, 0, 0);

  return {
    canvas: raw,
    xMin: txMin / pow2z,
    xMax: (txMax + 1) / pow2z,
    yMin: tyMin / pow2z,
    yMax: (tyMax + 1) / pow2z,
  };
}
