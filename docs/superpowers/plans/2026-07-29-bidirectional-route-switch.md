# Bidirectional Watford–Euston Route Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let dashboard users switch between every direct Watford Junction–London Euston service in either direction, with weather following the departure station.

**Architecture:** Add two provider-neutral route definitions shared by the Worker and browser. Pass the selected route through Darwin, RTT, Open-Meteo, route-specific caches, and the existing version 1 payload; accept it through a strict `route` query parameter. Keep one browser request active at a time and cache each direction's payload and ETag independently so switching and conditional refreshes never mix routes.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, Vitest with Happy DOM and Testing Library, Playwright, Darwin LDB JSON API, Realtime Trains API, Open-Meteo.

## Global Constraints

- `WFJ-EUS` remains the default after every reload; do not save route state in local storage or browser history.
- Support exactly `WFJ-EUS` and `EUS-WFJ`; include every direct operator, cancelled service, and London Overground service.
- Weather follows the selected origin: Watford Junction at `51.6635`, `-0.3969`; London Euston at `51.5284`, `-0.1346`.
- Preserve `/api/v1/dashboard`, response `version: 1`, provider-neutral fields, ISO 8601 timestamps, stable enums, CORS, and `ETag`.
- Preserve the 30-second browser refresh, 30-second Darwin cache, 5-minute RTT coach-count cache, and 10-minute weather cache.
- Send `DARWIN_API_KEY` only as Darwin's `x-apikey` header.
- Keep `RTT_API_TOKEN` and exchanged RTT access tokens inside the Worker; never put credentials in source, browser code, public responses, logs, or Git.
- Reuse an RTT access token until 30 seconds before its ISO 8601 `validUntil`; RTT failure or `429` leaves Darwin departures available with `coachCount: null`.
- Keep current weather presentation, today's minimum and maximum, next-six-hour rain chance, and mean sea-level pressure rendered with exactly two decimals.
- Preserve light mode as the default, persisted theme preference, dark mode, keyboard focus, WCAG AA contrast, reduced motion, touch targets, and responsive layouts without horizontal overflow.
- Do not add indirect journeys, fares, ticketing, geolocation, arbitrary stations, route persistence, or ESP32 firmware.
- Implement with test-driven development and make only changes traceable to this specification.

---

## File Structure

- Modify `src/shared/contracts.ts` — define route IDs, station details, weather coordinates, the default route, and route guards while preserving `DashboardPayload`.
- Modify `tests/fixtures/darwin.ts` — add direct and non-matching reverse-route Darwin services.
- Modify `src/worker/providers/rail.ts` — build Darwin requests and defensive destination filtering from a selected route.
- Modify `tests/worker/rail.test.ts` — verify both Darwin directions, filtering, operators, and credentials.
- Modify `src/worker/providers/weather.ts` — build Open-Meteo requests from the selected route's origin coordinates.
- Modify `tests/worker/weather.test.ts` — verify both supported coordinate pairs without changing normalization.
- Modify `tests/fixtures/rtt.ts` — make the access-token fixture include an ISO `validUntil` and add a reverse matching service.
- Modify `src/worker/providers/rtt.ts` — separate token exchange from route requests and retain a token in a client closure until near expiry.
- Modify `tests/worker/rtt.test.ts` — verify both route queries, shared token reuse, expiry, malformed expiry, and provider failures.
- Modify `src/worker/dashboard.ts` — accept a route, use route-specific provider cache keys, enrich only that route, and return the selected route in the version 1 payload.
- Modify `tests/worker/dashboard.test.ts` — verify route isolation, reverse enrichment, fallback boundaries, and existing timing.
- Modify `src/worker/index.ts` — parse the route query strictly, return CORS-enabled `400` responses, pass route configuration to the dashboard service, and retain the service instance in the Worker isolate.
- Modify `tests/worker/index.test.ts` — verify default, valid, invalid, repeated, and per-route conditional requests.
- Modify `src/app/api.ts` — request an explicit route and retain payload/ETag pairs independently by route.
- Modify `tests/app/api.test.ts` — verify route URLs, selected-route validation, independent ETags, and cached payload recovery after `304`.
- Modify `src/app/render.ts` — render the two-button selector and its accessible selected/loading hooks.
- Modify `src/app/main.ts` — handle successful and failed route switches while preserving current data and refresh behavior.
- Modify `src/app/styles.css` — style route controls for light/dark, focus, touch, phone, and landscape layouts.
- Modify `tests/app/render.test.ts` — verify rendering and runtime switching, failure retention, repeated clicks, manual/automatic refresh, and accessibility.
- Modify `tests/e2e/dashboard.spec.ts` — exercise both directions, London Overground, reload default, responsive layout, keyboard focus, and reduced motion.
- Modify `AGENTS.md` — make repository instructions describe two directions and origin weather.
- Modify `PRODUCT.md` — update users, purpose, and route-focused principles for return journeys.
- Modify `README.md` — document the route selector, query values, origin weather, providers, development checks, and deployment verification.

---

### Task 1: Add shared route definitions and route-aware Darwin and weather adapters

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `tests/fixtures/darwin.ts`
- Modify: `tests/worker/rail.test.ts`
- Modify: `src/worker/providers/rail.ts`
- Modify: `tests/worker/weather.test.ts`
- Modify: `src/worker/providers/weather.ts`

**Interfaces:**
- Produces: `RouteId = "WFJ-EUS" | "EUS-WFJ"`.
- Produces: `RouteConfig` with `id`, `origin`, `destination`, and `weather`.
- Produces: `ROUTES: Record<RouteId, RouteConfig>`, `DEFAULT_ROUTE_ID`, `DEFAULT_ROUTE`, and `isRouteId(value: string): value is RouteId`.
- Produces: `normalizeDarwin(response: unknown, destinationCrs: string): Departure[]`.
- Produces: `fetchDepartures(fetcher, now, apiKey, route): Promise<Departure[]>`.
- Produces: `fetchWeather(fetcher, now, route): Promise<WeatherValue>`.

- [ ] **Step 1: Write failing shared-route and provider tests**

