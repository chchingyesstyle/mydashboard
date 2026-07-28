# Darwin Rail, Air Pressure, and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Huxley with the subscribed Darwin Live Departure Board API, add current mean sea-level pressure to the shared dashboard, and stop stale-age updates from repeatedly announcing to screen-reader users.

**Architecture:** Keep the existing provider-neutral `/api/v1/dashboard` boundary and independent caches. Replace only the rail adapter and its Worker secret wiring, extend the current-weather value additively with `pressureMslHpa`, and split static stale announcements from the non-live ticking age.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, Rail Data Marketplace Darwin JSON API, Open-Meteo, Vitest, Testing Library DOM, happy-dom, Playwright

## Global Constraints

- The production URL remains `https://dashboard.cchk.uk`.
- Show every direct `WFJ` to `EUS` service returned in the next 120 minutes, including London Overground.
- Darwin is the only runtime rail provider; do not retain a Huxley fallback.
- Send the Darwin Consumer key only in the `x-apikey` header.
- Never commit, print, log, or return Darwin or Cloudflare credentials.
- Store only `DARWIN_API_KEY` as an encrypted Cloudflare Worker secret; `DARWIN_API_SECRET` is unused.
- Add `pressureMslHpa: number | null` to the version-1 weather object without otherwise breaking `/api/v1/dashboard`.
- Request current Open-Meteo values only; do not add hourly or daily forecast data.
- Preserve the 30-second rail freshness, five-minute rail stale fallback, ten-minute weather freshness, and 30-minute weather stale fallback.
- Keep conditional `ETag`, empty `304`, CORS, responsive layout, and future reTerminal E1001 compatibility.
- Follow RED/GREEN test-driven development for every production behavior.

---

## File Map

- `src/worker/providers/rail.ts`: RDM request, `x-apikey` authentication, Darwin validation, and normalized departures.
- `tests/fixtures/darwin.ts`: complete Darwin station-board fixture with direct and non-direct services.
- `tests/worker/rail.test.ts`: Darwin request, authentication, normalization, failures, timeout, and midnight coverage.
- `src/worker/dashboard.ts`: passes the Darwin key into the rail adapter while preserving cache behavior.
- `src/worker/index.ts`: declares the encrypted Worker binding and wires it into the dashboard service.
- `tests/worker/dashboard.test.ts`: Darwin-aware service orchestration and stale fallback.
- `src/shared/contracts.ts`: additive `pressureMslHpa` weather field.
- `src/worker/providers/weather.ts`: requests and normalizes current `pressure_msl`.
- `tests/fixtures/open-meteo.ts`: current pressure fixture.
- `tests/worker/weather.test.ts`: pressure request, normalization, and optional absence.
- `tests/worker/index.test.ts`: unavailable weather contract includes pressure.
- `src/app/render.ts`: pressure rendering and separated stale announcement/age behavior.
- `tests/app/render.test.ts`: pressure display, non-live stale age, mutation, focus, and `304` coverage.
- `AGENTS.md`: Darwin becomes the active rail provider.
- `README.md`: current data sources, API pressure field, and secret operations.

## Task 1: Replace the Huxley adapter with Darwin

**Files:**

- Create: `tests/fixtures/darwin.ts`
- Modify: `tests/worker/rail.test.ts`
- Modify: `src/worker/providers/rail.ts`
- Modify: `tests/worker/dashboard.test.ts`
- Modify: `src/worker/dashboard.ts`
- Modify: `src/worker/index.ts`
- Delete: `tests/fixtures/huxley.ts`

**Interfaces:**

- Produces: `normalizeDarwin(response: unknown): Departure[]`
- Produces: `fetchDepartures(fetcher: typeof fetch, now: Date, apiKey: string): Promise<Departure[]>`
- Changes: `createDashboardService` dependencies add `darwinApiKey: string`
- Changes: production `Env` adds `DARWIN_API_KEY: string`
- Preserves: `Departure[]`, cache keys, refresh intervals, stale windows, and public response fields

- [ ] **Step 1: Create a provider-shaped Darwin fixture**

