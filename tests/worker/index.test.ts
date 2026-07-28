import { describe, expect, it } from "vitest";
import { createWorker } from "../../src/worker/index";

describe("worker routing", () => {
  it("returns a versioned JSON response for the dashboard API", async () => {
    const worker = createWorker({
      getDashboard: async () => ({
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
          apparentTemperatureC: null,
          relativeHumidityPercent: null,
          precipitationMm: null,
          weatherCode: null,
          condition: null,
          windSpeedKph: null,
          windDirectionDegrees: null,
          error: "Current weather is temporarily unavailable."
        }
      }),
      assets: { fetch: async () => new Response("asset") }
    });

    const response = await worker.fetch(
      new Request("https://dashboard.cchk.uk/api/v1/dashboard")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect((await response.json() as { version: number }).version).toBe(1);
  });
});
