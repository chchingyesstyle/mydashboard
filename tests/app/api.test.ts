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
    error: null
  }
};

describe("dashboard client", () => {
  it("retains the ETag and treats a later 304 as unchanged without parsing it", async () => {
    const notModified = new Response(null, { status: 304 });
    const json = vi.spyOn(notModified, "json");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), {
        headers: { etag: "\"dashboard-v1\"" }
      }))
      .mockResolvedValueOnce(notModified);
    const client = createDashboardClient(fetcher);

    await expect(client.load()).resolves.toEqual(payload);
    await expect(client.load()).resolves.toBeNull();

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/v1/dashboard", {
      headers: {}
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/v1/dashboard", {
      headers: { "If-None-Match": "\"dashboard-v1\"" }
    });
    expect(json).not.toHaveBeenCalled();
  });

  it("rejects non-successful responses", async () => {
    const client = createDashboardClient(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("upstream unavailable", { status: 503 })
      )
    );

    await expect(client.load()).rejects.toThrow(
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

    await expect(client.load()).rejects.toThrow("Malformed dashboard payload");
  });
});
