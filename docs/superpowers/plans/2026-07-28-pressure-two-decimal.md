# Two-Decimal Pressure Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display current mean sea-level pressure with exactly two decimal places while preserving the numeric public API value.

**Architecture:** Change only the existing pressure presentation in `renderWeather`. Keep `weather.pressureMslHpa` numeric, preserve the unavailable state, and reuse the existing weather measurement row and assistive-text pattern.

**Tech Stack:** TypeScript, Vitest, Testing Library DOM, Vite, Playwright, Cloudflare Workers

## Global Constraints

- A numeric API value such as `1016.8` displays as `1016.80 hPa`.
- Assistive text uses the same fixed two-decimal value followed by `hectopascals`.
- `weather.pressureMslHpa` remains a number or `null` in API version `1`.
- Unavailable pressure continues to display `Unavailable`.
- Do not change providers, caching, layouts, rail behavior, forecasts, or ESP32 compatibility.
- Follow RED/GREEN test-driven development.
- Push the verified commit to `main` and deploy it to `https://dashboard.cchk.uk`.

---

### Task 1: Format and publish pressure with two decimal places

**Files:**

- Modify: `tests/app/render.test.ts`
- Modify: `src/app/render.ts`

**Interfaces:**

- Consumes: `WeatherPanel.pressureMslHpa: number | null`
- Preserves: `weatherValue(term: string, visible: string, expanded: string)`
- Preserves: `/api/v1/dashboard` and response `version: 1`
- Produces: visible pressure text with exactly two decimal places

- [ ] **Step 1: Write the failing render expectation**

In the existing `renders only current weather measurements` test, replace:

```ts
expect(within(weather).getByText("1016 hPa")).toBeTruthy();
```

with:

```ts
expect(within(weather).getByText("1016.40 hPa")).toBeTruthy();
expect(within(weather).getByText("1016.40 hectopascals")).toBeTruthy();
```

The existing `livePayload.weather.pressureMslHpa` remains `1016.4`, proving
that a trailing zero is retained. Do not change the unavailable-pressure test.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/app/render.test.ts
```

Expected: FAIL because the renderer currently rounds the visible value to
`1016 hPa` and the assistive text to `1016 hectopascals`.

- [ ] **Step 3: Implement fixed two-decimal pressure formatting**

In the non-null pressure branch of `src/app/render.ts`, replace both
`Math.round(panel.pressureMslHpa)` calls:

```ts
panel.pressureMslHpa === null
  ? weatherValue("Pressure", "Unavailable", "Pressure unavailable")
  : weatherValue(
      "Pressure",
      `${panel.pressureMslHpa.toFixed(2)} hPa`,
      `${panel.pressureMslHpa.toFixed(2)} hectopascals`
    )
```

Do not add a formatter abstraction, configuration option, API string field, or
CSS change.

- [ ] **Step 4: Verify the focused behavior GREEN**

Run:

```bash
npm test -- tests/app/render.test.ts
npm run typecheck
git diff --check
```

Expected: 18 render/runtime tests pass, typecheck exits `0`, and the diff has
no whitespace errors.

- [ ] **Step 5: Run the complete publication gate**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit tests and Playwright tests pass, and both Vite production
builds exit `0`.

- [ ] **Step 6: Commit and push the verified source**

Run:

```bash
git add src/app/render.ts tests/app/render.test.ts
git commit -m "fix: show pressure to two decimals"
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: the push is a fast-forward and the local and remote SHAs match.

- [ ] **Step 7: Deploy the exact clean commit**

Run:

```bash
git diff --quiet
git diff --cached --quiet
npm run deploy
```

Record the Cloudflare Version ID.

- [ ] **Step 8: Verify production**

Run:

```bash
npm run smoke:production
```

Then use headless Chromium at `1440×900` and `390×844` to verify:

```ts
await weather.getByText(/^\d+\.\d{2} hPa$/).waitFor();
```

Also confirm:

- the API `weather.pressureMslHpa` remains a JSON number;
- the weather and departures panels retain their desktop and phone order;
- neither viewport has horizontal overflow; and
- the browser console contains no application errors.
