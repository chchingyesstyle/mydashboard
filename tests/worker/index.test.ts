import { describe, expect, it } from "vitest";
import type { DashboardPayload } from "../../src/shared/contracts";
import { createWorker } from "../../src/worker/index";

const payload: DashboardPayload = {
  version: 1,
  generatedAt: "2026-07-28T12:00:00.000Z",
  status: "unavailable",
  route: {
    origin: { name: "Watford Junction", crs: "WFJ" },
    destination: { name: "London Euston", crs: "EUS" }
  },
  departures: {
    status: "unavailable",
    updatedAt: null,
    stale: false,
    services: [],
    error: "Live departures are temporarily unavailable."
  },
  weather: {
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
    error: "Current weather is temporarily unavailable."
  }
};

function worker() {
  return createWorker({
    getDashboard: async () => payload,
    assets: { fetch: async () => new Response("asset") }
  });
}

describe("worker routing", () => {
  it("returns a versioned JSON response for the dashboard API", async () => {
    const response = await worker().fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect((await response.json() as { version: number }).version).toBe(1);
  });

  it("returns a stable SHA-256 ETag for an identical payload", async () => {
    const first = await worker().fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );
    const second = await worker().fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );

    expect(first.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
  });

  it("returns an empty 304 response when If-None-Match matches", async () => {
    const runningWorker = worker();
    const first = await runningWorker.fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );
    const response = await runningWorker.fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard", {
        headers: { "if-none-match": first.headers.get("etag")! }
      })
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toBe("");
  });

  it("returns 304 when Cloudflare forwards a weak matching ETag", async () => {
    const runningWorker = worker();
    const first = await runningWorker.fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );
    const response = await runningWorker.fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard", {
        headers: { "if-none-match": `W/${first.headers.get("etag")}` }
      })
    );

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
  });

  it("answers dashboard preflight requests with CORS headers", async () => {
    const response = await worker().fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard", {
        method: "OPTIONS"
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("If-None-Match");
    expect(await response.text()).toBe("");
  });

  it("rejects unsupported dashboard API methods", async () => {
    const response = await worker().fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard", {
        method: "POST"
      })
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
