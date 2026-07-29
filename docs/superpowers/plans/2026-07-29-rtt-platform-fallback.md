# RTT Platform Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill missing Darwin platforms from the existing RTT location response while labelling planned-only platforms clearly.

**Architecture:** Expand the existing five-minute RTT coach-count enrichment into one route-specific service-enrichment record containing coach count, actual platform, and planned platform. Match it to Darwin departures with the existing scheduled-time/operator key, preserve every Darwin platform, and expose a provider-neutral platform status for the frontend.

**Tech Stack:** TypeScript, Cloudflare Workers, Darwin LDB JSON API, Realtime Trains API, Vitest, Testing Library, Vite, Playwright, Wrangler

## Global Constraints

- Preserve `/api/v1/dashboard` version `1`; `platformStatus` is additive.
- Apply fallback priority in this exact order: Darwin, RTT actual, RTT planned, unavailable.
- RTT must never replace a non-null Darwin platform.
- Reuse the existing RTT location request and access-token lifecycle; add no API call.
- Cache RTT service enrichment separately per route for five minutes.
- Display RTT planned values as `Planned N`, never as confirmed platforms.
- Keep departures available when RTT fails.
- Keep rail refresh timing, weather, route switching, destination display, ETag, and CORS unchanged.
- Never expose provider credentials or provider-specific field names.
- Make no unrelated refactors or formatting changes.

---

### Task 1: Normalize RTT Service Enrichment

**Files:**
- Modify: `tests/fixtures/rtt.ts`
- Modify: `tests/worker/rtt.test.ts`
- Modify: `src/worker/providers/rtt.ts`

**Interfaces:**
- Consumes: RTT location services with scheduled departure, operator code, vehicle count, and planned/actual platform
- Produces:

```ts
export interface RttServiceEnrichment {
  scheduledDeparture: string;
  operatorCode: string;
  coachCount: number | null;
  actualPlatform: string | null;
  plannedPlatform: string | null;
}
```

- Produces:

```ts
normalizeRttServiceEnrichments(response: unknown): RttServiceEnrichment[]
RttClient.fetchServiceEnrichments(
  route: RouteConfig,
  now: Date
): Promise<RttServiceEnrichment[]>
```

- [ ] **Step 1: Add realistic platform fields to RTT fixtures**

Update `rttLocationFixture` so its valid LM service has every enrichment:

```ts
locationMetadata: {
  numberOfVehicles: 10,
  platform: { planned: "10", actual: "8" }
}
```

Give the valid LO service a planned-only platform and no coach count:

```ts
locationMetadata: {
  platform: { planned: "9", actual: null }
}
```

- [ ] **Step 2: Write a failing normalization assertion**

Keep the current production import temporarily and change the first test in
`tests/worker/rtt.test.ts` to expect:

```ts
expect(normalizeRttCoachCounts(rttLocationFixture)).toEqual([
  {
    scheduledDeparture: "2026-07-29T12:32:00",
    operatorCode: "LM",
    coachCount: 10,
    actualPlatform: "8",
    plannedPlatform: "10"
  },
  {
    scheduledDeparture: "2026-07-29T12:37:00",
    operatorCode: "LO",
    coachCount: null,
    actualPlatform: null,
    plannedPlatform: "9"
  }
]);
```

The production break this catches is dropping a service solely because its
coach count is absent and discarding both RTT platform fields.

- [ ] **Step 3: Run the RTT provider test and verify RED**

Run:

```bash
npx vitest run tests/worker/rtt.test.ts
```

Expected: the normalization test fails because only the coach-count record is
returned and it contains no platform fields.

- [ ] **Step 4: Rename and expand the RTT normalized record**

Replace `CoachCount` with `RttServiceEnrichment` in
`src/worker/providers/rtt.ts`. Add focused optional-value helpers:

```ts
function optionalCoachCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : null;
}

function optionalPlatform(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}
```

Rename `normalizeRttCoachCounts` to `normalizeRttServiceEnrichments`. Require
only valid scheduled time and operator code, then return:

