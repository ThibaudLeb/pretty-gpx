import { GpxTrack, haversineKm } from "./gpxParser";

// A4 @ 300 dpi
export const POSTER_W = 2480;
export const POSTER_H = 3508;

const C = {
  bgLight: "#EBF0FA",
  navy: "#1B2B5E",
  profileFill: "#6B96D4",
  profileBg: "#2855A0",
  white: "#FFFFFF",
} as const;

// Thin a point array to at most maxPts for canvas rendering performance
function decimate<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = Math.ceil(arr.length / maxPts);
  const result = arr.filter((_, i) => i % step === 0);
  if (result[result.length - 1] !== arr[arr.length - 1]) {
    result.push(arr[arr.length - 1]);
  }
  return result;
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
  titleH: number
): void {
  ctx.fillStyle = C.bgLight;
  ctx.fillRect(0, 0, POSTER_W, titleH);

  let fontSize = Math.round(titleH * 0.33);
  ctx.font = `italic bold ${fontSize}px cursive, Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  while (ctx.measureText(title).width > POSTER_W * 0.86 && fontSize > 36) {
    fontSize -= 4;
    ctx.font = `italic bold ${fontSize}px cursive, Georgia, serif`;
  }

  ctx.fillStyle = C.navy;
  ctx.fillText(title, POSTER_W / 2, titleH / 2);
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  tracks: GpxTrack[],
  mapY: number,
  mapH: number
): void {
  ctx.fillStyle = C.bgLight;
  ctx.fillRect(0, mapY, POSTER_W, mapH);

  const allPoints = tracks.flatMap((t) => t.points);
  if (allPoints.length < 2) return;

  const lats = allPoints.map((p) => p.lat);
  const lons = allPoints.map((p) => p.lon);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);

  const midLat = (latMin + latMax) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const traceLonSpan = Math.max((lonMax - lonMin) * lonScale, 0.0001);
  const traceLatSpan = Math.max(latMax - latMin, 0.0001);

  const padH = POSTER_W * 0.10;
  const padV = mapH * 0.10;
  const scale = Math.min(
    (POSTER_W - 2 * padH) / traceLonSpan,
    (mapH - 2 * padV) / traceLatSpan
  );

  const tracePixW = traceLonSpan * scale;
  const tracePixH = traceLatSpan * scale;
  const offsetX = (POSTER_W - tracePixW) / 2;
  const offsetY = mapY + (mapH - tracePixH) / 2;

  const project = (lat: number, lon: number): [number, number] => [
    offsetX + (lon - lonMin) * lonScale * scale,
    offsetY + (latMax - lat) * scale,
  ];

  const lineW = Math.max(5, Math.round(POSTER_W * 0.003));
  ctx.strokeStyle = C.navy;
  ctx.lineWidth = lineW;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const track of tracks) {
    const pts = decimate(track.points, 3000);
    if (pts.length < 2) continue;
    ctx.beginPath();
    const [sx, sy] = project(pts[0].lat, pts[0].lon);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = project(pts[i].lat, pts[i].lon);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Start marker — filled square
  const [startX, startY] = project(
    tracks[0].points[0].lat,
    tracks[0].points[0].lon
  );
  const sq = Math.round(POSTER_W * 0.010);
  ctx.fillStyle = C.navy;
  ctx.fillRect(startX - sq / 2, startY - sq / 2, sq, sq);
}

function drawProfile(
  ctx: CanvasRenderingContext2D,
  tracks: GpxTrack[],
  profileY: number,
  profileH: number
): void {
  ctx.fillStyle = C.profileBg;
  ctx.fillRect(0, profileY, POSTER_W, profileH);

  const allPoints = tracks.flatMap((t) => t.points);
  const hasElevation = allPoints.some((p) => p.ele !== 0);

  if (hasElevation && allPoints.length >= 2) {
    // Build cumulative distance array for x-axis
    const pts = decimate(allPoints, 2000);
    const cumDist: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      cumDist.push(
        cumDist[i - 1] +
          haversineKm(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon)
      );
    }
    const totalDist = cumDist[cumDist.length - 1] || 1;

    const eles = pts.map((p) => p.ele);
    const eleMin = Math.min(...eles);
    const eleMax = Math.max(...eles);
    const eleRange = Math.max(eleMax - eleMin, 1);

    const padH = POSTER_W * 0.08;
    const padTop = profileH * 0.08;
    const padBottom = profileH * 0.40; // room for stats text below
    const areaW = POSTER_W - 2 * padH;
    const areaH = profileH - padTop - padBottom;

    const toX = (d: number) => padH + (d / totalDist) * areaW;
    const toY = (ele: number) =>
      profileY + padTop + areaH - ((ele - eleMin) / eleRange) * areaH;
    const baseY = profileY + padTop + areaH;

    ctx.fillStyle = C.profileFill;
    ctx.beginPath();
    ctx.moveTo(toX(0), baseY);
    for (let i = 0; i < pts.length; i++) {
      ctx.lineTo(toX(cumDist[i]), toY(pts[i].ele));
    }
    ctx.lineTo(toX(totalDist), baseY);
    ctx.closePath();
    ctx.fill();
  }

  // Stats text
  const totalDistKm = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);
  const statsText = `${totalDistKm.toFixed(2)} km - ${Math.round(totalEleGain)} m D+`;

  let fontSize = Math.round(profileH * 0.17);
  ctx.font = `italic ${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  while (ctx.measureText(statsText).width > POSTER_W * 0.88 && fontSize > 24) {
    fontSize -= 4;
    ctx.font = `italic ${fontSize}px Georgia, "Times New Roman", serif`;
  }

  ctx.fillStyle = C.white;
  ctx.textBaseline = "bottom";
  ctx.fillText(statsText, POSTER_W / 2, profileY + profileH - Math.round(profileH * 0.06));
}

export function renderPoster(
  canvas: HTMLCanvasElement,
  tracks: GpxTrack[],
  title: string
): void {
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const titleH = Math.round(POSTER_H * 0.15);
  const mapH = Math.round(POSTER_H * 0.55);
  const profileH = POSTER_H - titleH - mapH;
  const mapY = titleH;
  const profileY = titleH + mapH;

  drawTitle(ctx, title || "Ma trace GPX", titleH);
  drawMap(ctx, tracks, mapY, mapH);
  drawProfile(ctx, tracks, profileY, profileH);
}
