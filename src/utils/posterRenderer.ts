// ---------------------------------------------------------------------------
// Pretty GPX — Poster canvas renderer
// ---------------------------------------------------------------------------

import { GpxTrack, haversineKm } from './gpxParser';
import { Palette, FontDef } from './palettes';
import { Poi } from './overpass';
import {
  buildHillshadeRegion,
  mercatorX, mercatorY,
  normToLat, normToLon,
} from './hillshading';

export const POSTER_W = 2480;
export const POSTER_H = 3508;

const TITLE_Y     = 0.085;
const TRACK_CY    = 0.43;
const TRACK_VFILL = 0.54;
const TRACK_HFILL = 0.74;
const PROFILE_FRAC = 0.26;
// Flat band at bottom of profile: always filled, ~1.8 cm at A4 300dpi
const FLAT_BAND_H = Math.round(POSTER_H * 0.055);

// ── Map transform (exported so Index.tsx can convert canvas clicks → lat/lon) ──

export interface MapTransform {
  scale: number;
  xOrigin: number; // normalized Mercator x of canvas left edge
  yOrigin: number; // normalized Mercator y of canvas top edge
}

export function computeMapTransform(tracks: GpxTrack[]): MapTransform | null {
  if (tracks.length === 0) return null;
  const allPts = tracks.flatMap(t => t.points);
  const lats = allPts.map(p => p.lat);
  const lons = allPts.map(p => p.lon);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lonMin = Math.min(...lons), lonMax = Math.max(...lons);

  const xSpan = Math.max(mercatorX(lonMax) - mercatorX(lonMin), 1e-6);
  const ySpan = Math.max(mercatorY(latMin) - mercatorY(latMax), 1e-6);

  const scale = Math.min(
    (POSTER_W * TRACK_HFILL) / xSpan,
    (POSTER_H * TRACK_VFILL) / ySpan
  );

  const xMid = (mercatorX(lonMin) + mercatorX(lonMax)) / 2;
  const yMid = (mercatorY(latMax) + mercatorY(latMin)) / 2;
  const xOrigin = xMid - (POSTER_W / 2) / scale;
  const yOrigin = yMid - (POSTER_H * TRACK_CY) / scale;

  return { scale, xOrigin, yOrigin };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  const out = arr.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
}

async function loadFont(spec: string) {
  try { await document.fonts.load(spec); } catch { /* fallback ok */ }
}

function buildFontString(font: FontDef, size: number) {
  return `${font.style} ${size}px ${font.family}`;
}

function extractArrivalCity(name: string): string {
  for (const re of [/\bà\s+(.+)$/iu, /\bto\s+(.+)$/iu, /\s[-–]\s+(.+)$/u]) {
    const m = name.match(re);
    if (m) return m[1].trim();
  }
  return name.trim();
}

function extractDepartureCity(name: string): string | null {
  const m = name.match(/^De\s+(.+?)\s+[àa]\s+/iu);
  return m ? m[1].trim() : null;
}

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

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.72, cy + size * 0.52);
  ctx.lineTo(cx - size * 0.72, cy + size * 0.52);
  ctx.closePath();
  ctx.fill();
}

function drawTipi(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number, color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.72, cy + size * 0.48);
  ctx.lineTo(cx - size * 0.72, cy + size * 0.48);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.14, cy - size * 0.82);
  ctx.lineTo(cx - size * 0.38, cy - size * 1.32);
  ctx.moveTo(cx + size * 0.14, cy - size * 0.82);
  ctx.lineTo(cx + size * 0.38, cy - size * 1.32);
  ctx.stroke();
  ctx.restore();
}

