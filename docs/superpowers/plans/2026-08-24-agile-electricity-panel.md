# Agile Electricity Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `electricity` panel to `GET /api/v1/dashboard`, sourced from Octopus Energy's public Agile standard-unit-rates endpoint for tariff `E-1R-AGILE-24-10-01-A`, following the same independently-cached, live/stale/unavailable panel pattern as the existing departures and weather panels.

**Architecture:** A new `src/worker/providers/agile.ts` (mirroring `rail.ts`/`weather.ts`) normalizes Octopus's response into `ElectricityPriceSlot[]`. `src/worker/dashboard.ts` caches it independently (route-independent cache key `"electricity"`, since Agile pricing is not tied to the WFJ/EUS route) and composes it into `DashboardPayload` alongside departures and weather, without changing the existing top-level `status` roll-up.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest — same as the rest of `src/worker/`.

## Global Constraints

- Octopus endpoint (no auth required):
  `https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/`
- Filter slots to `valid_to > now` (includes the currently active half-hour
  slot, not just future ones), sort ascending by `valid_from`, return at
  most the next 24 slots (12 hours).
- Cache key: `"electricity"` (not per-route). Fresh for 30 minutes, stale
  fallback for up to 3 hours, matching this project's existing
  `loadWithFallback` pattern (see `src/worker/provider-cache.ts`).
- `version` on `DashboardPayload` stays `1` — this is an additive field.
- The existing `dashboardStatus()` roll-up (based on departures + weather
  only) is unchanged. `electricity.status` is independent.
- No changes to `src/app/` (web frontend), `wrangler.jsonc`, or
  `src/worker/index.ts` — no new secret or Worker binding is needed since
  the Octopus endpoint requires no authentication.

---

### Task 1: Octopus Agile provider (`normalizeAgilePrices` and `fetchAgilePrices`)

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `tests/fixtures/octopus-agile.ts`
- Create: `src/worker/providers/agile.ts`
- Create: `tests/worker/agile.test.ts`

**Interfaces:**
- Produces (used by Task 2):
  - `export interface ElectricityPriceSlot { validFrom: string; validTo: string; pricePencePerKwh: number; }`
  - `export interface ElectricityPanel { status: PanelStatus; updatedAt: string | null; stale: boolean; prices: ElectricityPriceSlot[]; error: string | null; }`
  - `export function normalizeAgilePrices(response: unknown, now: Date): ElectricityPriceSlot[]`
  - `export function fetchAgilePrices(fetcher: typeof fetch, now: Date): Promise<ElectricityPriceSlot[]>`

- [ ] **Step 1: Add the contract types**

In `src/shared/contracts.ts`, add after the `WeatherPanel` interface:

```ts
export interface ElectricityPriceSlot {
  validFrom: string;
  validTo: string;
  pricePencePerKwh: number;
}

export interface ElectricityPanel {
  status: PanelStatus;
  updatedAt: string | null;
  stale: boolean;
  prices: ElectricityPriceSlot[];
  error: string | null;
}
```

Then add `electricity: ElectricityPanel;` as a new field on `DashboardPayload`, after the existing `weather: WeatherPanel;` line.

- [ ] **Step 2: Create the fixture**

Create `tests/fixtures/octopus-agile.ts`:

```ts
export const octopusAgileFixture = {
  count: 9,
  next: "https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/?page=2",
  previous: null,
  results: [
    { value_exc_vat: 30.0, value_inc_vat: 31.5, valid_from: "2026-07-28T15:30:00Z", valid_to: "2026-07-28T16:00:00Z", payment_method: null },
    { value_exc_vat: 28.5, value_inc_vat: 29.925, valid_from: "2026-07-28T15:00:00Z", valid_to: "2026-07-28T15:30:00Z", payment_method: null },
    { value_exc_vat: 27.0, value_inc_vat: 28.35, valid_from: "2026-07-28T14:30:00Z", valid_to: "2026-07-28T15:00:00Z", payment_method: null },
    { value_exc_vat: 25.5, value_inc_vat: 26.775, valid_from: "2026-07-28T14:00:00Z", valid_to: "2026-07-28T14:30:00Z", payment_method: null },
    { value_exc_vat: 24.0, value_inc_vat: 25.2, valid_from: "2026-07-28T13:30:00Z", valid_to: "2026-07-28T14:00:00Z", payment_method: null },
    { value_exc_vat: 22.5, value_inc_vat: 23.625, valid_from: "2026-07-28T13:00:00Z", valid_to: "2026-07-28T13:30:00Z", payment_method: null },
    { value_exc_vat: 21.0, value_inc_vat: 22.05, valid_from: "2026-07-28T12:30:00Z", valid_to: "2026-07-28T13:00:00Z", payment_method: null },
    { value_exc_vat: 19.5, value_inc_vat: 20.475, valid_from: "2026-07-28T12:00:00Z", valid_to: "2026-07-28T12:30:00Z", payment_method: null },
    { value_exc_vat: 18.0, value_inc_vat: 18.9, valid_from: "2026-07-28T11:30:00Z", valid_to: "2026-07-28T12:00:00Z", payment_method: null }
  ]
};
```

