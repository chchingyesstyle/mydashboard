import type { ElectricityPriceSlot } from "../../shared/contracts";
import { toLondonIso } from "../time";

const AGILE_RATES_URL =
  "https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/";

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
): ElectricityPriceSlot[] {
  if (typeof response !== "object" || response === null) malformedResponse();

  const results = (response as Record<string, unknown>).results;
  if (!Array.isArray(results)) malformedResponse();

  return results
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null)
    .flatMap((entry): ElectricityPriceSlot[] => {
      const validFrom = stringValue(entry.valid_from);
      const validTo = stringValue(entry.valid_to);
      const price = numberValue(entry.value_inc_vat);
      if (validFrom === null || validTo === null || price === null) return [];
      return [{ validFrom, validTo, pricePencePerKwh: price }];
    })
    .filter((slot) => Date.parse(slot.validTo) > now.getTime())
    .sort((first, second) => Date.parse(first.validFrom) - Date.parse(second.validFrom))
    .slice(0, 24)
    .map((slot) => ({
      validFrom: toLondonIso(slot.validFrom),
      validTo: toLondonIso(slot.validTo),
      pricePencePerKwh: slot.pricePencePerKwh
    }));
}

export async function fetchAgilePrices(
  fetcher: typeof fetch,
  now: Date
): Promise<ElectricityPriceSlot[]> {
  const url = new URL(AGILE_RATES_URL);
  url.searchParams.set("page_size", "48");
  url.searchParams.set("period_from", now.toISOString());
  url.searchParams.set("period_to", new Date(now.getTime() + 13 * 60 * 60_000).toISOString());

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
