import {
  ROUTE,
  type DashboardPayload,
  type DashboardStatus,
  type Departure,
  type DeparturesPanel,
  type WeatherPanel
} from "../shared/contracts";
import { loadWithFallback, type CacheStore, type CachedResult } from "./provider-cache";
import { fetchDepartures } from "./providers/rail";
import { fetchWeather, type WeatherValue } from "./providers/weather";

const RAIL_ERROR = "Live departures are temporarily unavailable.";
const WEATHER_ERROR = "Current weather is temporarily unavailable.";

function departuresPanel(
  result: PromiseSettledResult<CachedResult<Departure[]>>
): DeparturesPanel {
  if (result.status === "rejected") {
    return {
      status: "unavailable",
      updatedAt: null,
      stale: false,
      services: [],
      error: RAIL_ERROR
    };
  }

  return {
    status: result.value.stale ? "stale" : "live",
    updatedAt: result.value.updatedAt,
    stale: result.value.stale,
    services: result.value.value,
    error: null
  };
}

function weatherPanel(
  result: PromiseSettledResult<CachedResult<WeatherValue>>
): WeatherPanel {
  if (result.status === "rejected") {
    return {
      status: "unavailable",
      updatedAt: null,
      stale: false,
      temperatureC: null,
      apparentTemperatureC: null,
      relativeHumidityPercent: null,
      precipitationMm: null,
      weatherCode: null,
      condition: null,
      windSpeedKph: null,
      windDirectionDegrees: null,
      error: WEATHER_ERROR
    };
  }

  return {
    status: result.value.stale ? "stale" : "live",
    updatedAt: result.value.updatedAt,
    stale: result.value.stale,
    ...result.value.value,
    error: null
  };
}

function dashboardStatus(
  departures: DeparturesPanel,
  weather: WeatherPanel
): DashboardStatus {
  if (departures.status === "live" && weather.status === "live") return "live";
  if (departures.status === "unavailable" && weather.status === "unavailable") {
    return "unavailable";
  }
  return "partial";
}

export function createDashboardService(deps: {
  fetcher: typeof fetch;
  cache: CacheStore;
  now: () => Date;
}): () => Promise<DashboardPayload> {
  return async () => {
    const now = deps.now();
    const [railResult, weatherResult] = await Promise.allSettled([
      loadWithFallback({
        cache: deps.cache,
        key: "rail",
        now,
        freshForMs: 30_000,
        staleForMs: 5 * 60_000,
        load: () => fetchDepartures(deps.fetcher, now)
      }),
      loadWithFallback({
        cache: deps.cache,
        key: "weather",
        now,
        freshForMs: 10 * 60_000,
        staleForMs: 30 * 60_000,
        load: () => fetchWeather(deps.fetcher, now)
      })
    ]);
    const departures = departuresPanel(railResult);
    const weather = weatherPanel(weatherResult);
    const generatedAt = [departures.updatedAt, weather.updatedAt]
      .filter((updatedAt): updatedAt is string => updatedAt !== null)
      .sort()
      .at(-1) ?? now.toISOString();

    return {
      version: 1,
      generatedAt,
      status: dashboardStatus(departures, weather),
      route: ROUTE,
      departures,
      weather
    };
  };
}
