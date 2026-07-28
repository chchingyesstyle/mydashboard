import { describe, expect, it, vi } from "vitest";
import { fetchDepartures, normalizeDarwin } from "../../src/worker/providers/rail";
import { darwinFixture } from "../fixtures/darwin";

describe("Darwin rail provider", () => {
  it("normalizes direct Euston departures from every operator", () => {
    const services = normalizeDarwin(darwinFixture);

    expect(services.map(({ operatorCode }) => operatorCode)).toEqual([
      "LO", "LM", "LM", "LM", "LM"
    ]);
    expect(services.map(({ status }) => status)).toEqual([
      "on_time", "on_time", "delayed", "cancelled", "unknown"
    ]);
    expect(services[3].reason).toBe(
      "A shortage of train crew"
    );
    expect(services.some(({ platform }) => platform === null)).toBe(true);
  });

  it("resolves both times for a delayed pre-midnight service viewed after midnight", () => {
    const [service] = normalizeDarwin({
      ...darwinFixture,
      generatedAt: "2026-07-28T23:10:00.000Z",
      trainServices: [{
        ...darwinFixture.trainServices[0],
        serviceID: "late-service",
        std: "23:55",
        etd: "00:20"
      }]
    });

    expect(service.scheduledDeparture).toBe("2026-07-28T23:55:00+01:00");
    expect(service.expectedDeparture).toBe("2026-07-29T00:20:00+01:00");
  });

  it("rejects non-ISO generated timestamps", () => {
    expect(() => normalizeDarwin({
      ...darwinFixture,
      generatedAt: "28 July 2026 12:00"
    })).toThrow("Darwin departures response was malformed");
  });

  it("accepts Darwin timestamps with an explicit offset and extended precision", () => {
    expect(normalizeDarwin({
      ...darwinFixture,
      generatedAt: "2026-07-28T17:07:38.8418107+01:00"
    })).toHaveLength(5);
  });

  it("requests every direct Watford to Euston departure through RDM", async () => {
    let request: Request | undefined;
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      request = new Request(input, init);
      return new Response(JSON.stringify(darwinFixture));
    }) as typeof fetch;

    await fetchDepartures(
      fetcher,
      new Date("2026-07-28T11:55:00.000Z"),
      "consumer-key"
    );

    const url = new URL(request!.url);
    expect(url.origin + url.pathname).toBe(
      "https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepartureBoard/WFJ"
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      numRows: "150",
      filterCrs: "EUS",
      filterType: "to",
      timeOffset: "0",
      timeWindow: "120"
    });
    expect(request!.headers.get("x-apikey")).toBe("consumer-key");
    expect(request!.url).not.toContain("consumer-key");
  });

  it("does not call Darwin without a configured API key", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(fetchDepartures(fetcher, new Date(), "")).rejects.toThrow(
      "Darwin API key is not configured"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchDepartures(fetcher, new Date(), "consumer-key")).rejects.toThrow(
      "Darwin departures request failed"
    );
  });

  it("throws a provider-specific error for malformed responses", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ generatedAt: "invalid" }))) as typeof fetch;

    await expect(fetchDepartures(fetcher, new Date(), "consumer-key")).rejects.toThrow(
      "Darwin departures response was malformed"
    );
  });

  it("aborts the Darwin request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const departures = fetchDepartures(fetcher, new Date(), "consumer-key");
    controller.abort();

    await expect(departures).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