```ts
return [{
  scheduledDeparture,
  operatorCode,
  coachCount: optionalCoachCount(valueAt(
    serviceRecord,
    ["locationMetadata", "numberOfVehicles"]
  )),
  actualPlatform: optionalPlatform(valueAt(
    serviceRecord,
    ["locationMetadata", "platform", "actual"]
  )),
  plannedPlatform: optionalPlatform(valueAt(
    serviceRecord,
    ["locationMetadata", "platform", "planned"]
  ))
}];
```

Rename `fetchCoachCounts` to `fetchServiceEnrichments` and call the renamed
normalizer. Do not change the token exchange, location URL, headers, timeout,
or number of requests.

- [ ] **Step 5: Update test imports and client calls**

In `tests/worker/rtt.test.ts`, import
`normalizeRttServiceEnrichments`, call it in the normalization test, and rename
all `fetchCoachCounts` calls to `fetchServiceEnrichments`.

- [ ] **Step 6: Run the RTT provider test and verify GREEN**

Run:

```bash
npx vitest run tests/worker/rtt.test.ts
```

Expected: every RTT provider test passes.

### Task 2: Apply Platform Priority and Migrate the Public Contract

**Files:**
- Modify: `tests/fixtures/rtt.ts`
- Modify: `tests/worker/rail.test.ts`
- Modify: `tests/worker/dashboard.test.ts`
- Modify: `tests/app/render.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/worker/providers/rail.ts`
- Modify: `src/worker/dashboard.ts`

**Interfaces:**
- Consumes: `RttServiceEnrichment[]` from Task 1
- Produces: `Departure.platformStatus: "live" | "planned" | null`
- Preserves: `Departure.platform: string | null`

- [ ] **Step 1: Add backend fixtures for every priority branch**

Expand `rttDashboardLocationFixture.services` with literal records matching
Darwin departures:

```ts
{
  temporalData: {
    departure: { scheduleAdvertised: "2026-07-28T12:10:00" }
  },
  scheduleMetadata: { operator: { code: "LM" } },
  locationMetadata: {
    numberOfVehicles: 10,
    platform: { actual: "7", planned: "8" }
  }
},
{
  temporalData: {
    departure: { scheduleAdvertised: "2026-07-28T12:15:00" }
  },
  scheduleMetadata: { operator: { code: "LM" } },
  locationMetadata: {
    platform: { actual: "6", planned: "7" }
  }
},
{
  temporalData: {
    departure: { scheduleAdvertised: "2026-07-28T12:25:00" }
  },
  scheduleMetadata: { operator: { code: "LM" } },
  locationMetadata: {
    platform: { actual: null, planned: "5" }
  }
}
```

Set the Darwin `unknown` fixture service's platform to `null` so the planned
branch has a matching platform gap.

- [ ] **Step 2: Write failing Darwin platform-status assertions**

Add this test to `tests/worker/rail.test.ts`:

```ts
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
```

- [ ] **Step 3: Write failing enrichment-priority assertions**

Add this dashboard test:

```ts
it("uses Darwin, RTT actual, then RTT planned platform priority", async () => {
  const getDashboard = createDashboardService({
    fetcher: networkFetcher(),
    cache: new MemoryCacheStore(),
    now: () => NOW,
    darwinApiKey: "consumer-key",
    rttApiToken: "refresh-token"
  });

  const services = (await getDashboard()).departures.services;

  expect(services.find(({ id }) => id === "on-time")).toMatchObject({
    platform: "9",
    platformStatus: "live"
  });
  expect(services.find(({ id }) => id === "delayed")).toMatchObject({
    platform: "6",
    platformStatus: "live",
    coachCount: null
  });
  expect(services.find(({ id }) => id === "unknown")).toMatchObject({
    platform: "5",
    platformStatus: "planned"
  });
});
```

Extend the existing RTT-unavailable test to assert that each non-null Darwin
platform remains `"live"` and every missing platform remains `null`.