In `tests/fixtures/darwin.ts`, add a reverse fixture containing one London Northwestern Railway service and one London Overground service whose destination includes `WFJ`, plus one service for another destination:

```ts
export const reverseDarwinFixture = {
  ...darwinFixture,
  locationName: "London Euston",
  crs: "EUS",
  filterLocationName: "Watford Junction",
  filtercrs: "WFJ",
  trainServices: [
    service({
      serviceID: "reverse-lnr",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("WFJ", "Watford Junction")],
      std: "12:10"
    }),
    service({
      serviceID: "reverse-overground",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("WFJ", "Watford Junction")],
      std: "12:20",
      operator: "London Overground",
      operatorCode: "LO"
    }),
    service({
      serviceID: "reverse-other",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("BHM", "Birmingham New Street")],
      std: "12:30"
    })
  ]
};
```

In `tests/worker/rail.test.ts`, import `ROUTES` and `reverseDarwinFixture`, pass the destination CRS to existing normalization tests, and add:

```ts
it("normalizes every direct Euston to Watford service", () => {
  const services = normalizeDarwin(
    reverseDarwinFixture,
    ROUTES["EUS-WFJ"].destination.crs
  );

  expect(services.map(({ id, operatorCode }) => [id, operatorCode])).toEqual([
    ["reverse-lnr", "LM"],
    ["reverse-overground", "LO"]
  ]);
});

it.each([
  ["WFJ-EUS", "WFJ", "EUS"],
  ["EUS-WFJ", "EUS", "WFJ"]
] as const)("requests the selected %s Darwin board", async (routeId, origin, destination) => {
  let request: Request | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    request = new Request(input, init);
    const fixture = routeId === "WFJ-EUS" ? darwinFixture : reverseDarwinFixture;
    return new Response(JSON.stringify(fixture));
  }) as typeof fetch;

  await fetchDepartures(fetcher, new Date("2026-07-29T11:55:00.000Z"),
    "consumer-key", ROUTES[routeId]);

  const url = new URL(request!.url);
  expect(url.pathname.endsWith(`/GetDepartureBoard/${origin}`)).toBe(true);
  expect(url.searchParams.get("filterCrs")).toBe(destination);
  expect(url.searchParams.get("filterType")).toBe("to");
  expect(request!.headers.get("x-apikey")).toBe("consumer-key");
});
```

In `tests/worker/weather.test.ts`, import `ROUTES`, pass `ROUTES["WFJ-EUS"]` to existing `fetchWeather` calls, and replace the fixed-coordinate assertion with:

```ts
it.each([
  ["WFJ-EUS", "51.6635", "-0.3969"],
  ["EUS-WFJ", "51.5284", "-0.1346"]
] as const)("requests weather for the %s origin", async (routeId, latitude, longitude) => {
  let requestedUrl = "";
  const fetcher = (async (input: string | URL | Request) => {
    requestedUrl = input.toString();
    return new Response(JSON.stringify(openMeteoFixture));
  }) as typeof fetch;

  await fetchWeather(fetcher, new Date("2026-07-29T11:55:00.000Z"),
    ROUTES[routeId]);

  const url = new URL(requestedUrl);
  expect(url.searchParams.get("latitude")).toBe(latitude);
  expect(url.searchParams.get("longitude")).toBe(longitude);
  expect(url.searchParams.get("forecast_hours")).toBe("6");
  expect(url.searchParams.get("forecast_days")).toBe("1");
});
```

- [ ] **Step 2: Run the focused tests and verify the new signatures fail**

Run:

```bash
npx vitest run tests/worker/rail.test.ts tests/worker/weather.test.ts
```

Expected: FAIL because route definitions do not exist and both providers still use fixed Watford-to-Euston values.

- [ ] **Step 3: Implement the shared route configuration and parameterize both adapters**

Replace the single `ROUTE` export in `src/shared/contracts.ts` with:

```ts
export const ROUTES = {
  "WFJ-EUS": {
    id: "WFJ-EUS",
    origin: { name: "Watford Junction", crs: "WFJ" },
    destination: { name: "London Euston", crs: "EUS" },
    weather: { latitude: 51.6635, longitude: -0.3969 }
  },
  "EUS-WFJ": {
    id: "EUS-WFJ",
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" },
    weather: { latitude: 51.5284, longitude: -0.1346 }
  }
} as const;

export type RouteId = keyof typeof ROUTES;
export type RouteConfig = (typeof ROUTES)[RouteId];
export const DEFAULT_ROUTE_ID: RouteId = "WFJ-EUS";
export const DEFAULT_ROUTE: RouteConfig = ROUTES[DEFAULT_ROUTE_ID];

export function isRouteId(value: string): value is RouteId {
  return Object.hasOwn(ROUTES, value);
}
```

In `src/worker/providers/rail.ts`:

1. Replace the fixed Darwin URL with the base through `GetDepartureBoard`.
2. Make the destination predicate accept `destinationCrs`.
3. Pass `destinationCrs` through `normalizeDarwin`.
4. Append `route.origin.crs` to the endpoint.
5. Set `filterCrs` from `route.destination.crs`.
6. Normalize against that same destination.

The request construction must be:

```ts
const url = new URL(
  `${DARWIN_DEPARTURES_BASE_URL}/${encodeURIComponent(route.origin.crs)}`
);
url.search = new URLSearchParams({
  numRows: "150",
  filterCrs: route.destination.crs,
  filterType: "to",
  timeOffset: "0",
  timeWindow: "120"
}).toString();
```

In `src/worker/providers/weather.ts`, accept `route: RouteConfig` and replace the two fixed coordinates with:

```ts
url.searchParams.set("latitude", String(route.weather.latitude));
url.searchParams.set("longitude", String(route.weather.longitude));
```

Keep normalization, forecast bounds, pressure behavior, timeouts, and error text unchanged.

- [ ] **Step 4: Run focused tests and type-check**

Run:

```bash
npx vitest run tests/worker/rail.test.ts tests/worker/weather.test.ts
npm run typecheck
```

