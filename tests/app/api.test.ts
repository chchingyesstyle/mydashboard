import { describe, expect, it, vi } from "vitest";
import type { DashboardPayload } from "../../src/shared/contracts";
import { createDashboardClient } from "../../src/app/api";

const payload: DashboardPayload = {
  version: 1,
  generatedAt: "2026-07-28T12:00:00.000Z",
  status: "live",
  route: {
    origin: { name: "Watford Junction", crs: "WFJ" },
    destination: { name: "London Euston", crs: "EUS" }
  },
  departures: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    services: [],
    error: null
  },
  weather: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
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
    dailyForecast: [],
    hourlyForecast: [],
    warning: null,
    error: null
  },
  electricity: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    prices: [],
    todayAveragePencePerKwh: null,
    error: null
  }
};

const reversePayload: DashboardPayload = {
  ...payload,
  route: {
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" }
  },
  weather: {
    ...payload.weather,
    temperatureC: 22.1
  }
};

describe("dashboard client", () => {
  it("keeps payloads and ETags separate for both routes", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), {
        headers: { etag: "\"watford\"" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(reversePayload), {
        headers: { etag: "\"euston\"" }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const client = createDashboardClient(fetcher);

    await expect(client.load("WFJ-EUS")).resolves.toEqual({
      payload,
      changed: true
    });
    await expect(client.load("EUS-WFJ")).resolves.toEqual({
      payload: reversePayload,
      changed: true
    });
    await expect(client.load("WFJ-EUS")).resolves.toEqual({
      payload,
      changed: false
    });
    await expect(client.load("EUS-WFJ")).resolves.toEqual({
      payload: reversePayload,
      changed: false
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/v1/dashboard?route=WFJ-EUS",
      { headers: {} }
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/dashboard?route=EUS-WFJ",
      { headers: {} }
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/dashboard?route=WFJ-EUS",
      { headers: { "If-None-Match": "\"watford\"" } }
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      4,
      "/api/v1/dashboard?route=EUS-WFJ",
      { headers: { "If-None-Match": "\"euston\"" } }
    );
  });

  it("rejects a 304 without a payload cached for that route", async () => {
    const client = createDashboardClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, { status: 304 })
      )
    );

    await expect(client.load("WFJ-EUS")).rejects.toThrow(
      "Dashboard returned 304 without a cached payload"
    );
  });

  it("rejects a payload that does not match the requested route", async () => {
    const client = createDashboardClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(reversePayload))
      )
    );

    await expect(client.load("WFJ-EUS")).rejects.toThrow(
      "Malformed dashboard payload"
    );
  });

  it("does not parse an unchanged response", async () => {
    const notModified = new Response(null, { status: 304 });
    const json = vi.spyOn(notModified, "json");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), {
        headers: { etag: "\"watford\"" }
      }))
      .mockResolvedValueOnce(notModified);
    const client = createDashboardClient(fetcher);

    await client.load("WFJ-EUS");
    await client.load("WFJ-EUS");

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/api/v1/dashboard?route=WFJ-EUS",
      {
        headers: { "If-None-Match": "\"watford\"" }
      }
    );
    expect(json).not.toHaveBeenCalled();
  });

  it("keeps the request free of state when no ETag is cached", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload))
    );
    const client = createDashboardClient(fetcher);

    await client.load("WFJ-EUS");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/dashboard?route=WFJ-EUS",
      {
      headers: {}
      }
    );
  });

  it("rejects non-successful responses", async () => {
    const client = createDashboardClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("upstream unavailable", { status: 503 })
      )
    );

    await expect(client.load("WFJ-EUS")).rejects.toThrow(
      "Dashboard request failed with status 503"
    );
  });

  it.each([
    ["an unsupported contract version", { ...payload, version: 2 }],
    [
      "an unexpected route",
      {
        ...payload,
        route: {
          origin: { name: "Watford Junction", crs: "EUS" },
          destination: { name: "London Euston", crs: "WFJ" }
        }
      }
    ],
    ["a missing panel", { ...payload, weather: undefined }]
  ])("rejects malformed payloads with %s", async (_description, malformed) => {
    const client = createDashboardClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(malformed))
      )
    );

    await expect(client.load("WFJ-EUS")).rejects.toThrow(
      "Malformed dashboard payload"
    );
  });
});