Update the route-cache expectation to use:

```ts
"rtt-enrichment:WFJ-EUS",
"rtt-enrichment:EUS-WFJ"
```

Rename the five-minute test to
`"refreshes RTT enrichment no more often than every five minutes"` and retain
its request-count assertions.

- [ ] **Step 4: Run backend tests and verify RED**

Run:

```bash
npx vitest run tests/worker/rail.test.ts tests/worker/dashboard.test.ts
```

Expected: assertions fail because `platformStatus` is absent, RTT platforms
are ignored, and the old cache keys remain.

- [ ] **Step 5: Extend the public contract and Darwin adapter**

Add to `Departure` in `src/shared/contracts.ts`, immediately after `platform`:

```ts
platformStatus: "live" | "planned" | null;
```

In `departureFrom` in `src/worker/providers/rail.ts`, normalize the platform
once:

```ts
const platform = stringValue(service.platform);
```

Return:

```ts
platform,
platformStatus: platform === null ? null : "live",
```

- [ ] **Step 6: Replace coach-only dashboard enrichment**

In `src/worker/dashboard.ts`, import `RttServiceEnrichment`, rename
`coachCountKey` to `enrichmentKey`, and change `enrichDepartures` to accept
`RttServiceEnrichment[]`.

Build one map:

```ts
const enrichmentByService = new Map(
  enrichments.map((enrichment) => [
    enrichmentKey(enrichment),
    enrichment
  ])
);
```

For each departure:

```ts
const enrichment = enrichmentByService.get(
  departureKey(service.scheduledDeparture, service.operatorCode)
);
const rttPlatform = enrichment?.actualPlatform ??
  enrichment?.plannedPlatform ??
  null;
const platform = service.platform ?? rttPlatform;
const platformStatus = service.platform !== null
  ? "live"
  : enrichment?.actualPlatform !== null &&
      enrichment?.actualPlatform !== undefined
    ? "live"
    : enrichment?.plannedPlatform !== null &&
        enrichment?.plannedPlatform !== undefined
      ? "planned"
      : null;

return {
  ...service,
  platform,
  platformStatus,
  coachCount: enrichment?.coachCount ?? null
};
```

This also normalizes cached Darwin departures created before
`platformStatus` existed.

Rename local variables and calls from coach counts to service enrichments.
Use:

```ts
key: `rtt-enrichment:${route.id}`
```

Keep both cache durations at five minutes and call
`rttClient.fetchServiceEnrichments(route, now)`.

- [ ] **Step 7: Complete typed frontend test payload migration**

Add `platformStatus` to each departure literal in
`tests/app/render.test.ts` and `tests/e2e/dashboard.spec.ts`:

```ts
platformStatus: platform === null ? null : "live"
```

Because these are object literals, write literal values for each service:
`"live"` when its platform is non-null and `null` when it is missing.

- [ ] **Step 8: Run backend tests and type-check**

Run:

```bash
npx vitest run tests/worker/rtt.test.ts tests/worker/rail.test.ts tests/worker/dashboard.test.ts
npm run typecheck
```

Expected: all focused backend tests and TypeScript checks pass.

- [ ] **Step 9: Commit backend enrichment**

```bash
git add src/shared/contracts.ts src/worker/providers/rail.ts src/worker/providers/rtt.ts src/worker/dashboard.ts tests/fixtures/darwin.ts tests/fixtures/rtt.ts tests/worker/rail.test.ts tests/worker/rtt.test.ts tests/worker/dashboard.test.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: enrich missing platforms from RTT"
```

### Task 3: Label Planned Platforms in the Web Dashboard