Expected: PASS; both route queries use the correct CRS and weather coordinates, and the Darwin key remains header-only.

- [ ] **Step 5: Commit the route and provider work**

```bash
git add src/shared/contracts.ts src/worker/providers/rail.ts \
  src/worker/providers/weather.ts tests/fixtures/darwin.ts \
  tests/worker/rail.test.ts tests/worker/weather.test.ts
git commit -m "feat: support both routes in rail and weather providers"
```

---

### Task 2: Reuse RTT access tokens and parameterize coach-count requests

**Files:**
- Modify: `tests/fixtures/rtt.ts`
- Modify: `tests/worker/rtt.test.ts`
- Modify: `src/worker/providers/rtt.ts`

**Interfaces:**
- Consumes: `RouteConfig` and `ROUTES` from Task 1.
- Produces: `RttClient` with `fetchCoachCounts(route: RouteConfig, now: Date): Promise<CoachCount[]>`.
- Produces: `createRttClient(fetcher: typeof fetch, refreshToken: string): RttClient`.

- [ ] **Step 1: Write failing tests for both directions and token lifetime**

Change `rttAccessTokenFixture` to the observed RTT response shape:

```ts
export const rttAccessTokenFixture = {
  token: "access-token",
  validUntil: "2026-07-29T13:00:00.000Z"
};
```

Add a reverse location fixture whose booked departure and operator can match the reverse Darwin fixture:

```ts
export const rttReverseLocationFixture = {
  services: [{
    temporalData: {
      departure: { scheduleAdvertised: "2026-07-28T12:10:00" }
    },
    scheduleMetadata: { operator: { code: "LM" } },
    locationMetadata: { numberOfVehicles: 8 }
  }]
};
```

Replace direct `fetchCoachCounts` request tests in `tests/worker/rtt.test.ts` with tests around `createRttClient`:

```ts
it("uses one access token for both route location requests", async () => {
  const requests: Request[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.endsWith("/api/get_access_token")) {
      return new Response(JSON.stringify(rttAccessTokenFixture));
    }
    return new Response(JSON.stringify(rttLocationFixture));
  }) as typeof fetch;
  const client = createRttClient(fetcher, "refresh-token");
  const now = new Date("2026-07-29T12:00:00.000Z");

  await client.fetchCoachCounts(ROUTES["WFJ-EUS"], now);
  await client.fetchCoachCounts(ROUTES["EUS-WFJ"], now);

  expect(requests.filter(({ url }) =>
    url.endsWith("/api/get_access_token"))).toHaveLength(1);
  const locations = requests.filter(({ url }) => url.includes("/rtt/location"));
  expect(locations.map(({ url }) => {
    const parsed = new URL(url);
    return [parsed.searchParams.get("code"), parsed.searchParams.get("filterTo")];
  })).toEqual([
    ["gb-nr:WFJ", "gb-nr:EUS"],
    ["gb-nr:EUS", "gb-nr:WFJ"]
  ]);
});

it("exchanges the access token again inside the 30-second expiry margin", async () => {
  let tokenRequests = 0;
  const fetcher = (async (input: string | URL | Request) => {
    if (input.toString().endsWith("/api/get_access_token")) {
      tokenRequests += 1;
      return new Response(JSON.stringify(rttAccessTokenFixture));
    }
    return new Response(JSON.stringify(rttLocationFixture));
  }) as typeof fetch;
  const client = createRttClient(fetcher, "refresh-token");

  await client.fetchCoachCounts(
    ROUTES["WFJ-EUS"],
    new Date("2026-07-29T12:00:00.000Z")
  );
  await client.fetchCoachCounts(
    ROUTES["EUS-WFJ"],
    new Date("2026-07-29T12:59:31.000Z")
  );

  expect(tokenRequests).toBe(2);
});

it.each([
  [{ token: "access-token" }, "RTT access-token response was malformed"],
  [{ token: "access-token", validUntil: "not-a-date" },
    "RTT access-token response was malformed"],
  [{ token: "access-token", validUntil: "2026-07-29T11:59:59.000Z" },
    "RTT access-token response was malformed"]
])("rejects an unusable access-token payload", async (payload, message) => {
  const client = createRttClient(
    (async () => new Response(JSON.stringify(payload))) as typeof fetch,
    "refresh-token"
  );

  await expect(client.fetchCoachCounts(
    ROUTES["WFJ-EUS"],
    new Date("2026-07-29T12:00:00.000Z")
  )).rejects.toThrow(message);
});
```

Retain explicit tests for an empty refresh token, non-OK token exchange, non-OK/`429` location response, malformed location response, authorization headers, timeouts, and absence of tokens from URLs.

- [ ] **Step 2: Run the RTT tests and verify they fail**

Run:

```bash
npx vitest run tests/worker/rtt.test.ts
```

Expected: FAIL because the provider exchanges a token on every call, has no `validUntil` validation, and hardcodes `WFJ`/`EUS`.

- [ ] **Step 3: Implement a closure-scoped RTT client**

In `src/worker/providers/rtt.ts`, keep `normalizeRttCoachCounts` unchanged and add:

```ts
export interface RttClient {
  fetchCoachCounts(route: RouteConfig, now: Date): Promise<CoachCount[]>;
}

type AccessToken = {
  token: string;
  validUntilMs: number;
};

const EXPIRY_MARGIN_MS = 30_000;
```

Implement `createRttClient` so:

1. An empty refresh token fails before any network request.
2. The closure stores `let accessToken: AccessToken | null = null`.
3. A cached token is reused only when
   `accessToken.validUntilMs - now.getTime() > EXPIRY_MARGIN_MS`.
4. Token exchange validates a non-empty `token`, an ISO timestamp string in
   `validUntil`, a finite parsed timestamp, and expiry after `now`.
5. The location URL uses
   `code=gb-nr:${route.origin.crs}` and
   `filterTo=gb-nr:${route.destination.crs}`.
6. Both calls retain the existing seven-second timeout and generic
   provider-specific errors.

The location method must use:

