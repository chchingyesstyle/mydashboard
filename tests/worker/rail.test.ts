import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "../../src/shared/contracts";
import { fetchDepartures, normalizeDarwin } from "../../src/worker/providers/rail";
import { darwinFixture, reverseDarwinFixture } from "../fixtures/darwin";

describe("Darwin rail provider", () => {
  it("normalizes direct Euston departures from every operator", () => {
    const services = normalizeDarwin(
      darwinFixture,
      ROUTES["WFJ-EUS"].destination.crs
    );

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
    }, ROUTES["WFJ-EUS"].destination.crs);

    expect(service.scheduledDeparture).toBe("2026-07-28T23:55:00+01:00");
    expect(service.expectedDeparture).toBe("2026-07-29T00:20:00+01:00");
  });

  it("rejects non-ISO generated timestamps", () => {
    expect(() => normalizeDarwin({
      ...darwinFixture,
      generatedAt: "28 July 2026 12:00"
    }, ROUTES["WFJ-EUS"].destination.crs)).toThrow(
      "Darwin departures response was malformed"
    );
  });

  it("accepts Darwin timestamps with an explicit offset and extended precision", () => {
    expect(normalizeDarwin({
      ...darwinFixture,
      generatedAt: "2026-07-28T17:07:38.8418107+01:00"
    }, ROUTES["WFJ-EUS"].destination.crs)).toHaveLength(5);
  });

  it("normalizes every direct Euston to Watford service", () => {
    const services = normalizeDarwin(
      reverseDarwinFixture,
      ROUTES["EUS-WFJ"].destination.crs
    );

    expect(services.map(({ id, operatorCode }) => [id, operatorCode])).toEqual([
      ["reverse-lnr", "LM"],
      ["reverse-overground", "LO"],
      ["reverse-through", "LM"]
    ]);
  });

  it("normalizes each train's actual final destination", () => {
    const forward = normalizeDarwin(
      darwinFixture,
      ROUTES["WFJ-EUS"].destination.crs
    );
    const reverse = normalizeDarwin(
      reverseDarwinFixture,
      ROUTES["EUS-WFJ"].destination.crs
    );

    expect(forward[0].finalDestination).toEqual({
      name: "London Euston",
      crs: "EUS"
    });
    expect(reverse.find(({ id }) => id === "reverse-through")
      ?.finalDestination).toEqual({
      name: "Birmingham New Street",
      crs: "BHM"
    });
  });

  it("uses null when Darwin omits a valid final destination", () => {
    const [service] = normalizeDarwin({
      ...reverseDarwinFixture,
      trainServices: [{
        ...reverseDarwinFixture.trainServices[0],
        destination: [{ locationName: "", crs: "WFJ" }]
      }]
    }, ROUTES["EUS-WFJ"].destination.crs);

    expect(service.finalDestination).toBeNull();
  });

  it("marks Darwin platforms as live and missing platforms as unavailable", () => {
    const services = normalizeDarwin(
      darwinFixture,
      ROUTES["WFJ-EUS"].destination.crs
    );

    expect(services.find(({ id }) => id === "on-time")).toMatchObject({
      platform: "9",
      platformStatus: "live"
    });
    expect(services.find(({ id }) => id === "delayed")).toMatchObject({
      platform: null,
      platformStatus: null
    });
  });

  it("returns an empty list when Darwin omits trainServices for an overnight service gap", () => {
    const { trainServices: _trainServices, ...boardWithoutServices } = darwinFixture;

    const services = normalizeDarwin(
      boardWithoutServices,
      ROUTES["WFJ-EUS"].destination.crs
    );

    expect(services).toEqual([]);
  });

  it("returns an empty list when Darwin sends a null trainServices", () => {
    const services = normalizeDarwin(
      { ...darwinFixture, trainServices: null },
      ROUTES["WFJ-EUS"].destination.crs
    );

    expect(services).toEqual([]);
  });

  it("rejects a trainServices value that is present but not an array", () => {
    expect(() => normalizeDarwin(
      { ...darwinFixture, trainServices: "not-an-array" },
      ROUTES["WFJ-EUS"].destination.crs
    )).toThrow("Darwin departures response was malformed");
  });

  it("rejects a Darwin board filtered to a different destination", () => {
    expect(() => normalizeDarwin(
      { ...reverseDarwinFixture, filtercrs: "EUS" },
      ROUTES["EUS-WFJ"].destination.crs
    )).toThrow("Darwin departures response was malformed");
  });

  it.each([
    ["WFJ-EUS", "WFJ", "EUS"],
    ["EUS-WFJ", "EUS", "WFJ"]
  ] as const)("requests the selected %s Darwin board", async (
    routeId,
    origin,
    destination
  ) => {
    let request: Request | undefined;
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      request = new Request(input, init);
      return new Response(JSON.stringify(
        routeId === "WFJ-EUS" ? darwinFixture : reverseDarwinFixture
      ));
    }) as typeof fetch;

    await fetchDepartures(
      fetcher,
      new Date("2026-07-28T11:55:00.000Z"),
      "consumer-key",
      ROUTES[routeId]
    );

    const url = new URL(request!.url);
    expect(url.pathname.endsWith(`/GetDepartureBoard/${origin}`)).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      numRows: "150",
      filterCrs: destination,
      filterType: "to",
      timeOffset: "0",
      timeWindow: "120"
    });
    expect(request!.headers.get("x-apikey")).toBe("consumer-key");
    expect(request!.url).not.toContain("consumer-key");
  });

  it("does not call Darwin without a configured API key", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(fetchDepartures(
      fetcher,
      new Date(),
      "",
      ROUTES["WFJ-EUS"]
    )).rejects.toThrow(
      "Darwin API key is not configured"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchDepartures(
      fetcher,
      new Date(),
      "consumer-key",
      ROUTES["WFJ-EUS"]
    )).rejects.toThrow("Darwin departures request failed");
  });

  it("throws a provider-specific error for malformed responses", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ generatedAt: "invalid" }))) as typeof fetch;

    await expect(fetchDepartures(
      fetcher,
      new Date(),
      "consumer-key",
      ROUTES["WFJ-EUS"]
    )).rejects.toThrow("Darwin departures response was malformed");
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

    const departures = fetchDepartures(
      fetcher,
      new Date(),
      "consumer-key",
      ROUTES["WFJ-EUS"]
    );
    controller.abort();

    await expect(departures).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
