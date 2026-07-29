# RTT Coach Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich direct Watford Junction to Euston departures with available RTT
coach counts and display them beside the operator.

**Architecture:** Darwin remains the departure authority. A focused RTT provider
exchanges the Worker-held refresh token, fetches the matching location line-up,
and normalises booked local departure time, operator code, and
`numberOfVehicles`. The dashboard service merges that optional data into
Darwin departures; RTT failure produces null counts only.

**Tech Stack:** Cloudflare Workers, TypeScript, Cache API, Vite, Vitest,
Testing Library, Playwright.

## Global Constraints

- Keep `RTT_API_TOKEN` in a Cloudflare Worker secret; never expose it to the browser or public API.
- Add `coachCount: number | null` to each public departure object.
- Query `https://data.rtt.io/rtt/location` for `gb-nr:WFJ` filtered to `gb-nr:EUS`.
- Refresh the RTT coach-count map at most once per minute.
- Match an RTT service to a Darwin departure by booked London local departure time and operator code.
- Do not let RTT failure make the departures panel unavailable.
- Display `Operator · N coach(es)`; omit the suffix when the count is unavailable.
- Do not change train ordering, delay/cancellation status, weather, theme behaviour, or API version.

---

## File Structure

- Create: `src/worker/providers/rtt.ts` — refresh-token exchange, RTT
  location-query normalisation, and coach-count records.
- Create: `tests/worker/rtt.test.ts` — contract tests for RTT requests,
  token exchange, malformed data, and absent counts.
- Create: `tests/fixtures/rtt.ts` — representative token and location
  response fixtures with known vehicle counts.
- Modify: `src/shared/contracts.ts` — add `coachCount` to `Departure`.
- Modify: `src/worker/dashboard.ts` — cache RTT results, merge them into
  Darwin departures, and degrade to null counts.
- Modify: `src/worker/index.ts` — pass optional `RTT_API_TOKEN` from the
  Worker environment.
- Modify: `src/app/render.ts` — render singular/plural count text beside
  the operator.
- Modify: `tests/worker/dashboard.test.ts` and `tests/app/render.test.ts`
  — cover merge and presentation behaviour.

### Task 1: Add an RTT coach-count provider

**Files:**
- Create: `src/worker/providers/rtt.ts`
- Create: `tests/worker/rtt.test.ts`
- Create: `tests/fixtures/rtt.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface CoachCount {
    scheduledDeparture: string;
    operatorCode: string;
    coachCount: number;
  }

  export function normalizeRttCoachCounts(response: unknown): CoachCount[];
  export function fetchCoachCounts(
    fetcher: typeof fetch,
    refreshToken: string
  ): Promise<CoachCount[]>;
  ```

- Uses `Authorization: Bearer <token>` for
  `https://data.rtt.io/api/get_access_token`, then uses the returned
  `token` on `https://data.rtt.io/rtt/location?code=gb-nr%3AWFJ&filterTo=gb-nr%3AEUS`.

- [ ] **Step 1: Write the failing provider tests**

  Create a fixture with a successful access-token response and three RTT
  services: an LM service at `2026-07-29T12:32:00` with
  `numberOfVehicles: 10`, an LO service without `numberOfVehicles`, and
  a malformed service. Add tests that assert:

  ```ts
  expect(normalizeRttCoachCounts(locationFixture)).toEqual([{
    scheduledDeparture: "2026-07-29T12:32:00",
    operatorCode: "LM",
    coachCount: 10
  }]);
  ```

  Add a request test using a recording fetcher. It must assert the first
  request is `https://data.rtt.io/api/get_access_token`, both requests have
  the appropriate Bearer token, the location request has
  `code=gb-nr:WFJ` and `filterTo=gb-nr:EUS`, and neither request URL
  contains either token. Add failure tests for an empty refresh token,
  non-OK token response, missing returned access token, non-OK location
  response, and malformed response.

- [ ] **Step 2: Run provider tests to verify they fail**

  Run: `npm test -- tests/worker/rtt.test.ts`

  Expected: FAIL because `src/worker/providers/rtt.ts` does not exist.

- [ ] **Step 3: Implement the minimal RTT provider**

  In `src/worker/providers/rtt.ts`:

  1. Reject an empty refresh token with `RTT API token is not configured`.
  2. Fetch `/api/get_access_token` with a seven-second abort signal. Require
     a non-empty `token` string from a 2xx JSON response.
  3. Fetch `/rtt/location` with the access token, URL parameters
     `code=gb-nr:WFJ` and `filterTo=gb-nr:EUS`, and a seven-second abort
     signal.
  4. Normalise only services that have all of:
     - `temporalData.departure.scheduleAdvertised` as
       `YYYY-MM-DDTHH:mm:ss`,
     - `scheduleMetadata.operator.code` as a non-empty string,
     - `locationMetadata.numberOfVehicles` as a non-negative integer.
  5. Return records sorted by `scheduledDeparture` then `operatorCode`.
     Ignore services with an absent vehicle count; reject malformed root
     responses.

- [ ] **Step 4: Run provider tests to verify they pass**

  Run: `npm test -- tests/worker/rtt.test.ts`

  Expected: PASS; provider requests are authenticated without credentials in
  URLs and only valid counts are returned.

- [ ] **Step 5: Commit the provider**

  ```bash
  git add src/worker/providers/rtt.ts tests/worker/rtt.test.ts tests/fixtures/rtt.ts
  git commit -m "feat: add RTT coach count provider"
  ```

