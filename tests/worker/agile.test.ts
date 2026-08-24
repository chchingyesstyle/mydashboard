import { describe, expect, it, vi } from "vitest";
import { fetchAgilePrices, normalizeAgilePrices } from "../../src/worker/providers/agile";
import { octopusAgileFixture } from "../fixtures/octopus-agile";

const NOW = new Date("2026-07-28T12:00:31.000Z");

describe("Octopus Agile electricity provider", () => {
  it("returns current and future slots sorted ascending, dropping expired ones", () => {
    const slots = normalizeAgilePrices(octopusAgileFixture, NOW);

    expect(slots).toEqual([
      { validFrom: "2026-07-28T13:00:00+01:00", validTo: "2026-07-28T13:30:00+01:00", pricePencePerKwh: 20.475 },
      { validFrom: "2026-07-28T13:30:00+01:00", validTo: "2026-07-28T14:00:00+01:00", pricePencePerKwh: 22.05 },
      { validFrom: "2026-07-28T14:00:00+01:00", validTo: "2026-07-28T14:30:00+01:00", pricePencePerKwh: 23.625 },
      { validFrom: "2026-07-28T14:30:00+01:00", validTo: "2026-07-28T15:00:00+01:00", pricePencePerKwh: 25.2 },
      { validFrom: "2026-07-28T15:00:00+01:00", validTo: "2026-07-28T15:30:00+01:00", pricePencePerKwh: 26.775 },
      { validFrom: "2026-07-28T15:30:00+01:00", validTo: "2026-07-28T16:00:00+01:00", pricePencePerKwh: 28.35 },
      { validFrom: "2026-07-28T16:00:00+01:00", validTo: "2026-07-28T16:30:00+01:00", pricePencePerKwh: 29.925 },
      { validFrom: "2026-07-28T16:30:00+01:00", validTo: "2026-07-28T17:00:00+01:00", pricePencePerKwh: 31.5 }
    ]);
  });

  it("skips a slot missing required fields but keeps the rest", () => {
    const payload = {
      ...octopusAgileFixture,
      results: [
        { value_exc_vat: 30.0, value_inc_vat: 31.5, valid_from: "2026-07-28T15:30:00Z", valid_to: "2026-07-28T16:00:00Z", payment_method: null },
        { value_exc_vat: 28.5, value_inc_vat: null, valid_from: "2026-07-28T15:00:00Z", valid_to: "2026-07-28T15:30:00Z", payment_method: null }
      ]
    };

    expect(normalizeAgilePrices(payload, NOW)).toEqual([
      { validFrom: "2026-07-28T16:30:00+01:00", validTo: "2026-07-28T17:00:00+01:00", pricePencePerKwh: 31.5 }
    ]);
  });

  it("rejects a response with no results array", () => {
    expect(() => normalizeAgilePrices({ count: 0 }, NOW)).toThrow(
      "Octopus Agile response was malformed"
    );
  });

  it("rejects a non-object response", () => {
    expect(() => normalizeAgilePrices(null, NOW)).toThrow(
      "Octopus Agile response was malformed"
    );
  });

  it("requests the configured Agile tariff endpoint", async () => {
    let requestedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(octopusAgileFixture));
    }) as typeof fetch;

    await fetchAgilePrices(fetcher, NOW);

    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe(
      "https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/"
    );
    expect(url.searchParams.get("page_size")).toBe("48");
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchAgilePrices(fetcher, NOW)).rejects.toThrow(
      "Octopus Agile request failed"
    );
  });

  it("throws a provider-specific error for a malformed response", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ count: 0 }))) as typeof fetch;

    await expect(fetchAgilePrices(fetcher, NOW)).rejects.toThrow(
      "Octopus Agile response was malformed"
    );
  });

  it("aborts the Agile request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const prices = fetchAgilePrices(fetcher, NOW);
    controller.abort();

    await expect(prices).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
