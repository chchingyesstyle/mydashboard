# Train Final Destination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add each train's actual final destination to the public departure contract and show it compactly on the Euston-to-Watford board.

**Architecture:** Normalize Darwin's first valid destination into a provider-neutral `finalDestination` field on every departure. Pass a reverse-route display flag into the existing departure renderer and append the destination to its operator metadata without adding a new row or column.

**Tech Stack:** TypeScript, Cloudflare Workers, Darwin LDB JSON API, Vitest, Testing Library, Vite, Playwright, Wrangler

## Global Constraints

- Preserve `/api/v1/dashboard` version `1`; `finalDestination` is additive and nullable.
- Display final destinations only for route `EUS-WFJ`.
- Keep route filtering, two-hour rail window, refresh timing, route caches, RTT coach enrichment, ETag, CORS, and weather behavior unchanged.
- Keep the current row structure and allow the existing metadata line to wrap naturally.
- Keep Darwin property names out of the public API.
- Send `DARWIN_API_KEY` only in the upstream `x-apikey` header.
- Make no unrelated refactors or formatting changes.

---

### Task 1: Normalize the Final Destination

**Files:**
- Modify: `tests/worker/rail.test.ts`
- Modify: `tests/app/render.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/worker/providers/rail.ts`

**Interfaces:**
- Consumes: Darwin service `destination` collections containing `locationName` and `crs`
- Produces: `Departure.finalDestination: { name: string; crs: string } | null`
- Preserves: `normalizeDarwin(response: unknown, destinationCrs?: string): Departure[]`

- [ ] **Step 1: Write failing normalization tests**

Add these assertions to `tests/worker/rail.test.ts`:

```ts
it("normalizes each train's actual final destination", () => {
  const forward = normalizeDarwin(
    darwinFixture,
    ROUTES["WFJ-EUS"].destination.crs
  );
  const reverse = normalizeDarwin(
    reverseDarwinFixture,
    ROUTES["EUS-WFJ"].destination.crs
  );

  expect(forward[0].finalDestination).toEqual({
    name: "London Euston",
    crs: "EUS"
  });
  expect(reverse.find(({ id }) => id === "reverse-through")
    ?.finalDestination).toEqual({
    name: "Birmingham New Street",
    crs: "BHM"
  });
});

it("uses null when Darwin omits a valid final destination", () => {
  const [service] = normalizeDarwin({
    ...reverseDarwinFixture,
    trainServices: [{
      ...reverseDarwinFixture.trainServices[0],
      destination: [{ locationName: "", crs: "WFJ" }]
    }]
  }, ROUTES["EUS-WFJ"].destination.crs);

  expect(service.finalDestination).toBeNull();
});
```

The production change that makes these tests pass is adding normalized
destination data to `Departure`; without it, both assertions receive
`undefined`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/worker/rail.test.ts
```

Expected: both new tests fail because `finalDestination` is absent.

- [ ] **Step 3: Extend the provider-neutral departure contract**

Add this field to `Departure` in `src/shared/contracts.ts`, immediately before
`coachCount`:

```ts
finalDestination: {
  name: string;
  crs: string;
} | null;
```

- [ ] **Step 4: Implement minimal Darwin normalization**

Add this focused helper to `src/worker/providers/rail.ts`:

```ts
function finalDestinationFrom(
  value: unknown
): Departure["finalDestination"] {
  if (!Array.isArray(value)) return null;

  for (const location of value) {
    if (typeof location !== "object" || location === null) continue;
    const record = location as Record<string, unknown>;
    const name = stringValue(record.locationName);
    const crs = stringValue(record.crs);
    if (
      name !== null &&
      name.trim().length > 0 &&
      crs !== null &&
      crs.trim().length > 0
    ) {
      return { name, crs };
    }
  }
  return null;
}
```

Add the normalized field inside `departureFrom`:

```ts
finalDestination: finalDestinationFrom(service.destination),
coachCount: null,
```

- [ ] **Step 5: Complete typed frontend test payloads**

Add this value to every departure literal in `tests/app/render.test.ts` and
`tests/e2e/dashboard.spec.ts`:

```ts
finalDestination: { name: "London Euston", crs: "EUS" },
```

This is a mechanical migration required by the new non-optional contract.
Reverse-specific values are added with their behavior tests in Task 2.

- [ ] **Step 6: Run the focused tests, type-check, and verify GREEN**

Run:

```bash
npx vitest run tests/worker/rail.test.ts
npm run typecheck
```

Expected: all rail provider tests and TypeScript checks pass.

- [ ] **Step 7: Commit the contract and provider change**

```bash
git add src/shared/contracts.ts src/worker/providers/rail.ts tests/worker/rail.test.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: expose train final destinations"
```

### Task 2: Display Destinations on the Reverse Board

**Files:**
- Modify: `tests/app/render.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`
- Modify: `src/app/render.ts`

**Interfaces:**
- Consumes: `Departure.finalDestination` from Task 1
- Produces: `renderDeparture(service: Departure, showFinalDestination: boolean): HTMLLIElement`
- Produces: reverse-route operator metadata in the form `Operator · To Destination · N coaches`

- [ ] **Step 1: Give reverse test payloads their real destinations**

When constructing each reverse payload in `tests/app/render.test.ts` and
`tests/e2e/dashboard.spec.ts`, override the field so London
Overground terminates at Watford and a through LNR/WMR service continues:

```ts
finalDestination: service.operatorCode === "LO"
  ? { name: "Watford Junction", crs: "WFJ" }
  : { name: "Birmingham New Street", crs: "BHM" }