### Task 2: Merge optional counts into the dashboard contract

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/worker/dashboard.ts`
- Modify: `src/worker/index.ts`
- Modify: `tests/worker/dashboard.test.ts`
- Modify: every existing `Departure` test fixture in `tests/`

**Interfaces:**
- Consumes `CoachCount[]` from `fetchCoachCounts`.
- Adds `coachCount: number | null` after `operatorCode` in `Departure`.
- Adds optional `rttApiToken?: string` to
  `createDashboardService({ ... })`.

- [ ] **Step 1: Write the failing dashboard tests**

  Extend the dashboard test fetcher so it can return the RTT access-token and
  RTT location fixtures. Add a test that calls `createDashboardService` with
  `rttApiToken: "refresh-token"` and asserts the Darwin departure at
  `2026-07-28T12:10:00+01:00` with operator `LM` receives its matching
  count while all unmatched departures have `coachCount: null`.

  Add a second test with an RTT 503 response and assert:

  ```ts
  expect(dashboard.departures.status).toBe("live");
  expect(dashboard.departures.services.every(
    (service) => service.coachCount === null
  )).toBe(true);
  ```

- [ ] **Step 2: Run dashboard tests to verify they fail**

  Run: `npm test -- tests/worker/dashboard.test.ts`

  Expected: FAIL because departures do not yet have `coachCount` and RTT is
  not fetched or merged.

- [ ] **Step 3: Implement the additive merge**

  1. Add `coachCount: number | null` to `Departure` and set it to
     `null` in `departureFrom`.
  2. In `dashboard.ts`, derive a Darwin match key from its scheduled
     departure in `Europe/London` as `YYYY-MM-DDTHH:mm:ss`, followed by
     `operatorCode`. Derive the RTT key with the same format.
  3. When `rttApiToken` is non-empty, use `loadWithFallback` with cache
     key `rtt-coaches-v1`, `freshForMs: 60_000`, and
     `staleForMs: 0`. Catch RTT errors and substitute an empty count list.
  4. Merge the RTT map into the successful Darwin list by returning new
     departures with `coachCount: map.get(key) ?? null`.
  5. Keep Darwin and weather loading parallel. RTT may load in parallel with
     them, but it must not affect `dashboardStatus`.
  6. Add optional `RTT_API_TOKEN` to the Worker `Env` and pass it to the
     dashboard service. Keep the secret absent in test and development
     environments valid.
  7. Update all existing departure fixtures with `coachCount: null`.

- [ ] **Step 4: Run dashboard tests to verify they pass**

  Run: `npm test -- tests/worker/dashboard.test.ts`

  Expected: PASS; matching counts enrich only the correct departure and RTT
  failure leaves live Darwin departures visible with null counts.

- [ ] **Step 5: Commit the contract and merge**

  ```bash
  git add src/shared/contracts.ts src/worker/dashboard.ts src/worker/index.ts tests/worker/dashboard.test.ts tests
  git commit -m "feat: enrich departures with coach counts"
  ```

### Task 3: Render coach counts and deploy the Worker secret

**Files:**
- Modify: `src/app/render.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**
- Consumes `Departure.coachCount: number | null`.
- Shows ` · 1 coach` for one and ` · N coaches` for every other
  non-null count.

- [ ] **Step 1: Write the failing render test**

  Update the existing `livePayload` so its London Overground departure has
  `coachCount: 5`. Assert the rendered weather-independent departures region
  contains `London Overground · 5 coaches`. Add a second payload with
  `coachCount: 1` and assert `1 coach`; add one with `coachCount: null`
  and assert the operator has no coach suffix.

- [ ] **Step 2: Run render tests to verify they fail**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: FAIL because the renderer only writes `service.operator`.

- [ ] **Step 3: Implement the compact operator suffix**

  In `renderDeparture`, replace the operator text with:

  ```ts
  const coachLabel = service.coachCount === null
    ? ""
    : ` · ${service.coachCount} ${service.coachCount === 1 ? "coach" : "coaches"}`;
  ```

  Pass ```${service.operator}${coachLabel}``` to the existing
  `departure-operator` element. Treat an undefined legacy cached value as
  unavailable by using `service.coachCount == null`.

- [ ] **Step 4: Run render tests to verify they pass**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: PASS; count grammar is correct and unavailable values do not add
  misleading text.

- [ ] **Step 5: Commit presentation coverage**

  ```bash
  git add src/app/render.ts tests/app/render.test.ts
  git commit -m "feat: show coach counts on departures"
  ```

- [ ] **Step 6: Configure and verify the Worker secret**

  Load `RTT_API_TOKEN` from the user-managed `.bashrc` without printing it,
  then set it as the Worker secret:

  ```bash
  set -a
  . /home/ubuntu/.bashrc
  printf '%s' "$RTT_API_TOKEN" | npx wrangler secret put RTT_API_TOKEN
  ```

  Verify it is not present in `git diff`, browser bundles, or
  `/api/v1/dashboard`. The public response may include only numeric
  `coachCount` values or `null`.

- [ ] **Step 7: Run the complete verification and deploy**

  ```bash
  npm test
  npm run typecheck
  npm run test:e2e
  npm run build
  git diff --check
  npm run deploy
  npm run smoke:production
  git push origin main
  ```

  After deploy, query the production dashboard once and confirm the direct
  departures contain only numeric/null `coachCount` fields and at least one
  currently available count matches RTT.