```ts
const locationUrl = new URL(`${RTT_BASE_URL}/rtt/location`);
locationUrl.searchParams.set("code", `gb-nr:${route.origin.crs}`);
locationUrl.searchParams.set("filterTo", `gb-nr:${route.destination.crs}`);
```

Do not store either token in the Cache API, a URL, a log, or a returned coach-count object.

- [ ] **Step 4: Run RTT tests and type-check**

Run:

```bash
npx vitest run tests/worker/rtt.test.ts
npm run typecheck
```

Expected: PASS; two route requests share one unexpired access token and refresh it near expiry.

- [ ] **Step 5: Commit the RTT client**

```bash
git add src/worker/providers/rtt.ts tests/worker/rtt.test.ts tests/fixtures/rtt.ts
git commit -m "feat: reuse RTT tokens across route requests"
```

---

### Task 3: Make the dashboard service and provider caches route-specific

**Files:**
- Modify: `tests/worker/dashboard.test.ts`
- Modify: `src/worker/dashboard.ts`

**Interfaces:**
- Consumes: `RouteConfig`, `DEFAULT_ROUTE`, and `createRttClient`.
- Produces: `createDashboardService(deps): (route?: RouteConfig) => Promise<DashboardPayload>`.
- Produces cache keys `rail:${route.id}`, `weather:${route.origin.crs}`, and `rtt-coaches:${route.id}`.

- [ ] **Step 1: Write failing dashboard route-isolation tests**

Update the test `networkFetcher` to return `reverseDarwinFixture` when the Darwin URL ends in `/EUS`, and return `rttReverseLocationFixture` when the RTT request contains `code=gb-nr%3AEUS`.

Pass `ROUTES["WFJ-EUS"]` explicitly in existing dashboard calls where the route matters, then add:

```ts
it.each([
  ["WFJ-EUS", "WFJ", "EUS"],
  ["EUS-WFJ", "EUS", "WFJ"]
] as const)("returns the selected %s payload", async (routeId, origin, destination) => {
  const getDashboard = createDashboardService({
    fetcher: networkFetcher(),
    cache: new MemoryCacheStore(),
    now: () => NOW,
    darwinApiKey: "consumer-key"
  });

  const dashboard = await getDashboard(ROUTES[routeId]);

  expect(dashboard.version).toBe(1);
  expect(dashboard.route.origin.crs).toBe(origin);
  expect(dashboard.route.destination.crs).toBe(destination);
});

it("keeps rail, weather, and coach caches separate by route", async () => {
  const cache = new MemoryCacheStore();
  const getDashboard = createDashboardService({
    fetcher: networkFetcher(),
    cache,
    now: () => NOW,
    darwinApiKey: "consumer-key",
    rttApiToken: "refresh-token"
  });

  await getDashboard(ROUTES["WFJ-EUS"]);
  await getDashboard(ROUTES["EUS-WFJ"]);

  expect(cache.keys()).toEqual(expect.arrayContaining([
    "rail:WFJ-EUS",
    "rail:EUS-WFJ",
    "weather:WFJ",
    "weather:EUS",
    "rtt-coaches:WFJ-EUS",
    "rtt-coaches:EUS-WFJ"
  ]));
});

it("does not use a Watford rail fallback for an Euston request", async () => {
  const cache = new MemoryCacheStore();
  cache.seed("rail:WFJ-EUS", normalizeDarwin(
    darwinFixture,
    ROUTES["WFJ-EUS"].destination.crs
  ), "2026-07-28T12:00:00.000Z");
  const getDashboard = createDashboardService({
    fetcher: networkFetcher({
      rail: new Response("unavailable", { status: 503 })
    }),
    cache,
    now: () => NOW,
    darwinApiKey: "consumer-key"
  });

  const dashboard = await getDashboard(ROUTES["EUS-WFJ"]);

  expect(dashboard.departures.status).toBe("unavailable");
  expect(dashboard.departures.services).toEqual([]);
});

it("adds reverse-route coach counts without changing Darwin availability", async () => {
  const getDashboard = createDashboardService({
    fetcher: networkFetcher(),
    cache: new MemoryCacheStore(),
    now: () => NOW,
    darwinApiKey: "consumer-key",
    rttApiToken: "refresh-token"
  });

  const dashboard = await getDashboard(ROUTES["EUS-WFJ"]);

  expect(dashboard.departures.services.find(
    ({ id }) => id === "reverse-lnr"
  )?.coachCount).toBe(8);
  expect(dashboard.departures.services.some(
    ({ operatorCode }) => operatorCode === "LO"
  )).toBe(true);
});
```

Add `keys()` to the in-test `MemoryCacheStore` by decoding the final synthetic cache URL segment:

```ts
keys(): string[] {
  return [...this.responses.keys()].map((url) =>
    decodeURIComponent(new URL(url).pathname.slice(1))
  );
}
```

Update old seed keys from `rail` and `weather-v2` to the new default-route keys.

- [ ] **Step 2: Run dashboard tests and verify route assertions fail**

Run:

```bash
npx vitest run tests/worker/dashboard.test.ts
```

Expected: FAIL because the service takes no route, returns the former global route, and shares provider caches.

- [ ] **Step 3: Parameterize the dashboard service with minimal changes**

In `src/worker/dashboard.ts`:

1. Import `DEFAULT_ROUTE`, `RouteConfig`, and `createRttClient`.
2. Create the RTT client once inside `createDashboardService`, outside its returned async function.
3. Give the returned function a `route: RouteConfig = DEFAULT_ROUTE` argument.
4. Use the three exact cache keys from the Interfaces block.
5. Pass `route` to all three provider calls.
6. Return `origin` and `destination` only, not `id` or weather coordinates:

```ts
route: {
  origin: route.origin,
  destination: route.destination
}
```

Keep all existing freshness durations, `Promise.allSettled` concurrency, stale/unavailable semantics, generated timestamp calculation, and coach matching logic unchanged. Catch every RTT error, including `429`, and substitute `[] as CoachCount[]`.

- [ ] **Step 4: Run dashboard and provider regression tests**

Run:

