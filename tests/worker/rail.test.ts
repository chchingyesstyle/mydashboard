import { describe, expect, it, vi } from "vitest";
import { fetchDepartures, normalizeHuxley } from "../../src/worker/providers/rail";
import { huxleyFixture } from "../fixtures/huxley";

describe("Huxley rail provider", () => {
  it("normalizes direct Euston departures from every operator", () => {
    const services = normalizeHuxley(huxleyFixture);

    expect(services.map(({ operatorCode }) => operatorCode)).toEqual([
      "LO", "LM", "LM", "LM", "LM"
    ]);
    expect(services.map(({ status }) => status)).toEqual([
      "on_time", "on_time", "delayed", "cancelled", "unknown"
    ]);
    expect(services[3].reason).toBe(
      "This service has been cancelled because of a shortage of train crew"
    );
    expect(services.some(({ platform }) => platform === null)).toBe(true);
  });

  it("resolves both times for a delayed pre-midnight service viewed after midnight", () => {
    const [service] = normalizeHuxley({
      ...huxleyFixture,
      generatedAt: "2026-07-28T23:10:00.000Z",
      trainServices: [{
        ...huxleyFixture.trainServices[0],
        serviceID: "late-service",
        std: "23:55",
        etd: "00:20"
      }]
    });

    expect(service.scheduledDeparture).toBe("2026-07-28T23:55:00+01:00");
    expect(service.expectedDeparture).toBe("2026-07-29T00:20:00+01:00");
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

  it("aborts the Huxley request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const departures = fetchDepartures(fetcher, new Date());
    controller.abort();

    await expect(departures).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
