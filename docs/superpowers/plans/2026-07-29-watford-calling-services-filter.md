# Watford Calling Services Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every London Euston departure that Darwin confirms calls at Watford Junction, including services continuing beyond Watford.

**Architecture:** Keep Darwin's existing `filterCrs` request as the authoritative calling-point filter. Validate the board-level `filtercrs`, then normalize all services returned by that filtered board instead of inspecting each service's final destination.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest, Vite, Playwright, Wrangler

## Global Constraints

- Preserve the versioned `/api/v1/dashboard` contract.
- Keep the two-hour rail window, route-specific caching, sorting, and frontend presentation unchanged.
- Keep `DARWIN_API_KEY` in the Worker secret and send it only in the upstream `x-apikey` header.
- Make no unrelated refactors or formatting changes.

---

### Task 1: Correct Darwin Calling-Point Normalization

**Files:**
- Modify: `tests/fixtures/darwin.ts`
- Modify: `tests/worker/rail.test.ts`
- Modify: `src/worker/providers/rail.ts`

**Interfaces:**
- Consumes: `normalizeDarwin(response: unknown, destinationCrs: string): Departure[]`
- Produces: unchanged `normalizeDarwin` signature and unchanged public `Departure[]` contract

- [ ] **Step 1: Make the Darwin fixtures represent filtered boards**

Remove the impossible `other-destination` service from `darwinFixture`, because
its board declares `filtercrs: "EUS"`. Rename the reverse fixture's through
service from `reverse-other` to `reverse-through` while retaining its final
destination of Birmingham:

```ts
service({
  serviceID: "reverse-through",
  serviceIdPercentEncoded: "reverse-through",
  origin: [destination("EUS", "London Euston")],
  destination: [destination("BHM", "Birmingham New Street")],
  std: "12:30"
})
```

- [ ] **Step 2: Write the failing regression tests**

Update the reverse-route assertion in `tests/worker/rail.test.ts`:

```ts
expect(services.map(({ id, operatorCode }) => [id, operatorCode])).toEqual([
  ["reverse-lnr", "LM"],
  ["reverse-overground", "LO"],
  ["reverse-through", "LM"]
]);
```

Add a board-filter validation test:

```ts
it("rejects a Darwin board filtered to a different destination", () => {
  expect(() => normalizeDarwin(
    { ...reverseDarwinFixture, filtercrs: "EUS" },
    ROUTES["EUS-WFJ"].destination.crs
  )).toThrow("Darwin departures response was malformed");
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/worker/rail.test.ts
```

Expected: the reverse-route test fails because `reverse-through` is absent, and
the mismatched-board test fails because no error is thrown.

- [ ] **Step 4: Implement the minimal provider correction**

Delete the single-service `hasDestination` helper from
`src/worker/providers/rail.ts`. Extend the existing malformed-response check:

```ts
if (
  !generatedAt ||
  !isIsoTimestamp(generatedAt) ||
  stringValue(board.filtercrs) !== destinationCrs ||
  !Array.isArray(board.trainServices)
) {
  malformedResponse();
}
```

Remove the final-destination filter from the normalization chain:

```ts
return board.trainServices
  .filter((service): service is DarwinService =>
    typeof service === "object" && service !== null
  )
  .map((service) => departureFrom(service, generatedAt))
  .sort((first, second) =>
    first.scheduledDeparture.localeCompare(second.scheduledDeparture)
  );
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/worker/rail.test.ts
```

Expected: all Darwin rail provider tests pass with no warnings.

- [ ] **Step 6: Commit the provider correction**

```bash
git add tests/fixtures/darwin.ts tests/worker/rail.test.ts src/worker/providers/rail.ts
git commit -m "fix: include trains calling at Watford"
```

### Task 2: Verify, Deploy, and Publish

**Files:**
- No source files created or modified

**Interfaces:**
- Consumes: production Worker deployment and `/api/v1/dashboard?route=EUS-WFJ`
- Produces: verified deployment at `https://dashboard.cchk.uk`

- [ ] **Step 1: Run complete local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit, integration, browser tests, type checks, and build pass;
`git diff --check` prints no errors.

- [ ] **Step 2: Deploy the verified Worker**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports a successful production deployment.

- [ ] **Step 3: Verify the production reverse board**

Run:

```bash
curl -fsS 'https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ' |
  jq '{
    operators: [.departures.services[].operatorCode] | unique,
    serviceCount: [.departures.services[]] | length
  }'
```

Expected: `operators` includes both `"LM"` and `"LO"`, with a non-zero
`serviceCount`.

- [ ] **Step 4: Run the production smoke test**

```bash
npm run smoke:production
```

Expected: API schema, CORS, ETag, and page smoke checks pass.

- [ ] **Step 5: Push the verified commits**

```bash
git push origin main
```

Expected: GitHub `main` advances to include the design, implementation plan,
and provider correction commits.
