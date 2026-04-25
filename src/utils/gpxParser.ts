export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
  time?: Date;
}

export interface GpxTrack {
  name: string;
  points: GpxPoint[];
  distanceKm: number;
  elevationGainM: number;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePoints(elements: Element[]): GpxPoint[] {
  return elements.map((pt) => ({
    lat: parseFloat(pt.getAttribute("lat") ?? "0"),
    lon: parseFloat(pt.getAttribute("lon") ?? "0"),
    ele: parseFloat(pt.querySelector("ele")?.textContent ?? "0"),
    time: pt.querySelector("time")?.textContent
      ? new Date(pt.querySelector("time")!.textContent!)
      : undefined,
  }));
}

function buildTrack(name: string, points: GpxPoint[]): GpxTrack {
  let distanceKm = 0;
  let elevationGainM = 0;
  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0) elevationGainM += delta;
  }
  return { name, points, distanceKm, elevationGainM };
}

export function parseGpx(content: string, fileName: string): GpxTrack {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");

  if (doc.querySelector("parsererror")) {
    throw new Error("Fichier GPX/XML malformé");
  }

  const baseName = fileName.replace(/\.(gpx|xml)$/i, "");
  const nameEl =
    doc.querySelector("trk > name") ??
    doc.querySelector("metadata > name") ??
    doc.querySelector("name");
  const name = nameEl?.textContent?.trim() || baseName;

  const trkpts = Array.from(doc.querySelectorAll("trkpt"));
  if (trkpts.length > 0) {
    return buildTrack(name, parsePoints(trkpts));
  }

  // Fallback: route points
  const rtepts = Array.from(doc.querySelectorAll("rtept"));
  if (rtepts.length > 0) {
    return buildTrack(name, parsePoints(rtepts));
  }

  // Fallback: waypoints
  const wpts = Array.from(doc.querySelectorAll("wpt"));
  if (wpts.length > 0) {
    return buildTrack(name, parsePoints(wpts));
  }

  throw new Error("Le fichier GPX ne contient aucun point de trace");
}
