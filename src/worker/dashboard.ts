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
import { fetchCoachCounts, type CoachCount } from "./providers/rtt";
import { fetchWeather, type WeatherValue } from "./providers/weather";

const RAIL_ERROR = "Live departures are temporarily unavailable.";
const WEATHER_ERROR = "Current weather is temporarily unavailable.";
const londonDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "Europe/London",
  year: "numeric"
});

function departureKey(
  scheduledDeparture: string,
  operatorCode: string
): string {
  const parts = Object.fromEntries(
    londonDateTime
      .formatToParts(new Date(scheduledDeparture))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}|${operatorCode}`;
}

function coachCountKey(coachCount: CoachCount): string {
  return `${coachCount.scheduledDeparture}|${coachCount.operatorCode}`;
}

function enrichDepartures(
  departures: DeparturesPanel,
  coachCounts: CoachCount[]
): DeparturesPanel {
  const coachCountByService = new Map(
    coachCounts.map((coachCount) => [coachCountKey(coachCount), coachCount.coachCount])
  );
  return {
    ...departures,
    services: departures.services.map((service) => ({
      ...service,
      coachCount: coachCountByService.get(
        departureKey(service.scheduledDeparture, service.operatorCode)
      ) ?? null
    }))
  };
}

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
      temperatureMinTodayC: null,
      temperatureMaxTodayC: null,
      apparentTemperatureC: null,
      relativeHumidityPercent: null,
      precipitationMm: null,
      rainChanceNext6HoursPercent: null,
      weatherCode: null,
      condition: null,
      windSpeedKph: null,
      windDirectionDegrees: null,
      pressureMslHpa: null,
      error: WEATHER_ERROR
    };
  }

  return {
    status: result.value.stale ? "stale" : "live",
    updatedAt: result.value.updatedAt,
    stale: result.value.stale,
    ...result.value.value,
    temperatureMinTodayC: result.value.value.temperatureMinTodayC ?? null,
    temperatureMaxTodayC: result.value.value.temperatureMaxTodayC ?? null,
    rainChanceNext6HoursPercent:
      result.value.value.rainChanceNext6HoursPercent ?? null,
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
  darwinApiKey: string;
  rttApiToken?: string;
}): () => Promise<DashboardPayload> {
  return async () => {
    const now = deps.now();
    const coachCounts = deps.rttApiToken
      ? loadWithFallback({
        cache: deps.cache,
        key: "rtt-coaches-v1",
        now,
        freshForMs: 5 * 60_000,
        staleForMs: 0,
        load: () => fetchCoachCounts(deps.fetcher, deps.rttApiToken!)
      }).then((result) => result.value)
        .catch(() => [] as CoachCount[])
      : Promise.resolve([] as CoachCount[]);
    const [railResult, weatherResult, coachCountResult] = await Promise.allSettled([
      loadWithFallback({
        cache: deps.cache,
        key: "rail",
        now,
        freshForMs: 30_000,
        staleForMs: 5 * 60_000,
        load: () => fetchDepartures(deps.fetcher, now, deps.darwinApiKey)
      }),
      loadWithFallback({
        cache: deps.cache,
        key: "weather-v2",
        now,
        freshForMs: 10 * 60_000,
        staleForMs: 30 * 60_000,
        load: () => fetchWeather(deps.fetcher, now)
      }),
      coachCounts
    ]);
    const departures = enrichDepartures(
      departuresPanel(railResult),
      coachCountResult.status === "fulfilled" ? coachCountResult.value : []
    );
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