Create `tests/fixtures/darwin.ts` from the current station-board fixture, retaining these representative services:

```ts
const destination = (crs: string, locationName: string) => ({
  locationName,
  crs,
  via: null,
  futureChangeTo: null,
  assocIsCancelled: false
});

const service = (overrides: Record<string, unknown>) => ({
  origin: [destination("WFJ", "Watford Junction")],
  destination: [destination("EUS", "London Euston")],
  std: "12:00",
  etd: "On time",
  platform: "9",
  operator: "LNR & WMR",
  operatorCode: "LM",
  isCancelled: false,
  delayReason: null,
  cancelReason: null,
  serviceID: "service-id",
  ...overrides
});

export const darwinFixture = {
  generatedAt: "2026-07-28T11:55:00.000Z",
  locationName: "Watford Junction",
  crs: "WFJ",
  filterLocationName: "London Euston",
  filtercrs: "EUS",
  filterType: "to",
  platformAvailable: true,
  areServicesAvailable: true,
  trainServices: [
    service({
      serviceID: "overground",
      std: "12:05",
      operator: "London Overground",
      operatorCode: "LO"
    }),
    service({ serviceID: "on-time", std: "12:10" }),
    service({
      serviceID: "delayed",
      std: "12:15",
      etd: "12:23",
      platform: null,
      delayReason: "A signalling fault"
    }),
    service({
      serviceID: "cancelled",
      std: "12:20",
      etd: "Cancelled",
      isCancelled: true,
      cancelReason: "A shortage of train crew"
    }),
    service({ serviceID: "unknown", std: "12:25", etd: "Delayed" }),
    service({
      serviceID: "other-destination",
      destination: [destination("WAT", "Watford")]
    })
  ]
};
```

- [ ] **Step 2: Write failing Darwin adapter tests**

Replace Huxley imports and expectations in `tests/worker/rail.test.ts`. Add a request test that captures both URL and headers:

```ts
it("requests every direct Watford to Euston departure through RDM", async () => {
  let request: Request | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
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
```

Add focused tests for:

```ts
expect(normalizeDarwin(darwinFixture).map(({ operatorCode }) => operatorCode))
  .toEqual(["LO", "LM", "LM", "LM", "LM"]);

expect(() => normalizeDarwin({
  ...darwinFixture,
  generatedAt: "28 July 2026 12:00"
})).toThrow("Darwin departures response was malformed");

expect(normalizeDarwin({
  ...darwinFixture,
  generatedAt: "2026-07-28T17:07:38.8418107+01:00"
})).toHaveLength(5);

await expect(fetchDepartures(fetcher, new Date(), ""))
  .rejects.toThrow("Darwin API key is not configured");
expect(fetcher).not.toHaveBeenCalled();
```

Retain and rename the delayed pre-midnight, failed response, malformed JSON,
and seven-second abort tests. Assert Darwin-specific internal error messages.

- [ ] **Step 3: Run the rail tests and verify RED**

Run:

```bash
npm test -- tests/worker/rail.test.ts
```

Expected: FAIL because `normalizeDarwin` does not exist and
`fetchDepartures` does not accept the Consumer key or RDM request shape.

- [ ] **Step 4: Implement the minimal Darwin adapter**

Replace `HUXLEY_DEPARTURES_URL` with:

```ts
const DARWIN_DEPARTURES_URL =
  "https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepartureBoard/WFJ";
```

Keep the existing status and ISO-time mapping, but rename provider-specific
types and errors to Darwin. Require a parseable ISO timestamp with an explicit
timezone while accepting Darwin's offset and extended precision:

```ts
function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
    .test(value) &&
    !Number.isNaN(Date.parse(value));
}
```

Build the RDM request without putting credentials in the URL:

```ts
export async function fetchDepartures(
  fetcher: typeof fetch,
  now: Date,
  apiKey: string
): Promise<Departure[]> {
  void now;
  if (apiKey.length === 0) {
    throw new Error("Darwin API key is not configured");
  }

  const url = new URL(DARWIN_DEPARTURES_URL);
  url.search = new URLSearchParams({
    numRows: "150",
    filterCrs: ROUTE.destination.crs,
    filterType: "to",
    timeOffset: "0",
    timeWindow: "120"
  }).toString();

  const response = await fetcher(url, {
    headers: { "x-apikey": apiKey },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) {
    throw new Error("Darwin departures request failed");
  }

  try {
    return normalizeDarwin(await response.json());
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Darwin departures response was malformed"
    ) {
      throw error;
    }
    throw new Error("Darwin departures response was malformed");
  }
}
```

- [ ] **Step 5: Verify the focused adapter GREEN**

Run:

```bash
npm test -- tests/worker/rail.test.ts
```

Expected: rail tests pass.

- [ ] **Step 6: Write failing service-wiring tests**

Update `tests/worker/dashboard.test.ts` to import `normalizeDarwin` and
`darwinFixture`. Make `networkFetcher` recognize
`api1.raildata.org.uk`, capture the `x-apikey` header, and supply
`darwinApiKey: "consumer-key"` to every `createDashboardService` call.

Add:

```ts
it("passes the configured Darwin key only in the upstream header", async () => {
  let request: Request | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const candidate = new Request(input, init);
    if (candidate.url.includes("api1.raildata.org.uk")) {
      request = candidate;
      return new Response(JSON.stringify(darwinFixture));
    }
    return new Response(JSON.stringify(openMeteoFixture));
  }) as typeof fetch;

  await createDashboardService({
    fetcher,
    cache: new MemoryCacheStore(),
    now: () => NOW,
    darwinApiKey: "consumer-key"
  })();

  expect(request!.headers.get("x-apikey")).toBe("consumer-key");
  expect(request!.url).not.toContain("consumer-key");
});
```

- [ ] **Step 7: Run service tests and verify RED**

Run:

```bash
npm test -- tests/worker/dashboard.test.ts
```

Expected: FAIL because `createDashboardService` has not yet accepted or passed
`darwinApiKey`.

- [ ] **Step 8: Wire the key through the dashboard and Worker**

Change the dashboard dependency:

```ts
export function createDashboardService(deps: {
  fetcher: typeof fetch;
  cache: CacheStore;
  now: () => Date;
  darwinApiKey: string;
}): () => Promise<DashboardPayload>
```

Call:

```ts
load: () => fetchDepartures(deps.fetcher, now, deps.darwinApiKey)
```

Update the production Worker binding:

```ts
interface Env {
  ASSETS: Assets;
  DARWIN_API_KEY: string;
}
```

and pass `env.DARWIN_API_KEY` to `createDashboardService`.

- [ ] **Step 9: Verify Task 1 and remove Huxley artifacts**

Run:

```bash
npm test -- tests/worker/rail.test.ts tests/worker/dashboard.test.ts
npm run typecheck
rg -n "Huxley|huxley|national-rail-api" src tests
```

Expected: focused tests and typecheck pass; `rg` returns no source or test
matches after `tests/fixtures/huxley.ts` is deleted.

- [ ] **Step 10: Commit Task 1**

```bash
git add src/worker/providers/rail.ts src/worker/dashboard.ts src/worker/index.ts \
  tests/fixtures/darwin.ts tests/worker/rail.test.ts tests/worker/dashboard.test.ts
git add -u tests/fixtures/huxley.ts
git commit -m "feat: use Darwin live departures"
```

## Task 2: Add mean sea-level pressure

**Files:**

- Modify: `src/shared/contracts.ts`
- Modify: `tests/fixtures/open-meteo.ts`
- Modify: `tests/worker/weather.test.ts`
- Modify: `src/worker/providers/weather.ts`
- Modify: `tests/worker/dashboard.test.ts`
- Modify: `tests/worker/index.test.ts`
- Modify: `tests/app/render.test.ts`
- Modify: `src/app/render.ts`

**Interfaces:**

- Adds: `WeatherPanel.pressureMslHpa: number | null`
- Adds: `WeatherValue.pressureMslHpa: number | null`
- Preserves: API `version: 1`
- Requests: Open-Meteo current variable `pressure_msl`