**Files:**
- Modify: `tests/app/render.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `src/app/render.ts`

**Interfaces:**
- Consumes: `Departure.platform` and `Departure.platformStatus`
- Produces:
  - live platform visible text: `Platform N`
  - planned platform visible text: `Planned N`
  - planned platform accessible text: `Planned platform N`
  - missing platform visible text: `Platform TBC`

- [ ] **Step 1: Write failing planned-platform rendering tests**

Add this test to `tests/app/render.test.ts`:

```ts
it("labels planned platforms without presenting them as confirmed", () => {
  const payload: DashboardPayload = {
    ...livePayload,
    departures: {
      ...livePayload.departures,
      services: [{
        ...livePayload.departures.services[1],
        platform: "10",
        platformStatus: "planned"
      }]
    }
  };
  const departures = getByRole(render(payload), "region", {
    name: "Departures"
  });

  expect(within(departures).getByText("Planned 10")).toBeTruthy();
  expect(within(departures).getByText("Planned platform 10")).toBeTruthy();
  expect(within(departures).queryByText("Platform 10")).toBeNull();
});
```

Keep the existing assertions for `Platform 3` and `Platform TBC`; together,
the tests cover all platform presentation states.

- [ ] **Step 2: Run the rendering test and verify RED**

Run:

```bash
npx vitest run tests/app/render.test.ts
```

Expected: the planned service renders `Platform 10` rather than `Planned 10`.

- [ ] **Step 3: Implement the planned-platform label**

Replace the platform rendering branch in `src/app/render.ts` with:

```ts
if (service.platform === null) {
  appendExpandedValue(platform, "Platform TBC", "Platform to be confirmed");
} else if (service.platformStatus === "planned") {
  appendExpandedValue(
    platform,
    `Planned ${service.platform}`,
    `Planned platform ${service.platform}`
  );
} else {
  platform.textContent = `Platform ${service.platform}`;
}
```

- [ ] **Step 4: Run rendering tests and verify GREEN**

Run:

```bash
npx vitest run tests/app/render.test.ts
npm run typecheck
```

Expected: rendering tests and type-check pass.

- [ ] **Step 5: Add a phone browser assertion**

Set one service in `tests/e2e/dashboard.spec.ts` to:

```ts
platform: "10",
platformStatus: "planned",
```

In the existing compact-phone departure test, assert:

```ts
await expect(page.getByText("Planned 10")).toBeVisible();
```

Retain the existing horizontal-overflow assertion.

- [ ] **Step 6: Run the focused browser test**

Run:

```bash
npx playwright test tests/e2e/dashboard.spec.ts --grep "compact departure rows without phone overflow"
```

Expected: the planned label is visible and the phone has no horizontal
overflow.

- [ ] **Step 7: Commit the web presentation**

```bash
git add src/app/render.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: label planned train platforms"
```

### Task 4: Verify, Deploy, and Publish

**Files:**
- No source files created or modified

**Interfaces:**
- Consumes: committed Worker and frontend source
- Produces: verified production behavior at `https://dashboard.cchk.uk`

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit, integration, browser tests, type checks, and builds pass
without diff-formatting errors.

- [ ] **Step 2: Deploy the exact verified source**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports a successful version deployed to
`dashboard.cchk.uk`.

- [ ] **Step 3: Wait for the normal RTT cache refresh and verify the API**

Poll the reverse API until a current service has a non-null platform and
`platformStatus`, without waiting longer than the existing five-minute cache
window:

```bash
curl -fsS 'https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ' |
  jq '[
    .departures.services[] |
    select(.platform != null) |
    {scheduledDeparture, platform, platformStatus}
  ]'
```

Expected: Darwin or RTT actual platforms use `"live"` and an RTT planned-only
fallback, when present, uses `"planned"`.

- [ ] **Step 4: Verify the production phone page**

Use a 390px browser viewport, select `To Watford`, and verify:

- `Platform N`, `Planned N`, or `Platform TBC` is visible as appropriate;
- the document has no horizontal overflow.

- [ ] **Step 5: Run production protocol smoke checks**

```bash
npm run smoke:production
```

Expected: API schema, page, CORS, ETag, and conditional `304` checks pass.

- [ ] **Step 6: Push verified commits**

```bash
git push origin main
```

Expected: GitHub `main` advances to include the specification, plan, backend
enrichment, web presentation, and tests.
