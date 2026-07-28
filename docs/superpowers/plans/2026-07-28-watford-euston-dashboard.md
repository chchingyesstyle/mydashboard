# Watford Junction to London Euston Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, publish, and deploy a responsive live dashboard for every direct Watford Junction to London Euston train plus current Watford weather.

**Architecture:** A framework-free Vite and TypeScript client consumes a versioned JSON API served by the same Cloudflare Worker. Focused provider modules normalize temporary Huxley rail data and Open-Meteo current conditions; a small cache module supplies independent freshness and stale fallback without changing the public API contract.

**Tech Stack:** TypeScript, Vite, Cloudflare Vite plugin, Cloudflare Workers, Vitest, Testing Library DOM, happy-dom, Playwright, CSS

## Global Constraints

- The public production URL is `https://dashboard.cchk.uk`.
- Show every direct `WFJ` to `EUS` service, including London Overground.
- Show current Watford Junction weather only; do not request or render hourly or daily forecasts.
- Keep `/api/v1/dashboard` compact, versioned, CORS-enabled, and suitable for a future reTerminal E1001 client.
- Use Huxley 2 Community Edition temporarily and isolate it behind a rail provider.
- Use Open-Meteo current conditions behind a weather provider.
- Never commit, print, or expose credentials.
- Use Cloudflare Worker secrets for future provider credentials.
- Keep the implementation framework-free and avoid configuration not required by the approved design.
- Follow test-driven development for production behavior.

---

## File Map

- `package.json`: scripts and development dependencies only.
- `package-lock.json`: reproducible npm dependency resolution.
- `.gitignore`: generated build, test, local environment, and Wrangler state.
- `tsconfig.json`: strict TypeScript settings shared by browser, Worker, and tests.
- `vite.config.ts`: Cloudflare Vite plugin and Vitest configuration.
- `playwright.config.ts`: local production-preview browser test configuration.
- `wrangler.jsonc`: Worker entry point, custom domain, compatibility date, and asset routing.
- `index.html`: semantic application shell and metadata.
- `src/shared/contracts.ts`: stable public API types and route constants.
- `src/worker/time.ts`: Europe/London service-time resolution.
- `src/worker/providers/rail.ts`: Huxley request and normalization.
- `src/worker/providers/weather.ts`: Open-Meteo request and normalization.
- `src/worker/provider-cache.ts`: fresh reads and bounded stale fallback.
- `src/worker/dashboard.ts`: independent provider orchestration and API response assembly.
- `src/worker/index.ts`: Worker request routing, ETag handling, CORS, and static asset fallback.
- `src/app/api.ts`: conditional browser fetch and response validation.
- `src/app/render.ts`: safe DOM rendering for dashboard states.
- `src/app/main.ts`: refresh timer, clock, fullscreen, and manual refresh.
- `src/app/styles.css`: responsive product UI, accessibility, and reduced-motion styling.
- `tests/fixtures/huxley.ts`: complete provider-shaped rail fixtures.
- `tests/fixtures/open-meteo.ts`: complete provider-shaped weather fixture.
- `tests/worker/time.test.ts`: service date and timezone behavior.
- `tests/worker/rail.test.ts`: rail normalization behavior.
- `tests/worker/weather.test.ts`: weather normalization behavior.
- `tests/worker/provider-cache.test.ts`: freshness and stale-fallback behavior.
- `tests/worker/dashboard.test.ts`: independent provider orchestration.
- `tests/worker/index.test.ts`: public HTTP contract.
- `tests/app/api.test.ts`: browser conditional-request behavior.
- `tests/app/render.test.ts`: visible and accessible UI states.
- `tests/e2e/dashboard.spec.ts`: responsive browser and interaction checks.
- `README.md`: local use, architecture, data attribution, deployment, and Darwin migration.

## Task 1: Tooling, Contracts, and Worker Shell

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `wrangler.jsonc`
- Create: `index.html`
- Create: `src/shared/contracts.ts`
- Create: `src/worker/index.ts`
- Create: `tests/worker/index.test.ts`

**Interfaces:**

- Produces: `DashboardPayload`, `Departure`, `DeparturesPanel`, `WeatherPanel`, `PanelStatus`, and `TrainStatus` in `src/shared/contracts.ts`.
- Produces: Worker route `GET /api/v1/dashboard`.
- Produces: npm scripts `dev`, `build`, `preview`, `typecheck`, `test`, `test:e2e`, and `deploy`.