/** Draw a POI icon + label with arrow pointing away from map centre. */
function drawPoiWithLabel(
  ctx: CanvasRenderingContext2D,
  poi: Poi,
  px: number, py: number,
  color: string,
  mapCx: number, mapCy: number,
  iconSz: number,
  fontSize: number
) {
  ctx.fillStyle = color;

  switch (poi.type) {
    case 'summit':
    case 'col':
      drawTriangle(ctx, px, py, iconSz);
      break;
    case 'tipi':
      drawTipi(ctx, px, py, iconSz, color);
      break;
    case 'city': {
      const sq = iconSz * 0.85;
      ctx.fillRect(px - sq / 2, py - sq / 2, sq, sq);
      break;
    }
  }

  // Arrow: points away from map centre
  const dx = px - mapCx;
  const dy = py - mapCy;
  const ang = Math.atan2(dy, dx);
  const arrowLen = fontSize * 3.2;
  const lx = px + Math.cos(ang) * arrowLen;
  const ly = py + Math.sin(ang) * arrowLen;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, fontSize * 0.07);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(lx, ly); ctx.stroke();

  ctx.font = `bold ${fontSize}px 'Oswald', Arial, sans-serif`;
  ctx.textAlign = Math.cos(ang) >= 0 ? 'left' : 'right';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = fontSize * 0.45;
  ctx.fillStyle = color;
  ctx.fillText(poi.name, lx, ly);
  ctx.restore();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function renderPoster(
  canvas: HTMLCanvasElement,
  tracks: GpxTrack[],
  title: string,
  palette: Palette,
  font: FontDef,
  pois: Poi[],
  onProgress?: (pct: number) => void
): Promise<void> {
  const prog = onProgress ?? (() => {});

  canvas.width  = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  prog(2);

  if (tracks.length === 0) {
    await drawTitle(ctx, title || 'Pretty GPX', palette, font);
    prog(100);
    return;
  }

  // ── Mercator transform ──
  const mt = computeMapTransform(tracks)!;
  const { scale, xOrigin, yOrigin } = mt;

  function toPixel(lat: number, lon: number): [number, number] {
    return [
      (mercatorX(lon) - xOrigin) * scale,
      (mercatorY(lat) - yOrigin) * scale,
    ];
  }

  // ── Full-canvas hillshade ──
  prog(5);
  const hs = await buildHillshadeRegion(
    normToLon(xOrigin), normToLon(xOrigin + POSTER_W / scale),
    normToLat(yOrigin + POSTER_H / scale), normToLat(yOrigin),
    palette.bg, palette.isLight
  );
  prog(65);

  if (hs) {
    ctx.drawImage(
      hs.canvas,
      (hs.xMin - xOrigin) * scale, (hs.yMin - yOrigin) * scale,
      (hs.xMax - hs.xMin) * scale, (hs.yMax - hs.yMin) * scale
    );
  }

  // ── GPX traces ──
  ctx.strokeStyle = palette.track;
  ctx.lineWidth = Math.max(14, Math.round(POSTER_W * 0.0095));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

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

  // ── Stage markers (multi-trace) ──
  const markerR  = Math.round(POSTER_W * 0.007);
  const tipiSz   = Math.round(POSTER_W * 0.014);
  const labelSz  = Math.round(POSTER_W * 0.018);
  const isMulti  = tracks.length > 1;
  const mapCx = POSTER_W / 2;
  const mapCy = POSTER_H * TRACK_CY;

  const [sx0, sy0] = toPixel(tracks[0].points[0].lat, tracks[0].points[0].lon);
  ctx.fillStyle = palette.title;
  ctx.beginPath(); ctx.arc(sx0, sy0, markerR, 0, Math.PI * 2); ctx.fill();

  if (isMulti) {
    const depart = extractDepartureCity(tracks[0].name);
    if (depart) {
      ctx.save();
      ctx.font = `bold ${labelSz}px 'Oswald', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = labelSz * 0.5;
      ctx.fillStyle = palette.title;
      ctx.fillText(depart, sx0, sy0 - markerR * 2.2);
      ctx.restore();
    }
    for (let t = 0; t < tracks.length; t++) {
      const endPt = tracks[t].points[tracks[t].points.length - 1];
      const [ex, ey] = toPixel(endPt.lat, endPt.lon);
      const city = extractArrivalCity(tracks[t].name);
      const isLast = t === tracks.length - 1;
      ctx.fillStyle = palette.title;
      if (isLast) {
        const sq = markerR * 1.6;
        ctx.fillRect(ex - sq / 2, ey - sq / 2, sq, sq);
      } else {
        drawTipi(ctx, ex, ey - tipiSz * 0.5, tipiSz, palette.title);
      }
      ctx.save();
      ctx.font = `bold ${labelSz}px 'Oswald', sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = labelSz * 0.5;
      ctx.fillStyle = palette.title;
      ctx.fillText(city, ex, ey - tipiSz * 1.6);
      ctx.restore();
    }
  } else {
    const last = tracks[0].points[tracks[0].points.length - 1];
    const [ex, ey] = toPixel(last.lat, last.lon);
    const sq = markerR * 1.6;
    ctx.fillStyle = palette.title;
    ctx.fillRect(ex - sq / 2, ey - sq / 2, sq, sq);
  }

  // ── Overpass POI markers ──
  const poiIconSz  = Math.round(POSTER_W * 0.012);
  const poiFontSz  = Math.round(POSTER_W * 0.017);
  for (const poi of pois.filter(p => p.visible)) {
    const [px, py] = toPixel(poi.lat, poi.lon);
    drawPoiWithLabel(ctx, poi, px, py, palette.title, mapCx, mapCy, poiIconSz, poiFontSz);
  }

  prog(78);

  // ── Elevation profile ──
  drawProfile(ctx, tracks, palette, font, tipiSz, isMulti);

  // ── Title (last = always on top) ──
  await drawTitle(ctx, title || 'Pretty GPX', palette, font);
  prog(100);
}

// ── Title ────────────────────────────────────────────────────────────────────

