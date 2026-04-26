// ---------------------------------------------------------------------------
// Pretty GPX — Poster canvas renderer
//
// Design:  ONE unified element — hillshade covers the full 2480×3508 canvas.
//          Title text is overlaid at the top.
//          GPX trace is in the middle.
//          Elevation profile silhouette emerges from the bottom, blending
//          into the map zone (no separate coloured bands).
//
// Profile: contour-lines style — solid fill + stacked shifted curves above it
// Multi-trace: tipi markers + city labels at each stage endpoint
// ---------------------------------------------------------------------------

import { GpxTrack, haversineKm } from './gpxParser';
import { Palette, FontDef } from './palettes';
import {
  buildHillshadeRegion,
  mercatorX, mercatorY,
  normToLat, normToLon,
} from './hillshading';

export const POSTER_W = 2480;
export const POSTER_H = 3508;

// ── Layout fractions (of poster height/width) ────────────────────────────────
const TITLE_Y      = 0.085;  // centre of title text
const TRACK_CY     = 0.43;   // centre of track bounding box
const TRACK_VFILL  = 0.54;   // max fraction of height for the track
const TRACK_HFILL  = 0.74;   // max fraction of width for the track
const PROFILE_FRAC = 0.26;   // profile silhouette covers bottom 26 %

// ── Helpers ─────────────────────────────────────────────────────────────────

function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out = arr.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

async function loadFont(spec: string) {
  try { await document.fonts.load(spec); } catch { /* fallback ok */ }
}

function buildFontString(font: FontDef, size: number) {
  return `${font.style} ${size}px ${font.family}`;
}

/** Extract arrival city: "De X à Y" → "Y", "X - Y" → "Y", "X to Y" → "Y".
 *  Falls back to the full track name if no pattern matches. */
function extractArrivalCity(name: string): string {
  const patterns = [/\bà\s+(.+)$/iu, /\bto\s+(.+)$/iu, /\s[-–]\s+(.+)$/u];
  for (const re of patterns) {
    const m = name.match(re);
    if (m) return m[1].trim();
  }
  return name.trim();
}

/** Extract departure city: "De X à Y" → "X". Returns null if pattern not found. */
function extractDepartureCity(name: string): string | null {
  const m = name.match(/^De\s+(.+?)\s+[àa]\s+/iu);
  return m ? m[1].trim() : null;
}

// ── Drawing: tipi icon ───────────────────────────────────────────────────────

function drawTipi(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Body triangle
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.72, cy + size * 0.48);
  ctx.lineTo(cx - size * 0.72, cy + size * 0.48);
  ctx.closePath();
  ctx.fill();

  // Two poles sticking out above apex
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.14, cy - size * 0.82);
  ctx.lineTo(cx - size * 0.38, cy - size * 1.32);
  ctx.moveTo(cx + size * 0.14, cy - size * 0.82);
  ctx.lineTo(cx + size * 0.38, cy - size * 1.32);
  ctx.stroke();

  ctx.restore();
}

// ── Drawing: find elevation profile peaks ───────────────────────────────────

function findPeaks(data: number[], minProm: number, minGap: number): number[] {
  const cands: number[] = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] <= data[i - 1] || data[i] <= data[i + 1]) continue;
    const w = Math.min(i, data.length - 1 - i, minGap * 3);
    const lMin = Math.min(...data.slice(Math.max(0, i - w), i));
    const rMin = Math.min(...data.slice(i + 1, i + w + 1));
    if (data[i] - Math.max(lMin, rMin) >= minProm) cands.push(i);
  }
  const out: number[] = [];
  for (const c of cands) {
    if (out.length === 0 || c - out[out.length - 1] >= minGap) out.push(c);
  }
  return out;
}

// ── Drawing: small mountain triangle ────────────────────────────────────────

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.72, cy + size * 0.52);
  ctx.lineTo(cx - size * 0.72, cy + size * 0.52);
  ctx.closePath();
  ctx.fill();
}

