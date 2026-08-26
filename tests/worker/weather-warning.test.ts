import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "../../src/shared/contracts";
import {
  fetchWeatherWarning,
  normalizeWeatherWarning
} from "../../src/worker/providers/weather-warning";
import {
  meteoalarmActiveAmberCoveringWatford,
  meteoalarmActiveRedCoveringWatford,
  meteoalarmActiveYellowCoveringWatford,
  meteoalarmActiveYellowNotCoveringWatford,
  meteoalarmCancelledYellowCoveringWatford,
  meteoalarmExpiredYellowCoveringWatford,
  meteoalarmFeed,
  meteoalarmTestYellowCoveringWatford
} from "../fixtures/meteoalarm";

const NOW = new Date("2026-08-26T12:00:00.000Z");
const WATFORD = ROUTES["WFJ-EUS"].weather;

describe("MeteoAlarm weather warning provider", () => {
  it("returns the active yellow warning covering the given location", () => {
    const feed = meteoalarmFeed([meteoalarmActiveYellowCoveringWatford]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toEqual({
      level: "yellow",
      event: "Yellow thunderstorm warning",
      headline: "A small risk of flooding and disruption from thunderstorms."
    });
  });

  it("prefers the most severe active warning when several apply", () => {
    const feed = meteoalarmFeed([
      meteoalarmActiveYellowCoveringWatford,
      meteoalarmActiveRedCoveringWatford,
      meteoalarmActiveAmberCoveringWatford
    ]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toEqual({
      level: "red",
      event: "Red wind warning",
      headline: "Danger to life from extremely strong winds."
    });
  });

  it("ignores a warning whose area does not cover the given location", () => {
    const feed = meteoalarmFeed([meteoalarmActiveYellowNotCoveringWatford]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toBeNull();
  });

  it("ignores a warning that has already expired", () => {
    const feed = meteoalarmFeed([meteoalarmExpiredYellowCoveringWatford]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toBeNull();
  });

  it("ignores a cancelled warning", () => {
    const feed = meteoalarmFeed([meteoalarmCancelledYellowCoveringWatford]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toBeNull();
  });

  it("ignores a test warning", () => {
    const feed = meteoalarmFeed([meteoalarmTestYellowCoveringWatford]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toBeNull();
  });

  it("returns null when there are no warnings at all", () => {
    expect(normalizeWeatherWarning(meteoalarmFeed([]), NOW, WATFORD)).toBeNull();
  });

  it("returns null for a malformed response rather than throwing", () => {
    expect(normalizeWeatherWarning({ not: "a feed" }, NOW, WATFORD)).toBeNull();
    expect(normalizeWeatherWarning(null, NOW, WATFORD)).toBeNull();
  });

  it("returns null when a warning's event text has no recognizable colour level", () => {
    const feed = meteoalarmFeed([{
      ...meteoalarmActiveYellowCoveringWatford,
      alert: {
        ...meteoalarmActiveYellowCoveringWatford.alert,
        info: [{
          ...meteoalarmActiveYellowCoveringWatford.alert.info[0],
          event: "Thunderstorm warning"
        }]
      }
    }]);
    expect(normalizeWeatherWarning(feed, NOW, WATFORD)).toBeNull();
  });

  it("fetches the UK MeteoAlarm feed", async () => {
    let requestedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(meteoalarmFeed([meteoalarmActiveYellowCoveringWatford])));
    }) as typeof fetch;

    const result = await fetchWeatherWarning(fetcher, NOW, ROUTES["WFJ-EUS"]);

    expect(requestedUrl).toBe(
      "https://feeds.meteoalarm.org/api/v1/warnings/feeds-united-kingdom"
    );
    expect(result).toEqual({
      level: "yellow",
      event: "Yellow thunderstorm warning",
      headline: "A small risk of flooding and disruption from thunderstorms."
    });
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchWeatherWarning(fetcher, NOW, ROUTES["WFJ-EUS"])).rejects.toThrow(
      "MeteoAlarm request failed"
    );
  });

  it("aborts the MeteoAlarm request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const promise = fetchWeatherWarning(fetcher, NOW, ROUTES["WFJ-EUS"]);
    controller.abort();

    await expect(promise).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