```bash
npx vitest run tests/worker/dashboard.test.ts tests/worker/provider-cache.test.ts \
  tests/worker/rail.test.ts tests/worker/rtt.test.ts tests/worker/weather.test.ts
npm run typecheck
```

Expected: PASS; cached data and coach counts never cross direction boundaries.

- [ ] **Step 5: Commit the route-aware service**

```bash
git add src/worker/dashboard.ts tests/worker/dashboard.test.ts
git commit -m "feat: isolate dashboard data by route"
```

---

### Task 4: Add strict route-query handling to the Worker API

**Files:**
- Modify: `tests/worker/index.test.ts`
- Modify: `src/worker/index.ts`

**Interfaces:**
- Consumes: `ROUTES`, `DEFAULT_ROUTE`, `isRouteId`, and the route-aware dashboard service.
- Changes: `WorkerDependencies.getDashboard(route: RouteConfig): Promise<DashboardPayload>`.
- Preserves: `GET /api/v1/dashboard` as default `WFJ-EUS`.

- [ ] **Step 1: Write failing Worker routing tests**

Make the test worker's `getDashboard` accept a route and return a payload with that route. Retain a spy so tests can assert provider/service calls.

Add:

```ts
it("uses Watford to Euston when route is absent", async () => {
  const { runningWorker, getDashboard } = worker();

  const response = await runningWorker.fetch(
    new Request("https://dashboard.cchk.uk/api/v1/dashboard")
  );

  expect(response.status).toBe(200);
  expect(getDashboard).toHaveBeenCalledWith(ROUTES["WFJ-EUS"]);
});

it("passes the valid reverse route to the dashboard service", async () => {
  const { runningWorker, getDashboard } = worker();

  const response = await runningWorker.fetch(new Request(
    "https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ"
  ));

  expect(response.status).toBe(200);
  expect(getDashboard).toHaveBeenCalledWith(ROUTES["EUS-WFJ"]);
  expect((await response.json() as DashboardPayload).route.origin.crs).toBe("EUS");
});

it.each([
  "?route=",
  "?route=unknown",
  "?route=WFJ-EUS&route=EUS-WFJ"
])("rejects invalid route query %s before loading providers", async (query) => {
  const { runningWorker, getDashboard } = worker();

  const response = await runningWorker.fetch(new Request(
    `https://dashboard.cchk.uk/api/v1/dashboard${query}`
  ));

  expect(response.status).toBe(400);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(getDashboard).not.toHaveBeenCalled();
});
```

Extend the ETag test so `WFJ-EUS` and `EUS-WFJ` produce distinct bodies/ETags and each matching `If-None-Match` returns `304` only for its own route.

- [ ] **Step 2: Run the Worker tests and verify query cases fail**

Run:

```bash
npx vitest run tests/worker/index.test.ts
```

Expected: FAIL because the Worker ignores query parameters and calls a zero-argument service.

- [ ] **Step 3: Parse the query before provider work**

In `src/worker/index.ts`, add:

```ts
function routeFor(url: URL): RouteConfig | null {
  const values = url.searchParams.getAll("route");
  if (values.length === 0) return DEFAULT_ROUTE;
  if (values.length !== 1 || !isRouteId(values[0])) return null;
  return ROUTES[values[0]];
}
```

After `OPTIONS` and method handling, resolve the route. When it is `null`, return an empty `400` response with `CORS_HEADERS` and do not call `getDashboard`.

Change the success path to:

```ts
const route = routeFor(url);
if (route === null) {
  return new Response(null, { status: 400, headers: CORS_HEADERS });
}
const body = JSON.stringify(await getDashboard(route));
```

Retain one production dashboard service per Worker isolate so the RTT client closure survives browser requests:

```ts
let productionDashboardService:
  ReturnType<typeof createDashboardService> | undefined;
```

Initialize it on the first default-export `fetch` using the current `env`, cache binding, global `fetch`, and `now`; reuse it for later requests in the same isolate. Cloudflare secret changes create a new deployment/isolate, so do not add a mutable credential registry.

- [ ] **Step 4: Run API tests and type-check**

Run:

```bash
npx vitest run tests/worker/index.test.ts tests/worker/dashboard.test.ts
npm run typecheck
```

Expected: PASS; invalid route values return `400` with CORS and zero service calls, while the absent query remains backward-compatible.

- [ ] **Step 5: Commit the API route**

```bash
git add src/worker/index.ts tests/worker/index.test.ts
git commit -m "feat: accept dashboard route queries"
```

---

### Task 5: Cache browser payloads and ETags independently by route

**Files:**
- Modify: `tests/app/api.test.ts`
- Modify: `src/app/api.ts`

**Interfaces:**
- Consumes: `RouteId`, `RouteConfig`, and `ROUTES`.
- Produces: `DashboardLoad = { payload: DashboardPayload; changed: boolean }`.
- Changes: `createDashboardClient(fetcher).load(routeId: RouteId): Promise<DashboardLoad>`.

- [ ] **Step 1: Write failing client tests**

Create a reverse payload by replacing the route object and a weather value:

```ts
const reversePayload: DashboardPayload = {
  ...payload,
  route: {
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" }
  },
  weather: { ...payload.weather, temperatureC: 22.1 }
};
```

Replace the single ETag test with:

```ts
it("keeps payloads and ETags separate for both routes", async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(payload), {
      headers: { etag: "\"watford\"" }
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify(reversePayload), {
      headers: { etag: "\"euston\"" }
    }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  const client = createDashboardClient(fetcher);

  await expect(client.load("WFJ-EUS")).resolves.toEqual({
    payload,
    changed: true
  });
  await expect(client.load("EUS-WFJ")).resolves.toEqual({
    payload: reversePayload,
    changed: true
  });
  await expect(client.load("WFJ-EUS")).resolves.toEqual({
    payload,
    changed: false
  });
  await expect(client.load("EUS-WFJ")).resolves.toEqual({
    payload: reversePayload,
    changed: false
  });

  expect(fetcher).toHaveBeenNthCalledWith(3,
    "/api/v1/dashboard?route=WFJ-EUS",
    { headers: { "If-None-Match": "\"watford\"" } });
  expect(fetcher).toHaveBeenNthCalledWith(4,
    "/api/v1/dashboard?route=EUS-WFJ",
    { headers: { "If-None-Match": "\"euston\"" } });
});

