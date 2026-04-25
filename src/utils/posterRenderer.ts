// ---------------------------------------------------------------------------
// Poster canvas renderer
// Layout (inspired by pretty-gpx): 18% title / 60% map / 22% profile
// Hillshading via ArcGIS tiles, Mercator projection, Lobster font
// ---------------------------------------------------------------------------

import { GpxTrack, haversineKm } from './gpxParser';
import { Palette } from './palettes';
import { buildHillshadeRegion, mercatorX, mercatorY } from './hillshading';

export const POSTER_W = 2480;
export const POSTER_H = 3508;

const TITLE_RATIO   = 0.18;
const MAP_RATIO     = 0.60;
// PROFILE_RATIO = 0.22 (implicit)

// ── Utilities ────────────────────────────────────────────────────────────────

function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out = arr.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

function findPeaks(data: number[], minProminence: number, minGap: number): number[] {
  const candidates: number[] = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] <= data[i - 1] || data[i] <= data[i + 1]) continue;
    const half = Math.min(i, data.length - 1 - i, minGap * 3);
    const lMin = Math.min(...data.slice(Math.max(0, i - half), i));
    const rMin = Math.min(...data.slice(i + 1, i + half + 1));
    if (data[i] - Math.max(lMin, rMin) >= minProminence) candidates.push(i);
  }
  // deduplicate: keep one peak per minGap window
  const peaks: number[] = [];
  for (const c of candidates) {
    if (peaks.length === 0 || c - peaks[peaks.length - 1] >= minGap) peaks.push(c);
  }
  return peaks;
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number
) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.75, cy + size * 0.55);
  ctx.lineTo(cx - size * 0.75, cy + size * 0.55);
  ctx.closePath();
  ctx.fill();
}

async function loadFont(spec: string) {
  try { await document.fonts.load(spec); } catch { /* use fallback */ }
}

// ── Title zone ───────────────────────────────────────────────────────────────

async function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  titleH: number,
  palette: Palette
) {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, titleH);

  await loadFont(`italic bold 120px 'Lobster'`);

  let size = Math.round(titleH * 0.30);
  const font = (s: number) => `italic bold ${s}px 'Lobster', cursive`;
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  while (ctx.measureText(title).width > POSTER_W * 0.88 && size > 40) {
    size -= 4;
    ctx.font = font(size);
  }

  ctx.fillStyle = palette.title;
  ctx.fillText(title, POSTER_W / 2, titleH / 2);
}

// ── Map zone ─────────────────────────────────────────────────────────────────

async function drawMap(
  ctx: CanvasRenderingContext2D,
  tracks: GpxTrack[],
  mapY: number,
  mapH: number,
  palette: Palette,
  onProgress: (pct: number) => void
) {
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, mapY, POSTER_W, mapH);

  const allPts = tracks.flatMap((t) => t.points);
  if (allPts.length < 2) return;

  // Mercator bounding box of the track
  const lats = allPts.map((p) => p.lat);
  const lons = allPts.map((p) => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

  const xMin = mercatorX(lonMin), xMax = mercatorX(lonMax);
  const yTop = mercatorY(latMax), yBot = mercatorY(latMin); // yTop < yBot

  const pad = 0.13;
  const xSpan = Math.max(xMax - xMin, 1e-6);
  const ySpan = Math.max(yBot - yTop, 1e-6);

  const xPadded = xSpan * pad, yPadded = ySpan * pad;
  const xMinP = xMin - xPadded, yTopP = yTop - yPadded;
  const xSpanP = xSpan + 2 * xPadded, ySpanP = ySpan + 2 * yPadded;

  const scale = Math.min(POSTER_W / xSpanP, mapH / ySpanP);
  const pixW = xSpanP * scale, pixH = ySpanP * scale;
  const offX = (POSTER_W - pixW) / 2;
  const offY = mapY + (mapH - pixH) / 2;

  const toPixel = (lat: number, lon: number): [number, number] => [
    offX + (mercatorX(lon) - xMinP) * scale,
    offY + (mercatorY(lat) - yTopP) * scale,
  ];

  // ── Hillshade ──
  onProgress(10);
  const hs = await buildHillshadeRegion(
    lonMin - xSpan * pad, lonMax + xSpan * pad,
    latMin - ySpan * pad, latMax + ySpan * pad,
    palette.bg,
    palette.isLight
  );
  onProgress(70);

  if (hs) {
    const hx0 = offX + (hs.xMin - xMinP) * scale;
    const hy0 = offY + (hs.yMin - yTopP) * scale;
    const hx1 = offX + (hs.xMax - xMinP) * scale;
    const hy1 = offY + (hs.yMax - yTopP) * scale;
    ctx.drawImage(hs.canvas, hx0, hy0, hx1 - hx0, hy1 - hy0);
  }

  // ── GPX tracks ──
  const lineW = Math.max(6, Math.round(POSTER_W * 0.0028));
  ctx.strokeStyle = palette.track;
  ctx.lineWidth = lineW;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const track of tracks) {
    const pts = decimate(track.points, 3000);
    if (pts.length < 2) continue;
    ctx.beginPath();
    const [sx, sy] = toPixel(pts[0].lat, pts[0].lon);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = toPixel(pts[i].lat, pts[i].lon);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ── Markers ──
  const markerR = Math.round(POSTER_W * 0.006);
  ctx.fillStyle = palette.title;

  // Start: filled circle
  const [sx, sy] = toPixel(tracks[0].points[0].lat, tracks[0].points[0].lon);
  ctx.beginPath();
  ctx.arc(sx, sy, markerR, 0, Math.PI * 2);
  ctx.fill();

  // End: filled square
  const last = tracks[tracks.length - 1].points;
  const [ex, ey] = toPixel(last[last.length - 1].lat, last[last.length - 1].lon);
  const sq = markerR * 1.5;
  ctx.fillRect(ex - sq / 2, ey - sq / 2, sq, sq);

  onProgress(90);
}