- [ ] **Step 1: Add pressure to fixtures and failing provider tests**

Add to `tests/fixtures/open-meteo.ts`:

```ts
current_units: {
  // existing fields
  pressure_msl: "hPa"
},
current: {
  // existing fields
  pressure_msl: 1016.4
}
```

Update the normalization expectation:

```ts
pressureMslHpa: 1016.4
```

Update the exact current-variable expectation so it includes
`,pressure_msl` and still asserts that `hourly` and `daily` are absent.

Add:

```ts
it("keeps current weather available when pressure is omitted", () => {
  const { pressure_msl: _pressure, ...current } = openMeteoFixture.current;
  expect(normalizeWeather({ ...openMeteoFixture, current })).toMatchObject({
    temperatureC: 21.4,
    pressureMslHpa: null
  });
});
```

- [ ] **Step 2: Run weather tests and verify RED**

Run:

```bash
npm test -- tests/worker/weather.test.ts
```

Expected: FAIL because `pressure_msl` is neither requested nor normalized.

- [ ] **Step 3: Extend the contract and weather adapter minimally**

Add to `WeatherPanel`:

```ts
pressureMslHpa: number | null;
```

Keep existing fields strict and add only an optional pressure reader:

```ts
function optionalNumberValue(
  current: Record<string, unknown>,
  field: string
): number | null {
  const value = current[field];
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : malformedResponse();
}
```

Add `"pressure_msl"` to `CURRENT_FIELDS` and return:

```ts
pressureMslHpa: optionalNumberValue(values, "pressure_msl")
```

Define `WeatherValue` so existing weather fields remain non-nullable and only
`pressureMslHpa` is nullable:

```ts
export type WeatherValue = {
  [Key in
    | "temperatureC"
    | "apparentTemperatureC"
    | "relativeHumidityPercent"
    | "precipitationMm"
    | "weatherCode"
    | "condition"
    | "windSpeedKph"
    | "windDirectionDegrees"]: NonNullable<WeatherPanel[Key]>;
} & {
  pressureMslHpa: number | null;
};
```

- [ ] **Step 4: Verify provider GREEN and expose pressure through the service**

Run:

```bash
npm test -- tests/worker/weather.test.ts
npm run typecheck
```

Use typecheck failures as the exact list of unavailable-weather and fixture
objects that must add:

```ts
pressureMslHpa: null
```

Update the live dashboard expectation to:

```ts
pressureMslHpa: 1016.4
```

- [ ] **Step 5: Add failing pressure-render tests**

Add `pressureMslHpa: 1016.4` to `livePayload`. Extend the current-weather
render test:

```ts
expect(within(weather).getByText("1016 hPa")).toBeTruthy();
```

Add:

```ts
it("shows an unavailable pressure placeholder without hiding current weather", () => {
  const weather = getByRole(render({
    ...livePayload,
    weather: { ...livePayload.weather, pressureMslHpa: null }
  }), "region", { name: "Current weather" });

  expect(within(weather).getByText("Pressure")).toBeTruthy();
  expect(within(weather).getByText("Unavailable")).toBeTruthy();
  expect(within(weather).getByText("21.4°C")).toBeTruthy();
});
```

- [ ] **Step 6: Run render tests and verify RED**

Run:

```bash
npm test -- tests/app/render.test.ts
```

Expected: FAIL because the weather panel does not render pressure.

- [ ] **Step 7: Render pressure in the existing measurement list**

Add one `weatherValue` entry:

```ts
panel.pressureMslHpa === null
  ? weatherValue("Pressure", "Unavailable", "Pressure unavailable")
  : weatherValue(
      "Pressure",
      `${Math.round(panel.pressureMslHpa)} hPa`,
      `${Math.round(panel.pressureMslHpa)} hectopascals`
    )
```

Do not create a new panel or add forecast UI. The existing measurement grid
must absorb the additional row without unrelated CSS changes.

- [ ] **Step 8: Verify and commit Task 2**

Run:

```bash
npm test -- tests/worker/weather.test.ts tests/worker/dashboard.test.ts \
  tests/worker/index.test.ts tests/app/render.test.ts
npm run typecheck
```