it("rejects a payload that does not match the requested route", async () => {
  const client = createDashboardClient(
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(reversePayload))
    )
  );

  await expect(client.load("WFJ-EUS")).rejects.toThrow(
    "Malformed dashboard payload"
  );
});
```

Keep malformed JSON, unsupported version, missing panel, and non-success response coverage. Update them to call `load("WFJ-EUS")`.

- [ ] **Step 2: Run client tests and verify they fail**

Run:

```bash
npx vitest run tests/app/api.test.ts
```

Expected: FAIL because the client has one ETag, one fixed endpoint, rejects the valid reverse route, and returns `null` for `304`.

- [ ] **Step 3: Implement per-route client state**

In `src/app/api.ts`, define:

```ts
export interface DashboardLoad {
  payload: DashboardPayload;
  changed: boolean;
}

type RouteState = {
  etag: string | null;
  payload: DashboardPayload | null;
};
```

Create one `RouteState` per `RouteId`. For each `load(routeId)`:

1. Request `/api/v1/dashboard?route=${encodeURIComponent(routeId)}`.
2. Send only that route's ETag.
3. On `304`, return that route's cached payload with `changed: false`.
4. On `200`, verify `version`, panels, and the exact origin/destination names and CRS from `ROUTES[routeId]`.
5. Store the returned ETag and payload under that route.
6. Return `{ payload, changed: true }`.

If a `304` arrives without a cached payload, throw
`Dashboard returned 304 without a cached payload`.

- [ ] **Step 4: Run client tests and type-check**

Run:

```bash
npx vitest run tests/app/api.test.ts
npm run typecheck
```

Expected: PASS; returning to a previously loaded direction after `304` yields that direction's payload.

- [ ] **Step 5: Commit browser API state**

```bash
git add src/app/api.ts tests/app/api.test.ts
git commit -m "feat: cache dashboard responses by route"
```

---

### Task 6: Render and operate the accessible route selector

**Files:**
- Modify: `src/app/render.ts`
- Modify: `src/app/main.ts`
- Modify: `src/app/styles.css`
- Modify: `tests/app/render.test.ts`

**Interfaces:**
- Consumes: `RouteId`, `ROUTES`, `DEFAULT_ROUTE_ID`, and `DashboardLoad`.
- Adds DOM hooks: `[data-dashboard-route="WFJ-EUS"]`, `[data-dashboard-route="EUS-WFJ"]`, and `[data-dashboard-route-status]`.
- Preserves hooks for theme, refresh, fullscreen, clock, stale age, and connection status.

- [ ] **Step 1: Write failing selector rendering tests**

Add a reverse payload fixture in `tests/app/render.test.ts` and assert:

```ts
it("renders two accessible route controls with the loaded direction selected", () => {
  const root = render();
  const toEuston = getByRole<HTMLButtonElement>(root, "button", {
    name: "To Euston"
  });
  const toWatford = getByRole<HTMLButtonElement>(root, "button", {
    name: "To Watford"
  });

  expect(toEuston.getAttribute("aria-pressed")).toBe("true");
  expect(toWatford.getAttribute("aria-pressed")).toBe("false");
  expect(toEuston.dataset.dashboardRoute).toBe("WFJ-EUS");
  expect(toWatford.dataset.dashboardRoute).toBe("EUS-WFJ");
  expect(root.querySelector("[data-dashboard-route-status]")?.hidden).toBe(true);
});