- [ ] **Step 1: Create the minimal project configuration**

Create `package.json` with:

```json
{
  "name": "watford-euston-dashboard",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "npm run build && vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "deploy": "npm run build && wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "latest",
    "@cloudflare/workers-types": "latest",
    "@playwright/test": "latest",
    "@testing-library/dom": "latest",
    "@testing-library/user-event": "latest",
    "happy-dom": "latest",
    "typescript": "latest",
    "vite": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  }
}
```

Use `npm install` to resolve `latest` once into exact versions in `package-lock.json`. Do not retain floating behavior beyond the lockfile.

Create `wrangler.jsonc` with:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "watford-euston-dashboard",
  "main": "./src/worker/index.ts",
  "compatibility_date": "2026-07-28",
  "workers_dev": false,
  "routes": [
    {
      "pattern": "dashboard.cchk.uk",
      "custom_domain": true
    }
  ],
  "assets": {
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"],
    "not_found_handling": "single-page-application"
  },
  "observability": {
    "enabled": true
  }
}
```

Configure strict TypeScript, the Cloudflare Vite plugin, happy-dom for app tests, Playwright preview on port `4173`, and ignore `node_modules/`, `dist/`, `.wrangler/`, `test-results/`, `playwright-report/`, `.dev.vars*`, and `.env*`.

- [ ] **Step 2: Write the failing HTTP-shell test**

Write `tests/worker/index.test.ts`:

```ts
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
    expect((await response.json()).version).toBe(1);
  });
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test -- tests/worker/index.test.ts`

Expected: FAIL because `src/worker/index.ts` and the contracts do not exist.

- [ ] **Step 4: Add the minimal contracts and injectable Worker shell**

Define literal union types:

```ts
export type PanelStatus = "live" | "stale" | "unavailable";
export type TrainStatus = "on_time" | "delayed" | "cancelled" | "unknown";
export type DashboardStatus = "live" | "partial" | "unavailable";
```

Define the complete `DashboardPayload` shape from the approved design. Export:

```ts
export const ROUTE = {
  origin: { name: "Watford Junction", crs: "WFJ" },
  destination: { name: "London Euston", crs: "EUS" }
} as const;
```

Implement `createWorker({ getDashboard, assets })` so only `GET /api/v1/dashboard` returns JSON with CORS and `Cache-Control: public, max-age=15, must-revalidate`; non-API requests use `assets.fetch(request)`. Leave the default production dependency wiring as a function that throws `"Dashboard dependencies are not configured"` until Task 5.

- [ ] **Step 5: Verify GREEN and compile**

Run:

```bash
npm test -- tests/worker/index.test.ts
npm run typecheck
npm run build
```

Expected: all three commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json vite.config.ts playwright.config.ts wrangler.jsonc index.html src/shared/contracts.ts src/worker/index.ts tests/worker/index.test.ts
git commit -m "chore: scaffold Cloudflare dashboard"
```

## Task 2: London Time and Rail Provider

**Files:**

- Create: `src/worker/time.ts`
- Create: `src/worker/providers/rail.ts`
- Create: `tests/fixtures/huxley.ts`
- Create: `tests/worker/time.test.ts`
- Create: `tests/worker/rail.test.ts`

**Interfaces:**

- Produces: `resolveLondonDeparture(time: string, generatedAt: string): string`.
- Produces: `fetchDepartures(fetcher: typeof fetch, now: Date): Promise<Departure[]>`.
- Consumes: `Departure`, `TrainStatus`, and `ROUTE` from `src/shared/contracts.ts`.

- [ ] **Step 1: Write failing time-resolution tests**

Cover BST, winter GMT, and midnight rollover:

```ts
expect(resolveLondonDeparture("12:30", "2026-07-28T11:20:00.000Z"))
  .toBe("2026-07-28T12:30:00+01:00");
expect(resolveLondonDeparture("09:15", "2026-01-28T08:00:00.000Z"))
  .toBe("2026-01-28T09:15:00+00:00");
expect(resolveLondonDeparture("00:10", "2026-07-28T22:55:00.000Z"))
  .toBe("2026-07-29T00:10:00+01:00");
```

- [ ] **Step 2: Run the time test and verify RED**

Run: `npm test -- tests/worker/time.test.ts`

Expected: FAIL because `resolveLondonDeparture` does not exist.

- [ ] **Step 3: Implement London wall-time resolution**

