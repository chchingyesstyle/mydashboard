import type { RouteConfig, WeatherWarning, WeatherWarningLevel } from "../../shared/contracts";

const METEOALARM_URL =
  "https://feeds.meteoalarm.org/api/v1/warnings/feeds-united-kingdom";

const SEVERITY_RANK: Record<WeatherWarningLevel, number> = {
  yellow: 0,
  amber: 1,
  red: 2
};

function levelFromEvent(event: unknown): WeatherWarningLevel | null {
  if (typeof event !== "string") return null;
  const match = event.match(/\b(yellow|amber|red)\b/i);
  if (match === null) return null;
  return match[1].toLowerCase() as WeatherWarningLevel;
}

function parsePolygon(polygon: string): Array<[number, number]> {
  return polygon
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lat, lon] = pair.split(",").map(Number);
      return [lat, lon] as [number, number];
    })
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
}

function pointInPolygon(
  lat: number,
  lon: number,
  polygon: Array<[number, number]>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i];
    const [latJ, lonJ] = polygon[j];
    const intersects =
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isActiveNow(info: Record<string, unknown>, now: Date): boolean {
  const onset = typeof info.onset === "string" ? Date.parse(info.onset) : Number.NaN;
  const expires = typeof info.expires === "string" ? Date.parse(info.expires) : Number.NaN;
  if (Number.isNaN(onset) || Number.isNaN(expires)) return false;
  const nowMs = now.getTime();
  return onset <= nowMs && nowMs <= expires;
}

function coversLocation(
  info: Record<string, unknown>,
  location: { latitude: number; longitude: number }
): boolean {
  const areas = info.area;
  if (!Array.isArray(areas)) return false;

  return areas.some((area) => {
    if (typeof area !== "object" || area === null) return false;
    const polygons = (area as Record<string, unknown>).polygon;
    if (!Array.isArray(polygons)) return false;
    return polygons.some(
      (polygon) =>
        typeof polygon === "string" &&
        pointInPolygon(location.latitude, location.longitude, parsePolygon(polygon))
    );
  });
}

export function normalizeWeatherWarning(
  response: unknown,
  now: Date,
  location: { latitude: number; longitude: number }
): WeatherWarning | null {
  if (typeof response !== "object" || response === null) return null;
  const warnings = (response as Record<string, unknown>).warnings;
  if (!Array.isArray(warnings)) return null;

  let best: WeatherWarning | null = null;

  for (const warning of warnings) {
    if (typeof warning !== "object" || warning === null) continue;
    const alert = (warning as Record<string, unknown>).alert;
    if (typeof alert !== "object" || alert === null) continue;
    const alertRecord = alert as Record<string, unknown>;

    if (alertRecord.status !== "Actual") continue;
    if (alertRecord.msgType === "Cancel") continue;

    const infoList = alertRecord.info;
    if (!Array.isArray(infoList)) continue;

    for (const info of infoList) {
      if (typeof info !== "object" || info === null) continue;
      const infoRecord = info as Record<string, unknown>;

      const level = levelFromEvent(infoRecord.event);
      if (level === null) continue;
      if (!isActiveNow(infoRecord, now)) continue;
      if (!coversLocation(infoRecord, location)) continue;

      const headline = typeof infoRecord.headline === "string" ? infoRecord.headline : null;
      if (headline === null) continue;
      const event = typeof infoRecord.event === "string" ? infoRecord.event : null;
      if (event === null) continue;

      if (best === null || SEVERITY_RANK[level] > SEVERITY_RANK[best.level]) {
        best = { level, event, headline };
      }
    }
  }

  return best;
}

export async function fetchWeatherWarning(
  fetcher: typeof fetch,
  now: Date,
  route: RouteConfig
): Promise<WeatherWarning | null> {
  const response = await fetcher(METEOALARM_URL, {
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error("MeteoAlarm request failed");
  }

  return normalizeWeatherWarning(await response.json(), now, route.weather);
}
