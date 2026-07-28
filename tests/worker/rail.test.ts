import { describe, expect, it } from "vitest";
import { fetchDepartures, normalizeHuxley } from "../../src/worker/providers/rail";
import { huxleyFixture } from "../fixtures/huxley";

describe("Huxley rail provider", () => {
  it("normalizes direct Euston departures from every operator", () => {
    const services = normalizeHuxley(huxleyFixture);

    expect(services.map(({ operatorCode }) => operatorCode)).toEqual([
      "LO", "LM", "LM", "LM"
    ]);
    expect(services.map(({ status }) => status)).toEqual([
      "on_time", "on_time", "delayed", "cancelled"
    ]);
    expect(services[3].reason).toBe(
      "This service has been cancelled because of a shortage of train crew"
    );
    expect(services.some(({ platform }) => platform === null)).toBe(true);
  });

  it("requests the configured Watford to Euston endpoint", async () => {
    let requestedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(huxleyFixture));
    }) as typeof fetch;

    await fetchDepartures(fetcher, new Date("2026-07-28T11:55:00.000Z"));

    expect(requestedUrl).toBe(
      "https://national-rail-api.davwheat.dev/departures/WFJ/to/EUS/10"
    );
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchDepartures(fetcher, new Date())).rejects.toThrow(
      "Huxley departures request failed"
    );
  });

  it("throws a provider-specific error for malformed responses", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ generatedAt: "invalid" }))) as typeof fetch;

    await expect(fetchDepartures(fetcher, new Date())).rejects.toThrow(
      "Huxley departures response was malformed"
    );
  });
});