Use `Intl.DateTimeFormat` with `timeZone: "Europe/London"` and `timeZoneName: "longOffset"`. Build an ISO local timestamp with the resolved offset. Treat a service time more than two hours behind the provider generation time as next-day service.

- [ ] **Step 4: Verify the time tests are GREEN**

Run: `npm test -- tests/worker/time.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing rail normalization tests**

Create a complete Huxley fixture that includes:

- A London Overground service to `EUS`
- An on-time LNR service to `EUS`
- A delayed service to `EUS`
- A cancelled service to `EUS`
- A service whose destination is not `EUS`
- A service with no platform

Assert hand-written outcomes:

```ts
const services = normalizeHuxley(huxleyFixture);

expect(services.map(({ operatorCode }) => operatorCode)).toEqual([
  "LO", "LM", "LM", "LM"
]);
expect(services.map(({ status }) => status)).toEqual([
  "on_time", "on_time", "delayed", "cancelled"
]);
expect(services[3].reason).toBe("This service has been cancelled because of a shortage of train crew");
expect(services.some(({ platform }) => platform === null)).toBe(true);
```

Add a fetch test that asserts the exact endpoint:

```ts
expect(requestedUrl).toBe(
  "https://national-rail-api.davwheat.dev/departures/WFJ/to/EUS/10"
);
```

- [ ] **Step 6: Run rail tests and verify RED**

Run: `npm test -- tests/worker/rail.test.ts`

Expected: FAIL because the rail provider does not exist.

- [ ] **Step 7: Implement the minimal Huxley adapter**

Validate that `trainServices` is an array and `generatedAt` is a valid timestamp. Filter destination arrays to `EUS`, map status using cancellation first, `"On time"` second, a valid expected time as delayed, and everything else as unknown. Map missing platform and reason to `null`. Sort by the resolved scheduled timestamp.

`fetchDepartures` uses a 7-second `AbortSignal.timeout(7000)` and throws a provider-specific error for non-2xx or malformed responses.

- [ ] **Step 8: Verify rail tests and full suite**

Run:

```bash
npm test -- tests/worker/time.test.ts tests/worker/rail.test.ts
npm test
npm run typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

```bash
git add src/worker/time.ts src/worker/providers/rail.ts tests/fixtures/huxley.ts tests/worker/time.test.ts tests/worker/rail.test.ts
git commit -m "feat: normalize live Watford departures"
```

## Task 3: Current Weather Provider

**Files:**

- Create: `src/worker/providers/weather.ts`
- Create: `tests/fixtures/open-meteo.ts`
- Create: `tests/worker/weather.test.ts`

**Interfaces:**

- Produces: `fetchWeather(fetcher: typeof fetch, now: Date): Promise<WeatherValue>`.
- Produces: `normalizeWeather(payload: unknown): WeatherValue`.
- Consumes: weather fields from `WeatherPanel`.

- [ ] **Step 1: Write failing current-weather tests**

Use a complete provider fixture with `current_units` and `current`. Assert literal values:

```ts
expect(normalizeWeather(openMeteoFixture)).toEqual({
  temperatureC: 21.4,
  apparentTemperatureC: 20.8,
  relativeHumidityPercent: 63,
  precipitationMm: 0,
  weatherCode: 2,
  condition: "Partly cloudy",
  windSpeedKph: 12.1,
  windDirectionDegrees: 240
});
```

Add weather-code cases for clear, fog, rain, snow, and thunderstorm. Add malformed-payload rejection. Assert the requested URL contains `current=` but does not contain `hourly=` or `daily=`.

- [ ] **Step 2: Run weather tests and verify RED**

Run: `npm test -- tests/worker/weather.test.ts`

Expected: FAIL because `src/worker/providers/weather.ts` does not exist.

- [ ] **Step 3: Implement the Open-Meteo current adapter**

Use fixed Watford Junction coordinates `51.6635,-0.3969`, timezone `Europe/London`, Celsius, and km/h. Request only:

```text
temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m
```

Use a small exhaustive weather-code-to-condition function. Reject missing or non-finite numeric fields. Use a 7-second request timeout.

- [ ] **Step 4: Verify weather tests and full suite**

Run:

```bash
npm test -- tests/worker/weather.test.ts
npm test
npm run typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/worker/providers/weather.ts tests/fixtures/open-meteo.ts tests/worker/weather.test.ts
git commit -m "feat: add current Watford weather"
```

## Task 4: Provider Cache and Stale Fallback

**Files:**

