import { describe, expect, it } from "vitest";
import { createDashboardService } from "../../src/worker/dashboard";
import type { CacheStore } from "../../src/worker/provider-cache";
import { normalizeHuxley } from "../../src/worker/providers/rail";
import { huxleyFixture } from "../fixtures/huxley";
import { openMeteoFixture } from "../fixtures/open-meteo";

class MemoryCacheStore implements CacheStore {
  private readonly responses = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.responses.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.responses.set(request.url, response.clone());
  }

  seed(key: string, value: unknown, updatedAt: string): void {
    this.responses.set(
      `https://dashboard-cache.invalid/${key}`,
      new Response(JSON.stringify({ value, updatedAt }))
    );
  }
}

function networkFetcher(options: { rail?: Response; weather?: Response } = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("national-rail-api")) {
      return options.rail?.clone() ??
        new Response(JSON.stringify(huxleyFixture));
    }
    if (url.includes("api.open-meteo.com")) {
      return options.weather?.clone() ??
        new Response(JSON.stringify(openMeteoFixture));
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
}

const NOW = new Date("2026-07-28T12:00:31.000Z");
const RAIL_ERROR = "Live departures are temporarily unavailable.";
const WEATHER_ERROR = "Current weather is temporarily unavailable.";

describe("dashboard service", () => {
  it("returns a live dashboard when both providers succeed", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("live");
    expect(dashboard.generatedAt).toBe(NOW.toISOString());
    expect(dashboard.route).toEqual({
      origin: { name: "Watford Junction", crs: "WFJ" },
      destination: { name: "London Euston", crs: "EUS" }
    });
    expect(dashboard.departures).toMatchObject({
      status: "live",
      updatedAt: NOW.toISOString(),
      stale: false,
      error: null
    });
    expect(dashboard.departures.services).toHaveLength(5);
    expect(dashboard.weather).toEqual({
      status: "live",
      updatedAt: NOW.toISOString(),
      stale: false,
      temperatureC: 21.4,
      apparentTemperatureC: 20.8,
      relativeHumidityPercent: 63,
      precipitationMm: 0,
      weatherCode: 2,
      condition: "Partly cloudy",
      windSpeedKph: 12.1,
      windDirectionDegrees: 240,
      error: null
    });
  });

  it("returns stale departures and a partial dashboard when rail refresh fails", async () => {
    const cache = new MemoryCacheStore();
    const cachedServices = normalizeHuxley(huxleyFixture);
    cache.seed(
      "rail",
      cachedServices,
      "2026-07-28T12:00:00.000Z"
    );
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({ rail: new Response("unavailable", { status: 503 }) }),
      cache,
      now: () => NOW
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("partial");
    expect(dashboard.departures).toEqual({
      status: "stale",
      updatedAt: "2026-07-28T12:00:00.000Z",
      stale: true,
      services: cachedServices,
      error: null
    });
    expect(dashboard.weather.status).toBe("live");
  });

  it("returns unavailable departures and a partial dashboard when rail has no fallback", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({ rail: new Response("unavailable", { status: 503 }) }),
      cache: new MemoryCacheStore(),
      now: () => NOW
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("partial");
    expect(dashboard.departures).toEqual({
      status: "unavailable",
      updatedAt: null,
      stale: false,
      services: [],
      error: RAIL_ERROR
    });
    expect(dashboard.weather.status).toBe("live");
    expect(JSON.stringify(dashboard).split(RAIL_ERROR)).toHaveLength(2);
  });

  it("returns an unavailable dashboard when both providers fail without fallback", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        rail: new Response("unavailable", { status: 503 }),
        weather: new Response("unavailable", { status: 503 })
      }),
      cache: new MemoryCacheStore(),
      now: () => NOW
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("unavailable");
    expect(dashboard.departures.error).toBe(RAIL_ERROR);
    expect(dashboard.weather).toEqual({
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
    });
    expect(JSON.stringify(dashboard).split(RAIL_ERROR)).toHaveLength(2);
    expect(JSON.stringify(dashboard).split(WEATHER_ERROR)).toHaveLength(2);
  });

  it("starts both provider requests before either response resolves", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    const requestedUrls: string[] = [];
    const fetcher = ((input: string | URL | Request) => {
      requestedUrls.push(input.toString());
      return new Promise<Response>((resolve) => resolvers.push(resolve));
    }) as typeof fetch;
    const getDashboard = createDashboardService({
      fetcher,
      cache: new MemoryCacheStore(),
      now: () => NOW
    });

    const dashboard = getDashboard();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestedUrls).toHaveLength(2);
    resolvers[0](new Response(JSON.stringify(huxleyFixture)));
    resolvers[1](new Response(JSON.stringify(openMeteoFixture)));
    await expect(dashboard).resolves.toMatchObject({ status: "live" });
  });
});