Expected: all focused tests and typecheck pass.

Commit:

```bash
git add src/shared/contracts.ts src/worker/providers/weather.ts src/app/render.ts \
  tests/fixtures/open-meteo.ts tests/worker/weather.test.ts \
  tests/worker/dashboard.test.ts tests/worker/index.test.ts tests/app/render.test.ts
git commit -m "feat: show current air pressure"
```

## Task 3: Stop ticking stale ages from acting as live announcements

**Files:**

- Modify: `tests/app/render.test.ts`
- Modify: `src/app/render.ts`

**Interfaces:**

- Preserves: `updateStaleAges(root: HTMLElement, now?: Date): void`
- Changes: only the static `Stale data` label has `role="status"`
- Changes: the dynamic age is a sibling with `aria-live="off"`

- [ ] **Step 1: Write failing stale accessibility tests**

Extend the stale-panel render test:

```ts
const departures = getByRole(root, "region", { name: "Departures" });
const announcement = within(departures).getByRole("status");
const age = departures.querySelector<HTMLElement>(
  "[data-dashboard-stale-age]"
)!;

expect(announcement.textContent).toBe("Stale data");
expect(announcement.contains(age)).toBe(false);
expect(age.getAttribute("aria-live")).toBe("off");
expect(departures.textContent).toContain("Stale data · 5 minutes old");
```

Change the other stale-age assertions in this file from a single-node
`getByText("Stale data · …")` lookup to a `textContent` containment assertion,
because the static announcement and dynamic age intentionally become sibling
elements.

Add a direct mutation regression:

```ts
it("does not rewrite a stale age until its formatted value changes", () => {
  const stalePayload: DashboardPayload = {
    ...livePayload,
    status: "partial",
    departures: {
      ...livePayload.departures,
      status: "stale",
      stale: true,
      updatedAt: "2026-07-28T12:00:00.000Z"
    }
  };
  const root = render(
    stalePayload,
    new Date("2026-07-28T12:07:00.000Z")
  );
  const age = root.querySelector<HTMLElement>(
    "[data-dashboard-stale-age]"
  )!;
  const originalTextNode = age.firstChild;

  updateStaleAges(root, new Date("2026-07-28T12:07:01.000Z"));
  expect(age.firstChild).toBe(originalTextNode);

  updateStaleAges(root, new Date("2026-07-28T12:08:00.000Z"));
  expect(age.firstChild).not.toBe(originalTextNode);
  expect(age.textContent).toBe(" · 8 minutes old");
});
```

Import `updateStaleAges` alongside `renderDashboard`.

- [ ] **Step 2: Run the accessibility tests and verify RED**

Run:

```bash
npm test -- tests/app/render.test.ts
```

Expected: FAIL because the dynamic age is currently inside `role="status"` and
its text node is replaced on every one-second tick.

- [ ] **Step 3: Separate the static announcement from the dynamic age**

Implement `panelStatus` with sibling elements:

```ts
const status = element("p", {
  className: "panel-status panel-status-stale"
});
status.appendChild(statusIcon("stale"));

const announcement = element("span", { text: "Stale data" });
announcement.setAttribute("role", "status");
status.appendChild(announcement);

const age = element("span", {
  text: ` · ${formatDataAge(panel.updatedAt, now)}`
});
age.dataset.dashboardStaleAge = "";
age.dataset.updatedAt = panel.updatedAt;
age.setAttribute("aria-live", "off");
status.appendChild(age);
```

Guard assignments in `updateStaleAges`:

```ts
const text = ` · ${formatDataAge(updatedAt, now)}`;
if (age.textContent !== text) {
  age.textContent = text;
}
```

- [ ] **Step 4: Verify Task 3 and preserve the `304` focus regression**

Run:

```bash
npm test -- tests/app/render.test.ts
npm run typecheck
```

