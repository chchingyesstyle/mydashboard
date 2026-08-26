import {
  DEFAULT_ROUTE,
  type DashboardPayload,
  type DashboardStatus,
  type Departure,
  type DeparturesPanel,
  type ElectricityPanel,
  type RouteConfig,
  type WeatherPanel,
  type WeatherWarning
} from "../shared/contracts";
import { loadWithFallback, type CacheStore, type CachedResult } from "./provider-cache";
import { fetchAgilePrices, type AgileNormalizedResult } from "./providers/agile";
import { fetchDepartures } from "./providers/rail";
import {
  createRttClient,
  type RttServiceEnrichment
} from "./providers/rtt";
import { fetchWeather, type WeatherValue } from "./providers/weather";
import { fetchWeatherWarning } from "./providers/weather-warning";

const RAIL_ERROR = "Live departures are temporarily unavailable.";
const WEATHER_ERROR = "Current weather is temporarily unavailable.";
const ELECTRICITY_ERROR = "Electricity prices are temporarily unavailable.";
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

function enrichmentKey(enrichment: RttServiceEnrichment): string {
  return `${enrichment.scheduledDeparture}|${enrichment.operatorCode}`;
}

function enrichDepartures(
  departures: DeparturesPanel,
  enrichments: RttServiceEnrichment[]
): DeparturesPanel {
  const enrichmentByService = new Map(
    enrichments.map((enrichment) => [
      enrichmentKey(enrichment),
      enrichment
    ])
  );
  return {
    ...departures,
    services: departures.services.map((service) => {
      const enrichment = enrichmentByService.get(
        departureKey(service.scheduledDeparture, service.operatorCode)
      );
      const actualPlatform = enrichment?.actualPlatform ?? null;
      const plannedPlatform = enrichment?.plannedPlatform ?? null;
      const platform = service.platform ??
        actualPlatform ??
        plannedPlatform ??
        null;
      const platformStatus = service.platform !== null || actualPlatform !== null
        ? "live"
        : plannedPlatform !== null
          ? "planned"
          : null;

      return {
        ...service,
        platform,
        platformStatus,
        coachCount: enrichment?.coachCount ?? null
      };
    })
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
  result: PromiseSettledResult<CachedResult<WeatherValue>>,
  warningResult: PromiseSettledResult<CachedResult<WeatherWarning | null>>
): WeatherPanel {
  const warning = warningResult.status === "fulfilled" ? warningResult.value.value : null;

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
      dailyForecast: [],
      hourlyForecast: [],
      warning,
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
    dailyForecast: result.value.value.dailyForecast ?? [],
    hourlyForecast: result.value.value.hourlyForecast ?? [],
    warning,
    error: null
  };
}

function electricityPanel(
  result: PromiseSettledResult<CachedResult<AgileNormalizedResult>>
): ElectricityPanel {
  if (result.status === "rejected") {
    return {
      status: "unavailable",
      updatedAt: null,
      stale: false,
      prices: [],
      todayAveragePencePerKwh: null,
      error: ELECTRICITY_ERROR
    };
  }

  return {
    status: result.value.stale ? "stale" : "live",
    updatedAt: result.value.updatedAt,
    stale: result.value.stale,
    prices: result.value.value.prices,
    todayAveragePencePerKwh: result.value.value.todayAveragePencePerKwh,
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
}): (route?: RouteConfig) => Promise<DashboardPayload> {
  const rttClient = deps.rttApiToken
    ? createRttClient(deps.fetcher, deps.rttApiToken)
    : null;

  return async (route: RouteConfig = DEFAULT_ROUTE) => {
    const now = deps.now();
    const serviceEnrichments = rttClient !== null
      ? loadWithFallback({
        cache: deps.cache,
        key: `rtt-enrichment:${route.id}`,
        now,
        freshForMs: 5 * 60_000,
        staleForMs: 5 * 60_000,
        load: () => rttClient.fetchServiceEnrichments(route, now)
      }).then((result) => result.value)
        .catch(() => [] as RttServiceEnrichment[])
      : Promise.resolve([] as RttServiceEnrichment[]);
    const [railResult, weatherResult, warningResult, electricityResult, enrichmentResult] =
      await Promise.allSettled([
        loadWithFallback({
          cache: deps.cache,
          key: `rail:${route.id}`,
          now,
          freshForMs: 30_000,
          staleForMs: 5 * 60_000,
          load: () => fetchDepartures(
            deps.fetcher,
            now,
            deps.darwinApiKey,
            route
          )
        }),
        loadWithFallback({
          cache: deps.cache,
          key: `weather:${route.origin.crs}`,
          now,
          freshForMs: 10 * 60_000,
          staleForMs: 30 * 60_000,
          load: () => fetchWeather(deps.fetcher, now, route)
        }),
        loadWithFallback({
          cache: deps.cache,
          key: `weather-warning:${route.origin.crs}`,
          now,
          freshForMs: 10 * 60_000,
          staleForMs: 30 * 60_000,
          load: () => fetchWeatherWarning(deps.fetcher, now, route)
        }),
        loadWithFallback({
          cache: deps.cache,
          key: "electricity",
          now,
          freshForMs: 15 * 60_000,
          staleForMs: 3 * 60 * 60_000,
          load: () => fetchAgilePrices(deps.fetcher, now)
        }),
        serviceEnrichments
      ]);
    const departures = enrichDepartures(
      departuresPanel(railResult),
      enrichmentResult.status === "fulfilled" ? enrichmentResult.value : []
    );
    const weather = weatherPanel(weatherResult, warningResult);
    const electricity = electricityPanel(electricityResult);
    const generatedAt = [departures.updatedAt, weather.updatedAt, electricity.updatedAt]
      .filter((updatedAt): updatedAt is string => updatedAt !== null)
      .sort()
      .at(-1) ?? now.toISOString();

    return {
      version: 1,
      generatedAt,
      status: dashboardStatus(departures, weather),
      route: {
        origin: route.origin,
        destination: route.destination
      },
      departures,
      weather,
      electricity
    };
  };
}
