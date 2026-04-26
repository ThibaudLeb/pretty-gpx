// ---------------------------------------------------------------------------
// Overpass API — fetch POIs (cols, summets, villages, refuges) near a track
// The Overpass API at overpass-api.de supports CORS — works from browsers.
// ---------------------------------------------------------------------------

export type PoiType = 'col' | 'summit' | 'tipi' | 'city';

export interface Poi {
  id: string;
  type: PoiType;
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  visible: boolean;
  /** false = came from Overpass, true = user-added */
  userAdded?: boolean;
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Approximate distance in metres between two lat/lon points (fast, no trig). */
function approxDistM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = (lat1 - lat2) * 111_000;
  const dlon = (lon1 - lon2) * Math.cos(lat1 * Math.PI / 180) * 111_000;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

/** True if the node is within maxM metres of at least one track point. */
function nearTrack(
  lat: number, lon: number,
  pts: ReadonlyArray<{ lat: number; lon: number }>,
  maxM: number
): boolean {
  // Sample every Nth point — fast enough for 10 k points
  const step = Math.max(1, Math.floor(pts.length / 600));
  for (let i = 0; i < pts.length; i += step) {
    if (approxDistM(lat, lon, pts[i].lat, pts[i].lon) < maxM) return true;
  }
  return false;
}

function nameFromTags(tags: Record<string, string>): string | null {
  return tags['name'] ?? tags['name:fr'] ?? tags['name:en'] ?? null;
}

function typeFromTags(tags: Record<string, string>): PoiType {
  if (tags['natural'] === 'peak') return 'summit';
  if (tags['natural'] === 'saddle' || tags['mountain_pass'] === 'yes') return 'col';
  if (tags['tourism'] === 'alpine_hut' || tags['amenity'] === 'shelter') return 'tipi';
  if (tags['place']) return 'city';
  return 'col';
}

export async function fetchPoisAlongTrack(
  latMin: number, latMax: number,
  lonMin: number, lonMax: number,
  trackPoints: ReadonlyArray<{ lat: number; lon: number }>,
  maxDistM = 500
): Promise<Poi[]> {
  const pad = 0.02;
  const bbox = `${latMin - pad},${lonMin - pad},${latMax + pad},${lonMax + pad}`;

  const query = `[out:json][timeout:30];
(
  node["natural"="saddle"](${bbox});
  node["natural"="peak"]["ele"](${bbox});
  node["mountain_pass"="yes"](${bbox});
  node["tourism"="alpine_hut"](${bbox});
  node["amenity"="shelter"]["hiking"="yes"](${bbox});
  node["place"~"^(village|hamlet|town)$"](${bbox});
);
out body;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}`);

  const json = await res.json();
  const pois: Poi[] = [];

  for (const el of (json.elements ?? []) as Array<{ id: number; lat: number; lon: number; tags?: Record<string, string> }>) {
    if (!nearTrack(el.lat, el.lon, trackPoints, maxDistM)) continue;

    const tags = el.tags ?? {};
    const rawName = nameFromTags(tags);
    if (!rawName) continue;

    const type = typeFromTags(tags);
    const ele = tags['ele'] ? Math.round(parseFloat(tags['ele'])) : undefined;
    const name = ele ? `${rawName} (${ele} m)` : rawName;

    pois.push({
      id: `osm-${el.id}`,
      type,
      name,
      lat: el.lat,
      lon: el.lon,
      ele,
      visible: true,
    });
  }

  return pois;
}