async function drawTitle(
  ctx: CanvasRenderingContext2D, title: string,
  palette: Palette, font: FontDef
) {
  await loadFont(`${font.style} 120px ${font.family}`);
  const cy = POSTER_H * TITLE_Y;
  let size = Math.round(POSTER_H * TITLE_Y * 0.65);
  ctx.font = buildFontString(font, size);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  while (ctx.measureText(title).width > POSTER_W * 0.90 && size > 40) {
    size -= 4; ctx.font = buildFontString(font, size);
  }
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
  tipiSz: number,
  isMulti: boolean
) {
  const allPts = tracks.flatMap(t => t.points);
  const hasEle = allPts.some(p => p.ele !== 0);
  const totalDistKm  = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  const profileH   = Math.round(POSTER_H * PROFILE_FRAC);  // total zone height
  // Flat band at very bottom (always filled), variations start above it
  const varBaseY   = POSTER_H - FLAT_BAND_H;  // baseline for min elevation
  const varH       = profileH - FLAT_BAND_H;  // height for elevation variations

  // Cumulative distances per track
  const trackCumDist: number[] = [0];
  let cum = 0;
  for (const t of tracks) { cum += t.distanceKm; trackCumDist.push(cum); }
  const D = cum || 1;

  const pts = decimate(allPts, 2000);
  const ptCum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    ptCum.push(ptCum[i - 1] + haversineKm(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon));
  }

  const eles = pts.map(p => p.ele);
  const eMin = hasEle ? Math.min(...eles) : 0;
  const eMax = hasEle ? Math.max(...eles) : 1;
  const eRange = Math.max(eMax - eMin, 1);

  // x: full width, y: varBaseY = eMin, varBaseY - varH = eMax
  const toX = (d: number) => (d / D) * POSTER_W;
  const toY = (e: number) => varBaseY - ((e - eMin) / eRange) * varH;

  if (!hasEle) {
    ctx.fillStyle = hexToRgba(palette.profileFill, 0.85);
    ctx.fillRect(0, varBaseY, POSTER_W, FLAT_BAND_H);
    return;
  }

  // ── Solid silhouette (flat band included automatically because toY(eMin)=varBaseY) ──
  ctx.fillStyle = palette.profileFill;
  ctx.beginPath();
  ctx.moveTo(0, POSTER_H);                                   // bottom-left
  for (let i = 0; i < pts.length; i++) ctx.lineTo(toX(ptCum[i]), toY(eles[i]));
  ctx.lineTo(POSTER_W, POSTER_H);                            // bottom-right
  ctx.closePath();
  ctx.fill();

  // ── Mountain peak triangles on top of silhouette ──
  const minProm = eRange * 0.07;
  const minGap  = Math.max(8, Math.round(pts.length / 28));
  const mSz     = Math.round(POSTER_W * 0.009);
  ctx.fillStyle = palette.statsText;
  for (const idx of findPeaks(eles, minProm, minGap)) {
    drawTriangle(ctx, toX(ptCum[idx]), toY(eles[idx]) - mSz * 0.3, mSz);
  }

  // ── Tipi markers at stage boundaries (no labels — labels are on the map) ──
  if (isMulti) {
    const pTipi = Math.round(POSTER_W * 0.011);
    for (let t = 0; t < tracks.length - 1; t++) {
      const d = trackCumDist[t + 1];
      let closest = 0, minDiff = Infinity;
      for (let i = 0; i < ptCum.length; i++) {
        const diff = Math.abs(ptCum[i] - d);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      }
      drawTipi(ctx, toX(d), toY(eles[closest]) - pTipi * 0.4, pTipi, palette.statsText);
    }
  }

  // ── Start circle & end square — at varBaseY (top of flat band) ──
  const dotR = Math.round(POSTER_W * 0.006);
  ctx.fillStyle = palette.statsText;
  ctx.beginPath(); ctx.arc(toX(0), varBaseY, dotR, 0, Math.PI * 2); ctx.fill();
  const endSq = dotR * 1.5;
  ctx.fillRect(toX(D) - endSq / 2, varBaseY - endSq / 2, endSq, endSq);

  // ── Stats text (inside flat band) ──
  const statsText = `${totalDistKm.toFixed(2)} km - ${Math.round(totalEleGain)} m D+`;
  let fontSize = Math.round(FLAT_BAND_H * 0.55);
  ctx.font = buildFontString(font, fontSize);
  ctx.textAlign = 'center';
  while (ctx.measureText(statsText).width > POSTER_W * 0.88 && fontSize > 20) {
    fontSize -= 4; ctx.font = buildFontString(font, fontSize);
  }
  ctx.fillStyle = palette.statsText;
  ctx.textBaseline = 'middle';
  ctx.fillText(statsText, POSTER_W / 2, POSTER_H - FLAT_BAND_H / 2);
}