- Create: `src/worker/provider-cache.ts`
- Create: `tests/worker/provider-cache.test.ts`

**Interfaces:**

- Produces:

```ts
export interface CacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface CachedResult<T> {
  value: T;
  updatedAt: string;
  stale: boolean;
}

export function loadWithFallback<T>(options: {
  cache: CacheStore;
  key: string;
  now: Date;
  freshForMs: number;
  staleForMs: number;
  load: () => Promise<T>;
}): Promise<CachedResult<T>>;
```

- [ ] **Step 1: Write failing cache behavior tests**

Use a real in-memory `CacheStore` that stores cloned `Response` objects. Prove:

- A missing value calls `load` and stores the result.
- A fresh value avoids an upstream call.
- A stale-but-eligible value refreshes successfully.
- A stale-but-eligible value returns with `stale: true` when refresh fails.
- An expired value is not returned when refresh fails.

Use exact ages: rail fresh at 29 seconds, stale at 31 seconds, expired after 5 minutes; weather fresh at 9 minutes and expired after 30 minutes.

- [ ] **Step 2: Run cache tests and verify RED**

Run: `npm test -- tests/worker/provider-cache.test.ts`

Expected: FAIL because `loadWithFallback` does not exist.

- [ ] **Step 3: Implement bounded fallback**

Store:

```ts
interface CacheRecord<T> {
  value: T;
  updatedAt: string;
}
```

Use a synthetic HTTPS cache key under `https://dashboard-cache.invalid/`. Write cache responses with `Cache-Control` equal to the stale eligibility window. If cached JSON is malformed, ignore it and call the provider. Never return a value older than `staleForMs`.

- [ ] **Step 4: Verify cache tests and full suite**

Run:

```bash
npm test -- tests/worker/provider-cache.test.ts
npm test
npm run typecheck
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add src/worker/provider-cache.ts tests/worker/provider-cache.test.ts
git commit -m "feat: add bounded provider fallback"
```

## Task 5: Dashboard Orchestration and HTTP Contract

**Files:**

- Create: `src/worker/dashboard.ts`
- Create: `tests/worker/dashboard.test.ts`
- Modify: `src/worker/index.ts`
- Modify: `tests/worker/index.test.ts`

**Interfaces:**

- Produces:

```ts
export function createDashboardService(deps: {
  fetcher: typeof fetch;
  cache: CacheStore;
  now: () => Date;
}): () => Promise<DashboardPayload>;
```

- Produces: ETag and conditional `304` behavior on `GET /api/v1/dashboard`.
- Consumes: rail and weather provider functions and `loadWithFallback`.

- [ ] **Step 1: Write failing orchestration tests**

Test real orchestration with provider-level network responses, not mocked provider functions:

- Both providers succeed: top-level `status` is `live`.
- Rail fails with eligible cache and weather succeeds: departures are `stale`, top-level is `partial`.
- Rail fails without cache and weather succeeds: departures are unavailable, top-level is `partial`.
- Both fail without cache: top-level is `unavailable`.
- Rail and weather calls begin before either is resolved, proving concurrent execution.

Assert user-facing error strings exactly once at the boundary:

```text
Live departures are temporarily unavailable.
Current weather is temporarily unavailable.
```

- [ ] **Step 2: Run dashboard tests and verify RED**

Run: `npm test -- tests/worker/dashboard.test.ts`

Expected: FAIL because `createDashboardService` does not exist.

- [ ] **Step 3: Implement concurrent independent orchestration**

Call the two cached provider loaders in one `Promise.allSettled`. Use rail freshness of 30 seconds and stale eligibility of 5 minutes. Use weather freshness of 10 minutes and stale eligibility of 30 minutes. Assemble the full contract with unavailable panel defaults and the fixed route.

- [ ] **Step 4: Verify orchestration tests are GREEN**

Run: `npm test -- tests/worker/dashboard.test.ts`

Expected: PASS.

- [ ] **Step 5: Extend the HTTP tests for conditional responses**

Add failing assertions for:

- `ETag` exists and is stable for identical payloads.
- `If-None-Match` returns `304` with an empty body.
- `OPTIONS /api/v1/dashboard` returns `204` with CORS headers.
- Unsupported methods return `405`.

- [ ] **Step 6: Run HTTP tests and verify RED**

Run: `npm test -- tests/worker/index.test.ts`

Expected: FAIL because conditional and preflight behavior are missing.

- [ ] **Step 7: Complete the production Worker**