// ── Map label (city name) ────────────────────────────────────────────────────

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string, fontSize: number
) {
  ctx.save();
  ctx.font = `bold ${fontSize}px 'Lobster', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  // Shadow for readability on any background
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = fontSize * 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ── Core render ──────────────────────────────────────────────────────────────

export async function renderPoster(
  canvas: HTMLCanvasElement,
  tracks: GpxTrack[],
  title: string,
  palette: Palette,
  font: FontDef,
  onProgress?: (pct: number) => void
): Promise<void> {
  const prog = onProgress ?? (() => {});

  canvas.width  = POSTER_W;
  canvas.height = POSTER_H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // ── 1. Solid background fallback ──
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  prog(2);

  if (tracks.length === 0) {
    // Draw title only
    await drawTitle(ctx, title || 'Pretty GPX', palette, font);
    prog(100);
    return;
  }

  // ── 2. Compute Mercator layout ──
  const allPts = tracks.flatMap(t => t.points);
  const lats = allPts.map(p => p.lat);
  const lons = allPts.map(p => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

  const xMin = mercatorX(lonMin), xMax = mercatorX(lonMax);
  const yTop = mercatorY(latMax), yBot = mercatorY(latMin); // yTop < yBot

  const xSpan = Math.max(xMax - xMin, 1e-6);
  const ySpan = Math.max(yBot - yTop, 1e-6);

  const scale = Math.min(
    (POSTER_W * TRACK_HFILL) / xSpan,
    (POSTER_H * TRACK_VFILL) / ySpan
  );

  const xMid = (xMin + xMax) / 2;
  const yMid = (yTop + yBot) / 2;

  // Canvas pixel where the track centre sits
  const pxCentre = POSTER_W / 2;
  const pyCentre = POSTER_H * TRACK_CY;

  // Mercator origin of the canvas top-left
  const xOrigin = xMid - pxCentre / scale;
  const yOrigin = yMid - pyCentre / scale;

  function toPixel(lat: number, lon: number): [number, number] {
    return [
      (mercatorX(lon) - xOrigin) * scale,
      (mercatorY(lat) - yOrigin) * scale,
    ];
  }

  // ── 3. Full-canvas hillshade ──
  prog(5);
  const lonLeft   = normToLon(xOrigin);
  const lonRight  = normToLon(xOrigin + POSTER_W / scale);
  const latTop    = normToLat(yOrigin);
  const latBottom = normToLat(yOrigin + POSTER_H / scale);

  const hs = await buildHillshadeRegion(
    lonLeft, lonRight, latBottom, latTop,
    palette.bg, palette.isLight
  );
  prog(65);

  if (hs) {
    const hx0 = (hs.xMin - xOrigin) * scale;
    const hy0 = (hs.yMin - yOrigin) * scale;
    const hw  = (hs.xMax - hs.xMin) * scale;
    const hh  = (hs.yMax - hs.yMin) * scale;
    ctx.drawImage(hs.canvas, hx0, hy0, hw, hh);
  }

  // ── 4. GPX traces ──
  const lineW = Math.max(14, Math.round(POSTER_W * 0.0095)); // ~2mm at A4 300dpi
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

  // ── 5. Map markers ──
  const markerR   = Math.round(POSTER_W * 0.007);
  const tipiSize  = Math.round(POSTER_W * 0.014);
  const labelSize = Math.round(POSTER_W * 0.018);
  const isMulti   = tracks.length > 1;

  // Start: filled circle + departure label (multi-trace)
  const [sx0, sy0] = toPixel(tracks[0].points[0].lat, tracks[0].points[0].lon);
  ctx.fillStyle = palette.title;
  ctx.beginPath();
  ctx.arc(sx0, sy0, markerR, 0, Math.PI * 2);
  ctx.fill();

  if (isMulti) {
    // Departure label for first track
    const depart = extractDepartureCity(tracks[0].name);
    if (depart) drawLabel(ctx, depart, sx0, sy0 - markerR * 2.2, palette.title, labelSize);

    // Tipi + arrival label at end of every track (including last)
    for (let t = 0; t < tracks.length; t++) {
      const endPt = tracks[t].points[tracks[t].points.length - 1];
      const [ex, ey] = toPixel(endPt.lat, endPt.lon);
      const city = extractArrivalCity(tracks[t].name); // always returns a string now
      const isLast = t === tracks.length - 1;

      if (isLast) {
        // Final destination: filled square
        const sq = markerR * 1.6;
        ctx.fillStyle = palette.title;
        ctx.fillRect(ex - sq / 2, ey - sq / 2, sq, sq);
      } else {
        // Intermediate stage end: tipi
        drawTipi(ctx, ex, ey - tipiSize * 0.5, tipiSize, palette.title);
      }
      drawLabel(ctx, city, ex, ey - tipiSize * 1.6, palette.title, labelSize);
    }
  } else {
    // Single trace: end square only
    const last = tracks[0].points[tracks[0].points.length - 1];
    const [ex, ey] = toPixel(last.lat, last.lon);
    const sq = markerR * 1.6;
    ctx.fillStyle = palette.title;
    ctx.fillRect(ex - sq / 2, ey - sq / 2, sq, sq);
  }

  prog(75);

  // ── 6. Elevation profile (from bottom, overlaid on hillshade) ──
  drawProfile(ctx, tracks, palette, font, tipiSize, isMulti);

  // ── 7. Title text (last, always on top) ──
  await drawTitle(ctx, title || 'Pretty GPX', palette, font);

  prog(100);
}

// ── Title ────────────────────────────────────────────────────────────────────

async function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  palette: Palette,
  font: FontDef
) {
  await loadFont(`${font.style} 120px ${font.family}`);

  const cy = POSTER_H * TITLE_Y;
  let size = Math.round(POSTER_H * TITLE_Y * 0.65);
  ctx.font = buildFontString(font, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  while (ctx.measureText(title).width > POSTER_W * 0.90 && size > 40) {
    size -= 4;
    ctx.font = buildFontString(font, size);
  }

  // Subtle shadow for readability on varied backgrounds
  ctx.save();
  ctx.shadowColor = palette.isLight ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = palette.title;
  ctx.fillText(title, POSTER_W / 2, cy);
  ctx.restore();
}

// ── Elevation profile ────────────────────────────────────────────────────────

function drawProfile(
  ctx: CanvasRenderingContext2D,
  tracks: GpxTrack[],
  palette: Palette,
  font: FontDef,
  tipiSize: number,
  isMulti: boolean
) {
  const allPts = tracks.flatMap(t => t.points);
  const hasEle = allPts.some(p => p.ele !== 0);
  const totalDistKm  = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  // Profile zone: bottom PROFILE_FRAC of poster
  const profileTopY = POSTER_H * (1 - PROFILE_FRAC);
  const baseY = POSTER_H;
  const areaH = baseY - profileTopY;

  const padH  = 0; // full width — edge to edge
  const areaW = POSTER_W;

  // Cumulative distances (to split per track for multi-trace)
  const trackCumDist: number[] = [0]; // cumulative dist at start of each track
  let cum = 0;
  for (const t of tracks) { cum += t.distanceKm; trackCumDist.push(cum); }
  const D = cum || 1;

  // Full point array with cumulative distances
  const pts = decimate(allPts, 2000);
  const ptCum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    ptCum.push(ptCum[i - 1] + haversineKm(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }

  const eles = pts.map(p => p.ele);
  const eMin = hasEle ? Math.min(...eles) : 0;
  const eMax = hasEle ? Math.max(...eles) : 1;
  const eRange = Math.max(eMax - eMin, 1);

  const toX = (d: number) => padH + (d / D) * areaW;
  const toY = (e: number) => baseY - ((e - eMin) / eRange) * areaH;

  if (!hasEle) {
    // Flat profile: just a thin strip at the bottom
    ctx.fillStyle = hexToRgba(palette.profileFill, 0.85);
    ctx.fillRect(0, baseY - areaH * 0.08, POSTER_W, areaH * 0.08);
  } else {
    // ── Solid silhouette ──
    ctx.fillStyle = palette.profileFill;
    ctx.beginPath();
    ctx.moveTo(toX(0), baseY);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(toX(ptCum[i]), toY(eles[i]));
    ctx.lineTo(toX(D), baseY);
    ctx.closePath();
    ctx.fill();

    // ── Mountain peak triangles ──
    const minProm = eRange * 0.07;
    const minGap  = Math.max(8, Math.round(pts.length / 28));
    const mSz     = Math.round(POSTER_W * 0.008);
    ctx.fillStyle = palette.statsText;
    for (const idx of findPeaks(eles, minProm, minGap)) {
      drawTriangle(ctx, toX(ptCum[idx]), toY(eles[idx]) - mSz * 0.3, mSz);
    }

    // ── Start dot on profile ──
    const dotR = Math.round(POSTER_W * 0.006);
    ctx.fillStyle = palette.statsText;
    ctx.beginPath();
    ctx.arc(toX(0), baseY, dotR, 0, Math.PI * 2);
    ctx.fill();

    // ── Tipi markers on profile for multi-trace ──
    if (isMulti) {
      const pTipi = Math.round(POSTER_W * 0.011);
      for (let t = 0; t < tracks.length - 1; t++) {
        const xPos = toX(trackCumDist[t + 1]);
        // find closest point index to this distance
        let closest = 0;
        let minDiff = Infinity;
        for (let i = 0; i < ptCum.length; i++) {
          const diff = Math.abs(ptCum[i] - trackCumDist[t + 1]);
          if (diff < minDiff) { minDiff = diff; closest = i; }
        }
        const yPos = toY(eles[closest]);
        drawTipi(ctx, xPos, yPos - pTipi * 0.4, pTipi, palette.statsText);

        const city = extractArrivalCity(tracks[t].name);
        if (city) {
          ctx.save();
          ctx.font = `bold ${Math.round(POSTER_W * 0.012)}px 'Lobster', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = palette.statsText;
          ctx.fillText(city, xPos, yPos - pTipi * 1.4);
          ctx.restore();
        }
      }
    }

    // ── End square on profile ──
    const endSq = dotR * 1.5;
    ctx.fillStyle = palette.statsText;
    ctx.fillRect(toX(D) - endSq / 2, baseY - endSq / 2, endSq, endSq);
  }

  // ── Stats text ──
  const statsText = `${totalDistKm.toFixed(2)} km - ${Math.round(totalEleGain)} m D+`;
  let fontSize = Math.round(areaH * 0.22);
  ctx.font = buildFontString(font, fontSize);
  ctx.textAlign = 'center';
  while (ctx.measureText(statsText).width > POSTER_W * 0.88 && fontSize > 20) {
    fontSize -= 4;
    ctx.font = buildFontString(font, fontSize);
  }
  ctx.fillStyle = palette.statsText;
  ctx.textBaseline = 'bottom';
  ctx.fillText(statsText, POSTER_W / 2, POSTER_H - Math.round(areaH * 0.04));
}
