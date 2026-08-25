import type { ElectricityPriceSlot } from "../../shared/contracts";
import { londonDayBoundsUtc, toLondonIso } from "../time";

const AGILE_RATES_URL =
  "https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/";

export interface AgileNormalizedResult {
  prices: ElectricityPriceSlot[];
  todayAveragePencePerKwh: number | null;
}

function malformedResponse(): never {
  throw new Error("Octopus Agile response was malformed");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeAgilePrices(
  response: unknown,
  now: Date
): AgileNormalizedResult {
  if (typeof response !== "object" || response === null) malformedResponse();

  const results = (response as Record<string, unknown>).results;
  if (!Array.isArray(results)) malformedResponse();

  const rawSlots = results
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null)
    .flatMap((entry): Array<{ validFrom: string; validTo: string; pricePencePerKwh: number }> => {
      const validFrom = stringValue(entry.valid_from);
      const validTo = stringValue(entry.valid_to);
      const price = numberValue(entry.value_inc_vat);
      if (validFrom === null || validTo === null || price === null) return [];
      return [{ validFrom, validTo, pricePencePerKwh: price }];
    });

  const { startUtc, endUtcExclusive } = londonDayBoundsUtc(now);
  const startEpoch = Date.parse(startUtc);
  const endEpochExclusive = Date.parse(endUtcExclusive);
  const todaySlots = rawSlots.filter((slot) => {
    const epoch = Date.parse(slot.validFrom);
    return epoch >= startEpoch && epoch < endEpochExclusive;
  });
  const todayAveragePencePerKwh = todaySlots.length > 0
    ? todaySlots.reduce((total, slot) => total + slot.pricePencePerKwh, 0) / todaySlots.length
    : null;

  const prices = rawSlots
    .filter((slot) => Date.parse(slot.validTo) > now.getTime())
    .sort((first, second) => Date.parse(first.validFrom) - Date.parse(second.validFrom))
    .slice(0, 24)
    .map((slot) => ({
      validFrom: toLondonIso(slot.validFrom),
      validTo: toLondonIso(slot.validTo),
      pricePencePerKwh: slot.pricePencePerKwh
    }));

  return { prices, todayAveragePencePerKwh };
}

export async function fetchAgilePrices(
  fetcher: typeof fetch,
  now: Date
): Promise<AgileNormalizedResult> {
  const url = new URL(AGILE_RATES_URL);
  // A large page_size is a deliberate safety margin: Octopus can publish up
  // to ~2 days of future half-hour slots, and this guarantees today's full
  // day plus the near future is covered in a single page regardless of how
  // far ahead publishing has reached, without depending on period_to
  // pagination behavior being reliable for every caller.
  url.searchParams.set("page_size", "150");
  url.searchParams.set("period_from", londonDayBoundsUtc(now).startUtc);

  const response = await fetcher(url, { signal: AbortSignal.timeout(7000) });

  if (!response.ok) {
    throw new Error("Octopus Agile request failed");
  }

  try {
    return normalizeAgilePrices(await response.json(), now);
  } catch (error) {
    if (error instanceof Error && error.message === "Octopus Agile response was malformed") {
      throw error;
    }
    throw new Error("Octopus Agile response was malformed");
  }
}