Hash the serialized payload with `crypto.subtle.digest("SHA-256", ...)` and quote the lowercase hex digest for the ETag. Wire the default export to:

```ts
createDashboardService({
  fetcher: fetch,
  cache: caches.default,
  now: () => new Date()
});
```

Pass `env.ASSETS` to the Worker shell for non-API requests.

- [ ] **Step 8: Verify Worker behavior**

Run:

```bash
npm test -- tests/worker/dashboard.test.ts tests/worker/index.test.ts
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 9: Commit**

```bash
git add src/worker/dashboard.ts src/worker/index.ts tests/worker/dashboard.test.ts tests/worker/index.test.ts
git commit -m "feat: serve the dashboard API"
```

## Task 6: Browser Data Client and Accessible Rendering

**Files:**

- Create: `src/app/api.ts`
- Create: `src/app/render.ts`
- Create: `src/app/main.ts`
- Create: `tests/app/api.test.ts`
- Create: `tests/app/render.test.ts`
- Modify: `index.html`

**Interfaces:**

- Produces:

```ts
export function createDashboardClient(fetcher: typeof fetch): {
  load(): Promise<DashboardPayload | null>;
};

export function renderDashboard(
  root: HTMLElement,
  payload: DashboardPayload
): void;
```

- Consumes: `DashboardPayload` and related shared types.

- [ ] **Step 1: Write failing conditional-client tests**

Prove that the first response is returned and its ETag retained, a later request sends `If-None-Match`, and `304` returns `null` without parsing a body. Reject non-2xx and malformed payloads.

- [ ] **Step 2: Run client tests and verify RED**

Run: `npm test -- tests/app/api.test.ts`

Expected: FAIL because `createDashboardClient` does not exist.

- [ ] **Step 3: Implement the minimal browser client**

Fetch only `/api/v1/dashboard`. Store the current ETag in the client closure. Validate contract version `1`, route CRS values `WFJ` and `EUS`, and presence of both panels before returning the payload.

- [ ] **Step 4: Verify client tests are GREEN**

Run: `npm test -- tests/app/api.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing rendering tests**

With happy-dom and Testing Library, prove:

- Route heading is visible.
- London Overground and LNR services are both rendered.
- Scheduled time, expected display, platform, and operator are visible.
- Cancelled service and reason remain visible.
- Missing platform renders `Platform TBC`.
- Current temperature, condition, feels-like, humidity, precipitation, and wind render.
- No forecast heading or list exists.
- Stale panels expose status text and data age.
- Unavailable panels show their error while the other panel remains visible.

Assert semantic regions using roles and accessible names rather than test IDs.

- [ ] **Step 6: Run render tests and verify RED**

Run: `npm test -- tests/app/render.test.ts`

Expected: FAIL because `renderDashboard` does not exist.

- [ ] **Step 7: Implement safe DOM rendering**

Build elements with `document.createElement` and `textContent`; never insert provider text through `innerHTML`. Use static inline SVG only for decorative route, refresh, fullscreen, and weather symbols. Render status with text and a hidden screen-reader expansion where abbreviations occur.

- [ ] **Step 8: Add runtime refresh and controls**

In `main.ts`:

- Render a loading state immediately.
- Load once, then every 30 seconds.
- Update a Europe/London clock every second without refetching.
- Wire the manual refresh button with a temporary disabled state.
- Wire fullscreen enter and exit.
- Preserve the last rendered payload if a browser-level fetch fails and show a connection notice.
- Stop timers on `pagehide`.

- [ ] **Step 9: Verify app tests and full suite**

Run:

