import { describe, expect, it } from "vitest";
import { ROUTES } from "../../src/shared/contracts";
import { createDashboardService } from "../../src/worker/dashboard";
import type { CacheStore } from "../../src/worker/provider-cache";
import { normalizeDarwin } from "../../src/worker/providers/rail";
import { darwinFixture, reverseDarwinFixture } from "../fixtures/darwin";
import { octopusAgileFixture } from "../fixtures/octopus-agile";
import { openMeteoFixture } from "../fixtures/open-meteo";
import { bbcNewsFixture } from "../fixtures/bbc-news";
import { rthkNewsFixture } from "../fixtures/rthk-news";
import {
  rttAccessTokenFixture,
  rttDashboardLocationFixture,
  rttReverseLocationFixture
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
      `https://dashboard-cache.invalid/${encodeURIComponent(key)}`,
      new Response(JSON.stringify({ value, updatedAt }))
    );
  }

  keys(): string[] {
    return [...this.responses.keys()].map((url) =>
      decodeURIComponent(new URL(url).pathname.slice(1))
    );
  }
}

function networkFetcher(options: {
  rail?: Response;
  weather?: Response;
  weatherWarning?: Response;
  electricity?: Response;
  hongKongNews?: Response;
  unitedKingdomNews?: Response;
  rttAccessToken?: Response;
  rttLocation?: Response;
} = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input.toString();
    if (url.includes("api1.raildata.org.uk")) {
      return options.rail?.clone() ??
        new Response(JSON.stringify(
          new URL(url).pathname.endsWith("/EUS")
            ? reverseDarwinFixture
            : darwinFixture
        ));
    }
    if (url.includes("api.open-meteo.com")) {
      return options.weather?.clone() ??
        new Response(JSON.stringify(openMeteoFixture));
    }
    if (url.includes("feeds.meteoalarm.org")) {
      return options.weatherWarning?.clone() ??
        new Response(JSON.stringify({ warnings: [] }));
    }
    if (url.includes("data.rtt.io/api/get_access_token")) {
      return options.rttAccessToken?.clone() ??
        new Response(JSON.stringify(rttAccessTokenFixture));
    }
    if (url.includes("data.rtt.io/rtt/location")) {
      return options.rttLocation?.clone() ??
        new Response(JSON.stringify(
          new URL(url).searchParams.get("code") === "gb-nr:EUS"
            ? rttReverseLocationFixture
            : rttDashboardLocationFixture
        ));
    }
    if (url.includes("api.octopus.energy")) {
      return options.electricity?.clone() ??
        new Response(JSON.stringify(octopusAgileFixture));
    }
    if (url === "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml") {
      return options.hongKongNews?.clone() ?? new Response(rthkNewsFixture);
    }
    if (url === "https://feeds.bbci.co.uk/news/rss.xml") {
      return options.unitedKingdomNews?.clone() ?? new Response(bbcNewsFixture);
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
    expect(dashboard.weather).toMatchObject({
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
    expect(dashboard.weather.dailyForecast).toHaveLength(7);
    expect(dashboard.weather.hourlyForecast).toHaveLength(12);
    expect(dashboard.news).toMatchObject({
      hongKong: {
        status: "live",
        updatedAt: NOW.toISOString(),
        stale: false,
        source: "RTHK News",
        error: null
      },
      unitedKingdom: {
        status: "live",
        updatedAt: NOW.toISOString(),
        stale: false,
        source: "BBC News",
        error: null
      }
    });
    expect(dashboard.news.hongKong.topStories).toHaveLength(2);
    expect(dashboard.news.hongKong.latestStories).toHaveLength(3);
    expect(dashboard.news.unitedKingdom.topStories).toHaveLength(2);
    expect(dashboard.news.unitedKingdom.latestStories).toHaveLength(3);
  });

  it("caches both RSS panels independently of route for five minutes", async () => {
    const cache = new MemoryCacheStore();
    let now = NOW;
    let rssRequests = 0;
    const baseFetcher = networkFetcher();
    const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
      if (input.toString().includes("rthk.hk") || input.toString().includes("feeds.bbci.co.uk")) {
        rssRequests += 1;
      }
      return baseFetcher(input, init);
    }) as typeof fetch;
    const getDashboard = createDashboardService({
      fetcher,
      cache,
      now: () => now,
      darwinApiKey: "consumer-key"
    });

    await getDashboard(ROUTES["WFJ-EUS"]);
    now = new Date(NOW.getTime() + (4 * 60_000));
    await getDashboard(ROUTES["EUS-WFJ"]);

    expect(rssRequests).toBe(2);
    expect(cache.keys()).toEqual(expect.arrayContaining([
      "news:hong-kong",
      "news:united-kingdom"
    ]));

    now = new Date(NOW.getTime() + (5 * 60_000));
    await getDashboard(ROUTES["WFJ-ALL"]);
    expect(rssRequests).toBe(4);
  });

  it("keeps dashboard status live when a news panel is unavailable", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        hongKongNews: new Response("unavailable", { status: 503 })
      }),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("live");
    expect(dashboard.news.hongKong).toEqual({
      status: "unavailable",
      updatedAt: null,
      stale: false,
      source: "RTHK News",
      topStories: [],
      latestStories: [],
      error: "Hong Kong news is temporarily unavailable."
    });
    expect(dashboard.news.unitedKingdom.status).toBe("live");
  });

  it("returns stale news for up to sixty minutes after a failed refresh", async () => {
    const cache = new MemoryCacheStore();
    let now = NOW;
    let failHongKongNews = false;
    const baseFetcher = networkFetcher();
    const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
      if (failHongKongNews && input.toString().includes("rthk.hk")) {
        return Promise.resolve(new Response("unavailable", { status: 503 }));
      }
      return baseFetcher(input, init);
    }) as typeof fetch;
    const getDashboard = createDashboardService({
      fetcher,
      cache,
      now: () => now,
      darwinApiKey: "consumer-key"
    });

    await getDashboard();
    failHongKongNews = true;
    now = new Date(NOW.getTime() + (6 * 60_000));
    const stale = await getDashboard();
    now = new Date(NOW.getTime() + (61 * 60_000));
    const unavailable = await getDashboard();

    expect(stale.news.hongKong).toMatchObject({
      status: "stale",
      updatedAt: NOW.toISOString(),
      stale: true
    });
    expect(unavailable.news.hongKong.status).toBe("unavailable");
    expect(unavailable.status).toBe("live");
  });

  it("includes a live electricity panel with current and future Agile prices", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.electricity.status).toBe("live");
    expect(dashboard.electricity.updatedAt).toBe(NOW.toISOString());
    expect(dashboard.electricity.stale).toBe(false);
    expect(dashboard.electricity.error).toBeNull();
    expect(dashboard.electricity.prices).toHaveLength(8);
    expect(dashboard.electricity.prices[0]).toEqual({
      validFrom: "2026-07-28T13:00:00+01:00",
      validTo: "2026-07-28T13:30:00+01:00",
      pricePencePerKwh: 20.475
    });
    expect(dashboard.electricity.todayAveragePencePerKwh).toBeCloseTo(25.2, 10);
  });

  it("keeps departures and weather live when electricity has no fallback", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        electricity: new Response("unavailable", { status: 503 })
      }),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("live");
    expect(dashboard.departures.status).toBe("live");
    expect(dashboard.weather.status).toBe("live");
    expect(dashboard.electricity).toEqual({
      status: "unavailable",
      updatedAt: null,
      stale: false,
      prices: [],
      todayAveragePencePerKwh: null,
      error: "Electricity prices are temporarily unavailable."
    });
  });

  it("caches electricity independently of route", async () => {
    const cache = new MemoryCacheStore();
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    await getDashboard(ROUTES["WFJ-EUS"]);
    await getDashboard(ROUTES["EUS-WFJ"]);

    expect(cache.keys().filter((key) => key === "electricity")).toHaveLength(1);
  });

  it.each([
    ["WFJ-EUS", "WFJ", "EUS"],
    ["EUS-WFJ", "EUS", "WFJ"]
  ] as const)("returns the selected %s payload", async (
    routeId,
    origin,
    destination
  ) => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard(ROUTES[routeId]);

    expect(dashboard.version).toBe(1);
    expect(dashboard.route.origin.crs).toBe(origin);
    expect(dashboard.route.destination.crs).toBe(destination);
  });

  it("keeps rail, weather, and RTT enrichment caches separate by route", async () => {
    const cache = new MemoryCacheStore();
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    await getDashboard(ROUTES["WFJ-EUS"]);
    await getDashboard(ROUTES["EUS-WFJ"]);

    expect(cache.keys()).toEqual(expect.arrayContaining([
      "rail:WFJ-EUS",
      "rail:EUS-WFJ",
      "weather:WFJ",
      "weather:EUS",
      "rtt-enrichment:WFJ-EUS",
      "rtt-enrichment:EUS-WFJ"
    ]));
  });

  it("does not use a Watford rail fallback for an Euston request", async () => {
    const cache = new MemoryCacheStore();
    cache.seed(
      "rail:WFJ-EUS",
      normalizeDarwin(darwinFixture, ROUTES["WFJ-EUS"].destination.crs),
      "2026-07-28T12:00:00.000Z"
    );
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        rail: new Response("unavailable", { status: 503 })
      }),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard(ROUTES["EUS-WFJ"]);

    expect(dashboard.departures.status).toBe("unavailable");
    expect(dashboard.departures.services).toEqual([]);
  });

  it("adds reverse coach counts without changing direct services", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    const dashboard = await getDashboard(ROUTES["EUS-WFJ"]);

    expect(dashboard.departures.services.find(
      ({ id }) => id === "reverse-lnr"
    )?.coachCount).toBe(8);
    expect(dashboard.departures.services.some(
      ({ operatorCode }) => operatorCode === "LO"
    )).toBe(true);
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

  it("uses Darwin, RTT actual, then RTT planned platform priority", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key",
      rttApiToken: "refresh-token"
    });

    const services = (await getDashboard()).departures.services;

    expect(services.find(({ id }) => id === "on-time")).toMatchObject({
      platform: "9",
      platformStatus: "live"
    });
    expect(services.find(({ id }) => id === "delayed")).toMatchObject({
      platform: "6",
      platformStatus: "live",
      coachCount: null
    });
    expect(services.find(({ id }) => id === "unknown")).toMatchObject({
      platform: "5",
      platformStatus: "planned"
    });
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
    expect(dashboard.departures.services.every((service) =>
      service.platform === null
        ? service.platformStatus === null
        : service.platformStatus === "live"
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

  it("refreshes RTT enrichment no more often than every five minutes", async () => {
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
    cache.seed("weather:WFJ", {
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
    cache.seed("weather:WFJ", {
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

  it("normalizes a cached weather value created before daily/hourly forecasts were added", async () => {
    const cache = new MemoryCacheStore();
    cache.seed("weather:WFJ", {
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
      dailyForecast: [],
      hourlyForecast: []
    });
    expect(Object.hasOwn(dashboard.weather, "dailyForecast")).toBe(true);
    expect(Object.hasOwn(dashboard.weather, "hourlyForecast")).toBe(true);
  });

  it("returns stale departures and a partial dashboard when rail refresh fails", async () => {
    const cache = new MemoryCacheStore();
    const cachedServices = normalizeDarwin(
      darwinFixture,
      ROUTES["WFJ-EUS"].destination.crs
    );
    cache.seed(
      "rail:WFJ-EUS",
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
      dailyForecast: [],
      hourlyForecast: [],
      warning: null,
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

    expect(requestedUrls).toHaveLength(6);
    resolvers[0](new Response(JSON.stringify(darwinFixture)));
    resolvers[1](new Response(JSON.stringify(openMeteoFixture)));
    resolvers[2](new Response(JSON.stringify({ warnings: [] })));
    resolvers[3](new Response(JSON.stringify(octopusAgileFixture)));
    resolvers[4](new Response(rthkNewsFixture));
    resolvers[5](new Response(bbcNewsFixture));
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