it("selects To Watford for an Euston to Watford payload", () => {
  const root = render(reversePayload);

  expect(getByRole(root, "heading", {
    name: "London Euston to Watford Junction"
  })).toBeTruthy();
  expect(getByRole(root, "button", {
    name: "To Watford"
  }).getAttribute("aria-pressed")).toBe("true");
});
```

- [ ] **Step 2: Write failing runtime route-switch tests**

Add tests that cover the state machine:

```ts
it("keeps current data visible while switching and replaces it on success", async () => {
  let resolveReverse: ((response: Response) => void) | undefined;
  const reverseRequest = new Promise<Response>((resolve) => {
    resolveReverse = resolve;
  });
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(dashboardResponse(livePayload, "\"watford\""))
    .mockReturnValueOnce(reverseRequest);
  const root = document.createElement("main");
  document.body.appendChild(root);
  startDashboardApp(root, fetcher);
  await settlePromises();

  getByRole(root, "button", { name: "To Watford" }).click();

  expect(getByRole(root, "heading", {
    name: "Watford Junction to London Euston"
  })).toBeTruthy();
  expect(within(root).getByText(
    "Loading London Euston to Watford Junction…"
  )).toBeTruthy();
  expect(getByRole<HTMLButtonElement>(root, "button", {
    name: "To Euston"
  }).disabled).toBe(true);
  expect(getByRole<HTMLButtonElement>(root, "button", {
    name: "To Watford"
  }).disabled).toBe(true);

  resolveReverse?.(dashboardResponse(reversePayload, "\"euston\""));
  await settlePromises();

  expect(getByRole(root, "heading", {
    name: "London Euston to Watford Junction"
  })).toBeTruthy();
  expect(getByRole(root, "button", {
    name: "To Watford"
  }).getAttribute("aria-pressed")).toBe("true");
});
```

Add separate runtime tests that:

- reject the reverse request and assert the Watford heading/data remain, both route controls re-enable, and the existing connection warning appears;
- click both route controls while the first switch is unresolved and assert only one reverse fetch occurs;
- switch successfully, advance fake timers by 30 seconds, and assert the automatic request uses `?route=EUS-WFJ`;
- switch successfully, click Refresh, and assert the manual request uses `?route=EUS-WFJ`;
- return to a previously loaded direction with a `304` and assert its cached heading/weather are restored;
- assert initial load always requests `?route=WFJ-EUS` even when local storage contains only a dark theme preference.

Update `dashboardResponse` to accept an ETag:

```ts
function dashboardResponse(
  payload: DashboardPayload = livePayload,
  etag = "\"dashboard-v1\""
): Response {
  return new Response(JSON.stringify(payload), { headers: { etag } });
}
```

- [ ] **Step 3: Run the app tests and verify route behavior fails**

Run:

```bash
npx vitest run tests/app/render.test.ts
```

Expected: FAIL because the selector and route state machine do not exist and the runtime calls `client.load()` without a route.

- [ ] **Step 4: Render the selector and loading status**

In `src/app/render.ts`, add a route selector under the full route heading:

```ts
const selector = element("div", { className: "route-selector" });
selector.setAttribute("role", "group");
selector.setAttribute("aria-label", "Travel direction");
for (const [routeId, label] of [
  ["WFJ-EUS", "To Euston"],
  ["EUS-WFJ", "To Watford"]
] as const) {
  const control = element("button", { text: label });
  control.type = "button";
  control.dataset.dashboardRoute = routeId;
  control.setAttribute("aria-pressed", String(
    payload.route.origin.crs === ROUTES[routeId].origin.crs &&
    payload.route.destination.crs === ROUTES[routeId].destination.crs
  ));
  selector.appendChild(control);
}
const routeStatus = element("p", { className: "route-switch-status" });
routeStatus.dataset.dashboardRouteStatus = "";
routeStatus.setAttribute("role", "status");
routeStatus.hidden = true;
```

Wrap the existing route heading and these two elements in
`.route-overview`, leaving metadata and dashboard controls as the other
header columns.

- [ ] **Step 5: Implement route switching without replacing visible data early**

In `src/app/main.ts`:

1. Initialize `activeRouteId` to `DEFAULT_ROUTE_ID`.
2. Change refresh to accept a target route and mode:
   `refresh(routeId: RouteId, mode: "automatic" | "manual" | "switch")`.
3. Call `client.load(routeId)`.
4. Render when `result.changed` is true or `routeId !== activeRouteId`.
5. Update `activeRouteId` only after a successful load.
6. During `"switch"`, disable both route buttons and show
   `Loading ${origin.name} to ${destination.name}…`.
7. On switch failure, retain the old DOM and `activeRouteId`, hide the loading
   status, re-enable route controls, and show the existing connection warning.
8. During `"manual"`, disable only the refresh button.
9. Have automatic and manual refresh call the current `activeRouteId`.
10. In `handleClick`, read and validate `data-dashboard-route`; ignore the
    active direction and every click while `refreshInFlight` is true.

Do not write the route to local storage, `location`, `history`, or the URL.
Keep theme storage independent.

- [ ] **Step 6: Style the selector for both themes and viewport classes**

In `src/app/styles.css`:

1. Add `.route-overview { min-width: 0; }`.
2. Add `.route-selector` as an inline flex group with a small gap and top margin.
3. Give route buttons the same minimum `2.75rem` touch height, surface, border,
   text, cursor, focus outline, and disabled state as existing controls.
4. Style `[aria-pressed="true"]` with `border-color: var(--amber)`,
   `background: var(--amber-soft)`, and a visible font-weight change.
5. Keep `.route-switch-status` concise, use `var(--text-muted)`, and prevent it
   from widening the page.
6. At `max-width: 759px`, make the selector width `100%` and each route button
   flex equally.
7. Include route buttons in the reduced-motion rule; do not add route-switch
   animation.

Do not change departure or weather panel proportions.

- [ ] **Step 7: Run app tests and the complete unit suite**

Run:

```bash
npx vitest run tests/app/api.test.ts tests/app/render.test.ts
npm test
npm run typecheck
```

Expected: PASS; route controls are accessible, failures retain the old complete dashboard, and refreshes follow the loaded route.

- [ ] **Step 8: Commit the route-switch UI**

```bash
git add src/app/render.ts src/app/main.ts src/app/styles.css \
  tests/app/render.test.ts
git commit -m "feat: add dashboard route switch"
```

---

### Task 7: Verify browser behavior and align project documentation

**Files:**
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `AGENTS.md`
- Modify: `PRODUCT.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the route query and DOM hooks from Tasks 4–6.
- Preserves: existing development, deployment, secret, theme, pressure, and future-device documentation.

- [ ] **Step 1: Add route-aware Playwright fixtures and acceptance scenarios**

Create `reverseDashboard` in `tests/e2e/dashboard.spec.ts` with the reverse route,
an Euston weather value, one London Northwestern Railway service, and one
London Overground service. Change the API route handler to inspect
`new URL(route.request().url()).searchParams.get("route")` and return the
matching payload.

Add:

```ts
test("switches both route content and selected control", async ({ page }) => {
  await openDashboard(page);

  await page.getByRole("button", { name: "To Watford" }).click();

  await expect(page.getByRole("heading", {
    name: "London Euston to Watford Junction"
  })).toBeVisible();
  await expect(page.getByRole("button", {
    name: "To Watford"
  })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("listitem").filter({
    hasText: "London Overground"
  })).toBeVisible();
  await expect(page.getByRole("region", {
    name: "Current weather"
  })).toContainText(String(reverseDashboard.weather.temperatureC));
});

test("reload resets the route but preserves the selected theme", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "To Watford" }).click();
  await expect(page.getByRole("heading", {
    name: "London Euston to Watford Junction"
  })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", {
    name: "Watford Junction to London Euston"
  })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
```

Extend landscape and phone tests to assert both route buttons are visible and
`document.documentElement.scrollWidth <= clientWidth` after switching.
Update keyboard focus expectations to follow the actual DOM order:
`To Euston`, `To Watford`, theme, refresh, fullscreen. Keep reduced-motion
checks for both selector and refresh controls.

- [ ] **Step 2: Run the browser acceptance suite**

Run:

```bash
npm run build
npm run test:e2e
```

Expected: PASS if the unit-tested interaction behaves identically in Chromium.
If an assertion fails, record the exact selector, viewport, and computed layout
value before making the focused correction in Step 3.

- [ ] **Step 3: Correct only browser-level route-selector failures**

If Step 2 passes, make no source change in this step. If it fails, adjust only
route-selector markup or CSS needed so:

- both buttons have visible accessible names and selected state;
- keyboard focus remains at least two CSS pixels wide with at least two CSS
  pixels of offset;
- both buttons remain at least `44px` high;
- phone and landscape layouts have no horizontal overflow;
- route controls have zero transition duration under reduced motion;
- weather remains above departures on phones and beside them on landscape.

- [ ] **Step 4: Update repository and product instructions**

In `AGENTS.md`:

- replace one-way scope with both direct `WFJ-EUS` and `EUS-WFJ` directions;
- state weather follows the selected origin;
- list `docs/superpowers/specs/2026-07-29-bidirectional-route-switch-design.md`
  as the current route extension;
- replace the blanket forecast prohibition with the already approved limited
  fields: current conditions, today's minimum/maximum, and next-six-hour rain
  chance;
- document `RTT_API_TOKEN`, five-minute per-route coach caching, and
  Worker-only access-token reuse;
- keep pressure, security, deployment, ESP32, and behavioral guidelines intact.

In `PRODUCT.md`, change the users and purpose to commuters travelling either
direction and revise “Stay route-focused” to cover the selected Watford–Euston
direction. Keep the brand personality and anti-references unchanged.

In `README.md`:

- rename the product as the Watford Junction–London Euston dashboard;
- explain the two header controls and reload default;
- document all three API forms:
  `/api/v1/dashboard`, `?route=WFJ-EUS`, and `?route=EUS-WFJ`;
- explain origin-specific weather, current/min/max/rain/pressure fields, Darwin,
  RTT coach counts, refresh intervals, ETags, and CORS;
- retain secret-handling instructions without showing values;
- retain the full local and deployment verification commands.

- [ ] **Step 5: Run browser and documentation checks**

Run:

```bash
npm run test:e2e
rg -n "Watford Junction|London Euston|WFJ-EUS|EUS-WFJ|origin" \
  AGENTS.md PRODUCT.md README.md
git diff --check
```

Expected: all Playwright tests pass; documentation consistently describes both directions and contains no whitespace errors.

- [ ] **Step 6: Commit browser coverage and documentation**

```bash
git add tests/e2e/dashboard.spec.ts AGENTS.md PRODUCT.md README.md
git commit -m "docs: describe bidirectional dashboard routes"
```

---

### Task 8: Complete verification, deploy, validate production, and push main

**Files:**
- Verify only: all changed files

**Interfaces:**
- Produces: a deployed `dashboard.cchk.uk` and GitHub `main` containing the verified source.

- [ ] **Step 1: Run the complete local verification gate**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: all unit tests, type-checking, build, and Playwright tests pass; diff
check is clean; status contains no unintended or secret files.

- [ ] **Step 2: Review the final diff against the approved specification**

Run:

```bash
git diff 887d3df..HEAD --stat
git diff 887d3df..HEAD -- src tests AGENTS.md PRODUCT.md README.md
```

Confirm every changed line supports route definitions, provider parameterization,
cache isolation, token reuse, API parsing, browser switching, tests, or aligned
documentation. Confirm no credential value or unrelated refactor appears.

- [ ] **Step 3: Confirm deployment credentials exist without printing them**

Run:

```bash
source /home/ubuntu/.bashrc >/dev/null 2>&1
test -n "${CLOUDFLARE_API_TOKEN:-}"
test -n "${DARWIN_API_KEY:-}"
test -n "${RTT_API_TOKEN:-}"
```

Expected: all commands exit zero and print nothing.

- [ ] **Step 4: Deploy the verified build to Cloudflare**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports a successful deployment for
`watford-euston-dashboard` on `dashboard.cchk.uk`. Record the deployed version
identifier in the handoff, not any credential.

- [ ] **Step 5: Verify both production API directions and conditional caching**

Run:

```bash
npm run smoke:production
curl --fail --silent --show-error \
  "https://dashboard.cchk.uk/api/v1/dashboard?route=WFJ-EUS" |
  jq -e '.version == 1 and .route.origin.crs == "WFJ" and
    .route.destination.crs == "EUS" and
    (.departures.services | type == "array") and
    (.weather.pressureMslHpa == null or
      (.weather.pressureMslHpa | type == "number"))'
curl --fail --silent --show-error \
  "https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ" |
  jq -e '.version == 1 and .route.origin.crs == "EUS" and
    .route.destination.crs == "WFJ" and
    (.departures.services | type == "array") and
    (.weather.pressureMslHpa == null or
      (.weather.pressureMslHpa | type == "number"))'
```

Expected: smoke passes; both `jq` checks print `true`; route-specific upstream
coordinates are already proven by Task 1 tests. Inspect both public payloads
only for numeric-or-null coach counts and do not print or search environment
credentials.

- [ ] **Step 6: Exercise the production selector in a real browser**

Run:

```bash
node --input-type=module -e 'import { chromium } from "@playwright/test";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("https://dashboard.cchk.uk", { waitUntil: "networkidle" });
await page.getByRole("heading", {
  name: "Watford Junction to London Euston"
}).waitFor();
await page.getByRole("button", { name: "To Watford" }).click();
await page.getByRole("heading", {
  name: "London Euston to Watford Junction"
}).waitFor();
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth > document.documentElement.clientWidth
);
if (overflow) throw new Error("Production phone layout overflows horizontally");
await browser.close();
console.log("Production route switch passed");'
```

Expected: `Production route switch passed`.

- [ ] **Step 7: Correct and reverify any production-only issue**

If a production check fails, reproduce it with a focused test, make the smallest
source correction, rerun the focused test plus the full Step 1 gate, commit the
correction with a specific `fix:` message, redeploy, and repeat Steps 5–6. Do
not bypass a failing production check.

- [ ] **Step 8: Push the verified main branch to GitHub**

Run:

```bash
git status --short
git log --oneline --decorate -10
git remote get-url origin
git push origin main
git status --short
```

Expected: the remote URL is
`https://github.com/chchingyesstyle/mydashboard` (or its authenticated
equivalent), push succeeds, and the final worktree is clean.