```bash
npm test -- tests/app/api.test.ts tests/app/render.test.ts
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 10: Commit**

```bash
git add index.html src/app/api.ts src/app/render.ts src/app/main.ts tests/app/api.test.ts tests/app/render.test.ts
git commit -m "feat: render the live dashboard"
```

## Task 7: Responsive Visual System and Browser Verification

**Files:**

- Create: `src/app/styles.css`
- Create: `tests/e2e/dashboard.spec.ts`
- Modify: `src/app/main.ts`
- Modify: `index.html`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes the semantic DOM from Task 6.
- Produces responsive landscape and phone layouts without changing the API.

- [ ] **Step 1: Load project design context**

Use the impeccable skill before UI implementation. If `PRODUCT.md` or `DESIGN.md` is required by that skill, derive only the approved product and design decisions from the committed specification and do not add product scope.

- [ ] **Step 2: Write failing Playwright behavior tests**

Intercept `/api/v1/dashboard` with a fixed live fixture. At `1440×900`, assert the departure and weather regions are side by side by comparing bounding boxes. At `390×844`, assert weather is above departures and the document has no horizontal overflow.

Also verify:

- Refresh and fullscreen buttons have accessible names.
- Keyboard focus is visible on the refresh button.
- A cancelled row displays text and does not rely only on its color class.
- The page respects reduced-motion emulation.

- [ ] **Step 3: Run the browser tests and verify RED**

Run: `npm run test:e2e`

Expected: FAIL because the visual system is not implemented.

- [ ] **Step 4: Implement the visual system**

Use:

- A tinted charcoal background, never pure black.
- Warm off-white primary text, never pure white.
- Restrained amber for route and timing emphasis.
- Distinct but subdued red and blue-gray state colors with accompanying text.
- A two-column landscape grid near `minmax(0, 2fr) minmax(18rem, 1fr)`.
- A single-column layout below `760px`, with weather ordered before departures.
- Fluid type using `clamp`, tabular numerals for times, and system fonts to avoid runtime font dependencies.
- Full-width departure rows separated by hairlines, not nested cards.
- Visible `:focus-visible` outlines.
- Touch targets of at least 44px.
- Transitions only on opacity and transform, disabled under `prefers-reduced-motion`.

- [ ] **Step 5: Inspect both viewports visually**

Run the preview server, capture landscape and phone screenshots, and inspect them for clipping, overflow, hierarchy, contrast, stale/error clarity, and visual resemblance to an always-on information board without copying hkdashboard assets.

If screenshots reveal a defect, add or tighten a browser assertion before changing the CSS.

- [ ] **Step 6: Verify browser and project checks**

Run:

```bash
npm run test:e2e
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add src/app/styles.css src/app/main.ts index.html playwright.config.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: style the responsive travel board"
```

## Task 8: Documentation, Production Deployment, and Source Publication

**Files:**

- Create: `README.md`
- Modify: project files only if production verification reveals a reproducible defect.

**Interfaces:**

- Produces: documented local, test, deploy, and Darwin migration workflows.
- Produces: production site and API at `dashboard.cchk.uk`.

- [ ] **Step 1: Write operational documentation**

Document:

- Product scope and responsive behavior
- `npm install`, `npm run dev`, and all verification commands
- Temporary Huxley and Open-Meteo data sources
- National Rail and Open-Meteo attribution
- Cloudflare deployment and custom domain
- Future `DARWIN_API_KEY` secret setup
- Exact rail-provider-only migration boundary
- ESP32 use of `/api/v1/dashboard`, ETag, and 304 responses

- [ ] **Step 2: Run fresh pre-deployment verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: tests show zero failures, typecheck and build exit `0`, browser tests pass, `git diff --check` prints nothing, and only intended documentation is uncommitted.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md
git commit -m "docs: add dashboard operations guide"
```

- [ ] **Step 4: Push the reviewed branch**

Use the configured `GITHUB_PAT` without printing it. Push the branch to `origin`, then integrate it into `main` through the finishing workflow selected by the user. Do not force-push.

- [ ] **Step 5: Deploy the saved source state**

Source `CLOUDFLARE_API_TOKEN` without printing it and run:

```bash
npm run deploy
```

Confirm Wrangler reports the Worker and custom domain `dashboard.cchk.uk`.

- [ ] **Step 6: Run production API smoke tests**

Request `https://dashboard.cchk.uk/api/v1/dashboard` and verify:

- HTTP `200`
- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *`
- `ETag` present
- Payload version `1`
- Origin `WFJ` and destination `EUS`
- At least the route metadata and both panel objects exist

Repeat with `If-None-Match` and verify HTTP `304`.

- [ ] **Step 7: Run production page smoke tests**

Open `https://dashboard.cchk.uk` in a browser at landscape and phone widths. Verify the route, current weather region, departures region, responsive order, controls, and absence of horizontal overflow.

- [ ] **Step 8: Fix only reproducible deployment defects**

For each defect, write a failing automated test, verify RED, make the smallest fix, run the relevant test GREEN, then repeat the full verification suite before redeploying.

- [ ] **Step 9: Verify final repository and deployment state**

Run:

```bash
git status --short --branch
git log --oneline --decorate -10
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: clean intended branch, pushed commits visible in history, and every command exits `0`.
