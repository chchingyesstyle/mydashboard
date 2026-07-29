import { describe, expect, it } from "vitest";
import { createDashboardService } from "../../src/worker/dashboard";
import type { CacheStore } from "../../src/worker/provider-cache";
import { normalizeDarwin } from "../../src/worker/providers/rail";
import { darwinFixture } from "../fixtures/darwin";
import { openMeteoFixture } from "../fixtures/open-meteo";
import {
  rttAccessTokenFixture,
  rttDashboardLocationFixture
} from "../fixtures/rtt";

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

function networkFetcher(options: {
  rail?: Response;
  weather?: Response;
  rttAccessToken?: Response;
  rttLocation?: Response;
} = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("api1.raildata.org.uk")) {
      return options.rail?.clone() ??
        new Response(JSON.stringify(darwinFixture));
    }
    if (url.includes("api.open-meteo.com")) {
      return options.weather?.clone() ??
        new Response(JSON.stringify(openMeteoFixture));
    }
    if (url.includes("data.rtt.io/api/get_access_token")) {
      return options.rttAccessToken?.clone() ??
        new Response(JSON.stringify(rttAccessTokenFixture));
    }
    if (url.includes("data.rtt.io/rtt/location")) {
      return options.rttLocation?.clone() ??
        new Response(JSON.stringify(rttDashboardLocationFixture));
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
      now: () => NOW,
      darwinApiKey: "consumer-key"
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
      temperatureMinTodayC: 13.2,
      temperatureMaxTodayC: 26.8,
      apparentTemperatureC: 20.8,
      relativeHumidityPercent: 63,
      precipitationMm: 0,
      rainChanceNext6HoursPercent: 60,
      weatherCode: 2,
      condition: "Partly cloudy",
      windSpeedKph: 12.1,
      windDirectionDegrees: 240,
      pressureMslHpa: 1016.4,
      error: null
    });
  });

  it("adds RTT coach counts to matching Darwin departures only", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    const dashboard = await getDashboard();
    const matchingService = dashboard.departures.services.find((service) =>
      service.scheduledDeparture === "2026-07-28T12:10:00+01:00" &&
      service.operatorCode === "LM"
    );

    expect(matchingService?.coachCount).toBe(10);
    expect(dashboard.departures.services
      .filter((service) => service !== matchingService)
      .every((service) => service.coachCount === null)
    ).toBe(true);
  });

  it("keeps live Darwin departures when RTT is unavailable", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        rttLocation: new Response("unavailable", { status: 503 })
      }),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    const dashboard = await getDashboard();

    expect(dashboard.departures.status).toBe("live");
    expect(dashboard.departures.services.every(
      (service) => service.coachCount === null
    )).toBe(true);
  });

  it("keeps a fully cached dashboard snapshot unchanged", async () => {
    const cache = new MemoryCacheStore();
    let now = NOW;
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => now,
      darwinApiKey: "consumer-key"
    });

    const first = await getDashboard();
    now = new Date("2026-07-28T12:00:32.000Z");
    const second = await getDashboard();

    expect(second).toEqual(first);
  });

  it("refreshes RTT coach counts no more often than every five minutes", async () => {
    let now = NOW;
    let rttLocationRequests = 0;
    const baseFetcher = networkFetcher();
    const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
      if (input.toString().includes("data.rtt.io/rtt/location")) {
        rttLocationRequests += 1;
      }
      return baseFetcher(input, init);
    }) as typeof fetch;
    const getDashboard = createDashboardService({
      fetcher,
      cache: new MemoryCacheStore(),
      now: () => now,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    const first = await getDashboard();
    now = new Date(NOW.getTime() + (4 * 60_000));
    const cached = await getDashboard();
    expect(rttLocationRequests).toBe(1);
    expect(first.departures.services.find(
      (service) => service.scheduledDeparture === "2026-07-28T12:10:00+01:00"
    )?.coachCount).toBe(10);
    expect(cached.departures.services.find(
      (service) => service.scheduledDeparture === "2026-07-28T12:10:00+01:00"
    )?.coachCount).toBe(10);

    now = new Date(NOW.getTime() + (5 * 60_000));
    await getDashboard();
    expect(rttLocationRequests).toBe(2);
  });

  it("normalizes a cached weather value created before rain chance was added", async () => {
    const cache = new MemoryCacheStore();
    cache.seed("weather-v2", {
      temperatureC: 21.4,
      apparentTemperatureC: 20.8,
      relativeHumidityPercent: 63,
      precipitationMm: 0,
      weatherCode: 2,
      condition: "Partly cloudy",
      windSpeedKph: 12.1,
      windDirectionDegrees: 240,
      pressureMslHpa: 1016.4
    }, NOW.toISOString());
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.weather).toMatchObject({
      status: "live",
      temperatureC: 21.4,
      rainChanceNext6HoursPercent: null
    });
  });

  it("normalizes a cached weather value created before today temperatures were added", async () => {
    const cache = new MemoryCacheStore();
    cache.seed("weather-v2", {
      temperatureC: 21.4,
      apparentTemperatureC: 20.8,
      relativeHumidityPercent: 63,
      precipitationMm: 0,
      rainChanceNext6HoursPercent: 60,
      weatherCode: 2,
      condition: "Partly cloudy",
      windSpeedKph: 12.1,
      windDirectionDegrees: 240,
      pressureMslHpa: 1016.4
    }, NOW.toISOString());
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.weather).toMatchObject({
      status: "live",
      temperatureMinTodayC: null,
      temperatureMaxTodayC: null
    });
    expect(Object.hasOwn(dashboard.weather, "temperatureMinTodayC")).toBe(true);
    expect(Object.hasOwn(dashboard.weather, "temperatureMaxTodayC")).toBe(true);
  });

  it("returns stale departures and a partial dashboard when rail refresh fails", async () => {
    const cache = new MemoryCacheStore();
    const cachedServices = normalizeDarwin(darwinFixture);
    cache.seed(
      "rail",
      cachedServices,
      "2026-07-28T12:00:00.000Z"
    );
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({ rail: new Response("unavailable", { status: 503 }) }),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
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
      now: () => NOW,
      darwinApiKey: "consumer-key"
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
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("unavailable");
    expect(dashboard.departures.error).toBe(RAIL_ERROR);
    expect(dashboard.weather).toEqual({
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
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = getDashboard();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestedUrls).toHaveLength(2);
    resolvers[0](new Response(JSON.stringify(darwinFixture)));
    resolvers[1](new Response(JSON.stringify(openMeteoFixture)));
    await expect(dashboard).resolves.toMatchObject({ status: "live" });
  });

  it("passes the configured Darwin key only in the upstream header", async () => {
    let request: Request | undefined;
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const candidate = new Request(input, init);
      if (candidate.url.includes("api1.raildata.org.uk")) {
        request = candidate;
        return new Response(JSON.stringify(darwinFixture));
      }
      return new Response(JSON.stringify(openMeteoFixture));
    }) as typeof fetch;

    await createDashboardService({
      fetcher,
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    })();

    expect(request!.headers.get("x-apikey")).toBe("consumer-key");
    expect(request!.url).not.toContain("consumer-key");
  });
});