The last entry (`valid_to: "2026-07-28T12:00:00Z"`) is deliberately expired
relative to the `NOW` used in tests (`2026-07-28T12:00:31.000Z`), to exercise
the exclusion filter. The other 8 entries (from the currently-active
`12:00:00Z`–`12:30:00Z` slot through `15:30:00Z`–`16:00:00Z`) should all be
included.

- [ ] **Step 3: Write the failing tests for `normalizeAgilePrices`**

Create `tests/worker/agile.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchAgilePrices, normalizeAgilePrices } from "../../src/worker/providers/agile";
import { octopusAgileFixture } from "../fixtures/octopus-agile";

const NOW = new Date("2026-07-28T12:00:31.000Z");

describe("Octopus Agile electricity provider", () => {
  it("returns current and future slots sorted ascending, dropping expired ones", () => {
    const slots = normalizeAgilePrices(octopusAgileFixture, NOW);

    expect(slots).toEqual([
      { validFrom: "2026-07-28T12:00:00Z", validTo: "2026-07-28T12:30:00Z", pricePencePerKwh: 20.475 },
      { validFrom: "2026-07-28T12:30:00Z", validTo: "2026-07-28T13:00:00Z", pricePencePerKwh: 22.05 },
      { validFrom: "2026-07-28T13:00:00Z", validTo: "2026-07-28T13:30:00Z", pricePencePerKwh: 23.625 },
      { validFrom: "2026-07-28T13:30:00Z", validTo: "2026-07-28T14:00:00Z", pricePencePerKwh: 25.2 },
      { validFrom: "2026-07-28T14:00:00Z", validTo: "2026-07-28T14:30:00Z", pricePencePerKwh: 26.775 },
      { validFrom: "2026-07-28T14:30:00Z", validTo: "2026-07-28T15:00:00Z", pricePencePerKwh: 28.35 },
      { validFrom: "2026-07-28T15:00:00Z", validTo: "2026-07-28T15:30:00Z", pricePencePerKwh: 29.925 },
      { validFrom: "2026-07-28T15:30:00Z", validTo: "2026-07-28T16:00:00Z", pricePencePerKwh: 31.5 }
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
      { validFrom: "2026-07-28T15:30:00Z", validTo: "2026-07-28T16:00:00Z", pricePencePerKwh: 31.5 }
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
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test -- tests/worker/agile.test.ts`
Expected: FAIL — `Cannot find module '../../src/worker/providers/agile'` (the file doesn't exist yet).

- [ ] **Step 5: Implement `normalizeAgilePrices`**

Create `src/worker/providers/agile.ts`:

```ts
import type { ElectricityPriceSlot } from "../../shared/contracts";

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
    .sort((first, second) => first.validFrom.localeCompare(second.validFrom))
    .slice(0, 24);
}

export async function fetchAgilePrices(
  fetcher: typeof fetch,
  now: Date
): Promise<ElectricityPriceSlot[]> {
  const url = new URL(AGILE_RATES_URL);
  url.searchParams.set("page_size", "48");

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
```

- [ ] **Step 6: Run the tests to verify the normalize tests pass**

Run: `npm test -- tests/worker/agile.test.ts`
Expected: the 4 tests written so far PASS.

- [ ] **Step 7: Write the failing tests for `fetchAgilePrices`**

Add to `tests/worker/agile.test.ts`, inside the existing `describe` block, after the last `it`:

```ts
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
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- tests/worker/agile.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/shared/contracts.ts tests/fixtures/octopus-agile.ts src/worker/providers/agile.ts tests/worker/agile.test.ts
git commit -m "feat: add Octopus Agile electricity price provider"
```

---

### Task 2: Compose the Electricity panel into the dashboard service

**Files:**
- Modify: `src/worker/dashboard.ts`
- Modify: `tests/worker/dashboard.test.ts`

**Interfaces:**
- Consumes: `ElectricityPanel`, `ElectricityPriceSlot`, `fetchAgilePrices` from Task 1.
- Produces: `DashboardPayload.electricity` is populated on every response from `createDashboardService`.

- [ ] **Step 1: Write the failing test for a live electricity panel**

In `tests/worker/dashboard.test.ts`, first extend the shared `networkFetcher` helper so every existing test (which all go through it) keeps working once `createDashboardService` starts requesting the Octopus endpoint. Add this import at the top:

```ts
import { octopusAgileFixture } from "../fixtures/octopus-agile";
```

Then, inside `networkFetcher`, add a branch before the final `throw new Error(...)` line:

```ts
    if (url.includes("api.octopus.energy")) {
      return options.electricity?.clone() ??
        new Response(JSON.stringify(octopusAgileFixture));
    }
```

Change the `networkFetcher` function signature from:

```ts
function networkFetcher(options: {
  rail?: Response;
  weather?: Response;
  rttAccessToken?: Response;
  rttLocation?: Response;
} = {}): typeof fetch {
```

to:

```ts
function networkFetcher(options: {
  rail?: Response;
  weather?: Response;
  electricity?: Response;
  rttAccessToken?: Response;
  rttLocation?: Response;
} = {}): typeof fetch {
```

Now add a new test, after the existing "returns a live dashboard when both providers succeed" test:

```ts
  it("includes a live electricity panel with current and future Agile prices", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.electricity.status).toBe("live");
    expect(dashboard.electricity.updatedAt).toBe(NOW.toISOString());
    expect(dashboard.electricity.stale).toBe(false);
    expect(dashboard.electricity.error).toBeNull();
    expect(dashboard.electricity.prices).toHaveLength(8);
    expect(dashboard.electricity.prices[0]).toEqual({
      validFrom: "2026-07-28T12:00:00Z",
      validTo: "2026-07-28T12:30:00Z",
      pricePencePerKwh: 20.475
    });
  });

  it("keeps departures and weather live when electricity has no fallback", async () => {
    const getDashboard = createDashboardService({
      fetcher: networkFetcher({
        electricity: new Response("unavailable", { status: 503 })
      }),
      cache: new MemoryCacheStore(),
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    const dashboard = await getDashboard();

    expect(dashboard.status).toBe("live");
    expect(dashboard.departures.status).toBe("live");
    expect(dashboard.weather.status).toBe("live");
    expect(dashboard.electricity).toEqual({
      status: "unavailable",
      updatedAt: null,
      stale: false,
      prices: [],
      error: "Electricity prices are temporarily unavailable."
    });
  });

  it("caches electricity independently of route", async () => {
    const cache = new MemoryCacheStore();
    const getDashboard = createDashboardService({
      fetcher: networkFetcher(),
      cache,
      now: () => NOW,
      darwinApiKey: "consumer-key"
    });

    await getDashboard(ROUTES["WFJ-EUS"]);
    await getDashboard(ROUTES["EUS-WFJ"]);

    expect(cache.keys().filter((key) => key === "electricity")).toHaveLength(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/worker/dashboard.test.ts`
Expected: the 3 new tests FAIL (`dashboard.electricity` is `undefined`), and no previously-passing test regresses (confirming the `networkFetcher` extension didn't break anything on its own before the real wiring exists — if any existing test now fails at this step, stop and re-check the `networkFetcher` edit before continuing).

- [ ] **Step 3: Wire the electricity panel into `createDashboardService`**

In `src/worker/dashboard.ts`, add the import:

```ts
import { fetchAgilePrices } from "./providers/agile";
```

and add `type ElectricityPanel` to the existing `import { ... } from "../shared/contracts";` block's type list.

Add the error constant near `RAIL_ERROR`/`WEATHER_ERROR`:

```ts
const ELECTRICITY_ERROR = "Electricity prices are temporarily unavailable.";
```

Add the panel-shaping function, after `weatherPanel`:

```ts
function electricityPanel(
  result: PromiseSettledResult<CachedResult<ElectricityPriceSlot[]>>
): ElectricityPanel {
  if (result.status === "rejected") {
    return {
      status: "unavailable",
      updatedAt: null,
      stale: false,
      prices: [],
      error: ELECTRICITY_ERROR
    };
  }

  return {
    status: result.value.stale ? "stale" : "live",
    updatedAt: result.value.updatedAt,
    stale: result.value.stale,
    prices: result.value.value,
    error: null
  };
}
```

(This needs `ElectricityPriceSlot` imported as a type too, alongside `ElectricityPanel`.)

In the returned function body of `createDashboardService`, change the
`Promise.allSettled` call from:

```ts
    const [railResult, weatherResult, enrichmentResult] = await Promise.allSettled([
      loadWithFallback({
        cache: deps.cache,
        key: `rail:${route.id}`,
        now,
        freshForMs: 30_000,
        staleForMs: 5 * 60_000,
        load: () => fetchDepartures(
          deps.fetcher,
          now,
          deps.darwinApiKey,
          route
        )
      }),
      loadWithFallback({
        cache: deps.cache,
        key: `weather:${route.origin.crs}`,
        now,
        freshForMs: 10 * 60_000,
        staleForMs: 30 * 60_000,
        load: () => fetchWeather(deps.fetcher, now, route)
      }),
      serviceEnrichments
    ]);
```

to:

```ts
    const [railResult, weatherResult, electricityResult, enrichmentResult] = await Promise.allSettled([
      loadWithFallback({
        cache: deps.cache,
        key: `rail:${route.id}`,
        now,
        freshForMs: 30_000,
        staleForMs: 5 * 60_000,
        load: () => fetchDepartures(
          deps.fetcher,
          now,
          deps.darwinApiKey,
          route
        )
      }),
      loadWithFallback({
        cache: deps.cache,
        key: `weather:${route.origin.crs}`,
        now,
        freshForMs: 10 * 60_000,
        staleForMs: 30 * 60_000,
        load: () => fetchWeather(deps.fetcher, now, route)
      }),
      loadWithFallback({
        cache: deps.cache,
        key: "electricity",
        now,
        freshForMs: 30 * 60_000,
        staleForMs: 3 * 60 * 60_000,
        load: () => fetchAgilePrices(deps.fetcher, now)
      }),
      serviceEnrichments
    ]);
```

Then update the panel assembly and `generatedAt` computation, changing:

```ts
    const departures = enrichDepartures(
      departuresPanel(railResult),
      enrichmentResult.status === "fulfilled" ? enrichmentResult.value : []
    );
    const weather = weatherPanel(weatherResult);
    const generatedAt = [departures.updatedAt, weather.updatedAt]
      .filter((updatedAt): updatedAt is string => updatedAt !== null)
      .sort()
      .at(-1) ?? now.toISOString();

    return {
      version: 1,
      generatedAt,
      status: dashboardStatus(departures, weather),
      route: {
        origin: route.origin,
        destination: route.destination
      },
      departures,
      weather
    };
```

to:

```ts
    const departures = enrichDepartures(
      departuresPanel(railResult),
      enrichmentResult.status === "fulfilled" ? enrichmentResult.value : []
    );
    const weather = weatherPanel(weatherResult);
    const electricity = electricityPanel(electricityResult);
    const generatedAt = [departures.updatedAt, weather.updatedAt, electricity.updatedAt]
      .filter((updatedAt): updatedAt is string => updatedAt !== null)
      .sort()
      .at(-1) ?? now.toISOString();

    return {
      version: 1,
      generatedAt,
      status: dashboardStatus(departures, weather),
      route: {
        origin: route.origin,
        destination: route.destination
      },
      departures,
      weather,
      electricity
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/worker/dashboard.test.ts`
Expected: all tests PASS, including the 3 new ones and every pre-existing test in this file.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test`
Run: `npm run typecheck`
Expected: both succeed with no failures or type errors (this confirms `tests/worker/index.test.ts` and everything else is unaffected, since `src/worker/index.ts` was not touched).

- [ ] **Step 6: Commit**

```bash
git add src/worker/dashboard.ts tests/worker/dashboard.test.ts
git commit -m "feat: compose Electricity panel into the dashboard API"
```