// ── Elevation profile zone ────────────────────────────────────────────────────

function drawProfile(
  ctx: CanvasRenderingContext2D,
  tracks: GpxTrack[],
  profileY: number,
  profileH: number,
  palette: Palette
) {
  ctx.fillStyle = palette.profileBg;
  ctx.fillRect(0, profileY, POSTER_W, profileH);

  const allPts = tracks.flatMap((t) => t.points);
  const hasEle = allPts.some((p) => p.ele !== 0);
  const totalDistKm = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  const ELE_FRACTION = 0.52; // portion of profileH used by the silhouette
  const PAD_H = POSTER_W * 0.06;
  const PAD_TOP = profileH * 0.05;
  const areaW = POSTER_W - 2 * PAD_H;
  const areaH = profileH * ELE_FRACTION;
  const baseY = profileY + PAD_TOP + areaH;

  if (hasEle && allPts.length >= 2) {
    const pts = decimate(allPts, 2000);

    // Cumulative distance
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
    const D = cum[cum.length - 1] || 1;

    const eles = pts.map((p) => p.ele);
    const eMin = Math.min(...eles);
    const eMax = Math.max(...eles);
    const eRange = Math.max(eMax - eMin, 1);

    const toX = (d: number) => PAD_H + (d / D) * areaW;
    const toY = (e: number) => baseY - ((e - eMin) / eRange) * areaH;

    // Silhouette fill
    ctx.fillStyle = palette.profileFill;
    ctx.beginPath();
    ctx.moveTo(toX(0), baseY);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(toX(cum[i]), toY(eles[i]));
    ctx.lineTo(toX(D), baseY);
    ctx.closePath();
    ctx.fill();

    // Mountain peak markers (triangles at local maxima)
    const minProm = eRange * 0.07;
    const minGap = Math.max(10, Math.round(pts.length / 30));
    const markerSz = Math.round(POSTER_W * 0.007);
    ctx.fillStyle = palette.title;
    for (const idx of findPeaks(eles, minProm, minGap)) {
      drawTriangle(ctx, toX(cum[idx]), toY(eles[idx]) - markerSz * 0.4, markerSz);
    }

    // Start dot
    const dotR = Math.round(POSTER_W * 0.005);
    ctx.fillStyle = palette.title;
    ctx.beginPath();
    ctx.arc(toX(0), baseY, dotR, 0, Math.PI * 2);
    ctx.fill();

    // End square
    const endSq = dotR * 1.6;
    ctx.fillRect(toX(D) - endSq / 2, baseY - endSq / 2, endSq, endSq);
  }

  // Stats text
  const statsText = `${totalDistKm.toFixed(2)} km - ${Math.round(totalEleGain)} m D+`;
  let fontSize = Math.round(profileH * 0.18);
  const font = (s: number) => `italic bold ${s}px 'Lobster', cursive`;
  ctx.font = font(fontSize);
  ctx.textAlign = 'center';
  while (ctx.measureText(statsText).width > POSTER_W * 0.88 && fontSize > 20) {
    fontSize -= 4;
    ctx.font = font(fontSize);
  }
  ctx.fillStyle = palette.statsText;
  ctx.textBaseline = 'bottom';
  ctx.fillText(statsText, POSTER_W / 2, profileY + profileH - Math.round(profileH * 0.05));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function renderPoster(
  canvas: HTMLCanvasElement,
  tracks: GpxTrack[],
  title: string,
  palette: Palette,
  onProgress?: (pct: number) => void
): Promise<void> {
  const prog = onProgress ?? (() => {});

  canvas.width = POSTER_W;
  canvas.height = POSTER_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const titleH = Math.round(POSTER_H * TITLE_RATIO);
  const mapH   = Math.round(POSTER_H * MAP_RATIO);
  const profH  = POSTER_H - titleH - mapH;
  const mapY   = titleH;
  const profY  = titleH + mapH;

  // Solid background as instant fallback
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  prog(2);

  await drawTitle(ctx, title || 'Ma trace GPX', titleH, palette);
  prog(5);

  if (tracks.length > 0) {
    await drawMap(ctx, tracks, mapY, mapH, palette, (p) => prog(5 + p * 0.87));
    drawProfile(ctx, tracks, profY, profH, palette);
  }

  prog(100);
}