```

- [ ] **Step 2: Write failing rendering and accessibility tests**

Add a reverse-route test to `tests/app/render.test.ts`:

```ts
it("shows final destinations only for Euston to Watford", () => {
  const reverse = getByRole(render(reversePayload), "region", {
    name: "Departures"
  });
  const forward = getByRole(render(livePayload), "region", {
    name: "Departures"
  });

  expect(within(reverse).getByText(
    "London Overground · To Watford Junction · 5 coaches"
  )).toBeTruthy();
  expect(within(reverse).getAllByText(
    /LNR · To Birmingham New Street/
  )).toHaveLength(2);
  expect(within(reverse).getByRole("article", {
    name: "12:20 LNR departure to Birmingham New Street"
  })).toBeTruthy();
  expect(within(forward).queryByText(/To London Euston/)).toBeNull();
});
```

Add a null-fallback assertion:

```ts
it("omits unavailable final destination metadata", () => {
  const payload = {
    ...reversePayload,
    departures: {
      ...reversePayload.departures,
      services: [{
        ...reversePayload.departures.services[0],
        finalDestination: null
      }]
    }
  };

  const departures = getByRole(render(payload), "region", {
    name: "Departures"
  });
  expect(within(departures).getByText(
    "London Overground · 5 coaches"
  )).toBeTruthy();
  expect(within(departures).queryByText(/ · To /)).toBeNull();
});
```

The production change that makes these tests pass is passing route display
context into the real renderer and including the normalized destination in
both visible and accessible text.

- [ ] **Step 3: Run the rendering tests and verify RED**

Run:

```bash
npx vitest run tests/app/render.test.ts
```

Expected: the reverse destination assertions fail because the renderer still
outputs only operator and coach text.

- [ ] **Step 4: Implement the compact reverse-route presentation**

Change the renderer signature:

```ts
function renderDeparture(
  service: Departure,
  showFinalDestination: boolean
): HTMLLIElement {
```

Build optional destination text once:

```ts
const finalDestination = showFinalDestination &&
  service.finalDestination !== null
  ? service.finalDestination.name
  : null;
```

Set the accessible label:

```ts
serviceDetails.setAttribute(
  "aria-label",
  `${formatTime(service.scheduledDeparture)} ${service.operator} departure${
    finalDestination === null ? "" : ` to ${finalDestination}`
  }`
);
```

Replace the existing operator text construction with:

```ts
const operatorMetadata = [
  service.operator,
  finalDestination === null ? null : `To ${finalDestination}`,
  service.coachCount == null
    ? null
    : `${service.coachCount} ${
      service.coachCount === 1 ? "coach" : "coaches"
    }`
].filter((value): value is string => value !== null);
const operator = element("p", {
  className: "departure-operator",
  text: operatorMetadata.join(" · ")
});
```

Extend `renderDepartures` with a boolean parameter and pass it to each row:

```ts
function renderDepartures(
  panel: DeparturesPanel,
  now: Date,
  showFinalDestination: boolean
): HTMLElement {
  // existing panel rendering
  for (const service of panel.services) {
    list.appendChild(renderDeparture(service, showFinalDestination));
  }
}
```

In `renderDashboard`, calculate the display condition and pass it through:

```ts
const reverseRoute = ROUTES["EUS-WFJ"];
const showFinalDestination =
  payload.route.origin.crs === reverseRoute.origin.crs &&
  payload.route.destination.crs === reverseRoute.destination.crs;
panels.appendChild(renderDepartures(
  payload.departures,
  now,
  showFinalDestination
));
```

Do not modify CSS: the existing `.departure-operator` line already permits
natural wrapping and the mobile grid spans columns 2 through the end.

- [ ] **Step 5: Run rendering tests and type-check**

Run:

```bash
npx vitest run tests/app/render.test.ts
npm run typecheck
```

Expected: rendering tests and TypeScript checks pass.

- [ ] **Step 6: Add a browser-level destination and overflow assertion**

In the existing route-switch browser test in `tests/e2e/dashboard.spec.ts`,
after selecting `To Watford`, assert:

```ts
await expect(page.getByText(
  "London Northwestern Railway · To Birmingham New Street"
)).toBeVisible();
expect(await hasHorizontalOverflow(page)).toBe(false);
```

Use the existing test's actual operator metadata string when it also includes
a coach count.

- [ ] **Step 7: Run the focused browser test**

Run:

```bash
npx playwright test tests/e2e/dashboard.spec.ts --grep "switches route content"
```

Expected: the route switch displays a real destination and retains no
horizontal overflow.

- [ ] **Step 8: Commit the reverse-board presentation**

```bash
git add src/app/render.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: show train destinations on reverse board"
```

### Task 3: Verify, Deploy, and Publish

**Files:**
- No source files created or modified

**Interfaces:**
- Consumes: the committed Worker and frontend changes
- Produces: a verified production deployment at `https://dashboard.cchk.uk`

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Expected: every test, type check, build, and browser check passes with no
diff-formatting errors.

- [ ] **Step 2: Deploy the verified source**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports a successful version deployed to
`dashboard.cchk.uk`.

- [ ] **Step 3: Verify the live API field**

Run:

```bash
curl -fsS 'https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ' |
  jq '[
    .departures.services[] |
    {operatorCode, finalDestination}
  ] | unique_by([.operatorCode, .finalDestination.crs])'
```

Expected: Overground entries include Watford Junction and through LNR/WMR
entries include a destination beyond Watford.

- [ ] **Step 4: Verify production protocol behavior**

Run:

```bash
npm run smoke:production
```

Expected: the page and API checks pass, including CORS, ETag, and conditional
`304` behavior.

- [ ] **Step 5: Push the verified commits**

```bash
git push origin main
```

Expected: GitHub `main` advances to include the specification, plan, contract,
provider, rendering, and test commits.