Expected: all app tests pass, including advancing age after `304`, stable
refresh-button identity/focus, and the new non-live mutation checks.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/app/render.ts tests/app/render.test.ts
git commit -m "fix: quiet stale age announcements"
```

## Task 4: Document, publish, deploy, and verify the exact source

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**

- Documents: Darwin as active provider and `DARWIN_API_KEY` as the only Worker rail secret
- Documents: additive `pressureMslHpa` device field
- Preserves: `https://dashboard.cchk.uk/api/v1/dashboard`

- [ ] **Step 1: Update project instructions and operations documentation**

In `AGENTS.md`, replace the temporary-Huxley instruction with:

```md
- Use the subscribed National Rail Darwin Live Departure Board JSON API for rail
  data and keep its Consumer key in the `DARWIN_API_KEY` Worker secret.
```

In `README.md`:

- identify Darwin Live Departure Board as the active rail provider;
- remove the future migration section and Huxley references;
- document that the Worker sends `DARWIN_API_KEY` only as `x-apikey`;
- state that weather includes current mean sea-level pressure without forecast
  data; and
- add `pressureMslHpa` to the ESP32/public API notes.

- [ ] **Step 2: Run the complete pre-publication gate**

Run from a clean working tree except for the two documentation files:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
if rg -n "Huxley|huxley|national-rail-api" AGENTS.md README.md src tests; then
  exit 1
fi
```

Expected:

- 0 failed unit tests;
- typecheck and production build exit `0`;
- 0 failed Playwright tests;
- no whitespace errors; and
- no Huxley runtime/documentation references.

- [ ] **Step 3: Commit documentation and confirm source cleanliness**

```bash
git add AGENTS.md README.md
git commit -m "docs: operate dashboard with Darwin"
git status --short --branch
git log --oneline -5
```

Expected: `main` is clean and ahead of `origin/main` only by the intended
design, implementation, accessibility, pressure, and documentation commits.

- [ ] **Step 4: Push the verified source to GitHub**

```bash
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: local and remote SHAs are identical.

- [ ] **Step 5: Store the Darwin key as an encrypted Worker secret**

Use an interactive shell so `.bashrc` is loaded, but never print the value:

```bash
bash -ic 'test -n "$DARWIN_API_KEY" &&
  printf "%s" "$DARWIN_API_KEY" |
  npx wrangler secret put DARWIN_API_KEY'
```

Expected: Wrangler confirms that `DARWIN_API_KEY` was uploaded. Do not upload
`DARWIN_API_SECRET`.

- [ ] **Step 6: Deploy the exact committed source**

Confirm cleanliness immediately before deployment:

```bash
git diff --quiet
git diff --cached --quiet
npm run deploy
```

Record the committed SHA and Cloudflare Version ID in the implementation
report.

- [ ] **Step 7: Verify production API behavior**

Run:

```bash
npm run smoke:production
```

Then inspect the public JSON without printing any provider credential:

```bash
curl -fsS https://dashboard.cchk.uk/api/v1/dashboard |
  jq '{
    version,
    status,
    route,
    serviceCount: (.departures.services | length),
    operators: [.departures.services[].operator] | unique,
    pressureMslHpa: .weather.pressureMslHpa
  }'
```

Expected:

- version remains `1`;
- route is `WFJ` to `EUS`;
- departures contains the direct services currently returned by Darwin;
- all returned operators are retained, including London Overground when it is
  currently scheduled in the two-hour window;
- `pressureMslHpa` is numeric when Open-Meteo supplies it; and
- checked smoke returns `200` followed by matching empty `304` with CORS.

- [ ] **Step 8: Verify production browser layouts and accessibility**

Use Playwright or headless Chromium at `1440×900` and `390×844` to confirm:

- the route, departures, pressure, refresh, and fullscreen controls are visible;
- landscape panels remain side by side;
- phone weather remains above departures;
- neither viewport has horizontal overflow;
- stale-age markup, when exercised with a fixture locally, keeps its dynamic
  age outside the live status element; and
- browser console contains no application errors.

- [ ] **Step 9: Record the release evidence**

Append the exact commands, counts, SHA, Cloudflare Version ID, production
status, pressure result, conditional-request result, and responsive smoke
results to the execution report selected by the implementation workflow.
