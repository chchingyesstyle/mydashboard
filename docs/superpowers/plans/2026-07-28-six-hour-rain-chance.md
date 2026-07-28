# Six-Hour Rain Chance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the highest hourly rain probability during the next six forecast hours for Watford Junction in the public API and web dashboard.

**Architecture:** Extend the existing Open-Meteo adapter to request one six-hour hourly series, validate it, and reduce it to one numeric or `null` value. Carry that provider-neutral value through the existing version 1 weather contract and render one additional definition-list measurement without exposing the hourly series.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, Open-Meteo, Vitest, Testing Library, Playwright

## Global Constraints

- Keep `/api/v1/dashboard` at version `1`.
- Add `rainChanceNext6HoursPercent: number | null`; do not expose hourly arrays.
- Define the value as the maximum of exactly six upcoming hourly `precipitation_probability` values.
- Keep valid current weather available when the rain series is absent, incomplete, non-numeric, non-finite, or outside 0 through 100.
- Display `Rain chance, next 6 hours` with `<value>%` and assistive text `<value> percent`.
- Display `Unavailable` when the rain value is `null`.
- Do not add charts, hourly lists, daily forecasts, coach counts, dependencies, or unrelated refactors.
- Keep existing weather caching, status, `ETag`, CORS, pressure formatting, and layout behavior unchanged.
- Never print or commit credentials.

---

## File Structure

- `src/shared/contracts.ts`: owns the additive provider-neutral API field.
- `src/worker/providers/weather.ts`: owns Open-Meteo request parameters, validation, and six-value reduction.
- `src/worker/dashboard.ts`: owns the all-weather-unavailable `null` fallback.
- `src/app/render.ts`: owns the visible and assistive rain measurement.
- `tests/fixtures/open-meteo.ts`: owns a representative six-hour Open-Meteo response.
- `tests/worker/weather.test.ts`: verifies request construction, reduction, and isolated invalid-series handling.
- `tests/worker/dashboard.test.ts`: verifies the live and unavailable public API weather objects.
- `tests/app/render.test.ts`: verifies percentage and unavailable rendering.
- `tests/app/api.test.ts`, `tests/worker/index.test.ts`, and `tests/e2e/dashboard.spec.ts`: keep typed version 1 fixtures aligned with the additive contract.

### Task 1: Weather Contract and Provider Pipeline

**Files:**

- Modify: `src/shared/contracts.ts`
- Modify: `src/worker/providers/weather.ts`
- Modify: `src/worker/dashboard.ts`
- Modify: `tests/fixtures/open-meteo.ts`
- Modify: `tests/worker/weather.test.ts`
- Modify: `tests/worker/dashboard.test.ts`
- Modify: `tests/worker/index.test.ts`
- Modify: `tests/app/api.test.ts`
- Modify: `tests/app/render.test.ts`
- Modify: `tests/e2e/dashboard.spec.ts`

**Interfaces:**

- Consumes: Open-Meteo `hourly.precipitation_probability` requested with `forecast_hours=6`.
- Produces: `WeatherPanel.rainChanceNext6HoursPercent: number | null` and the same field on `WeatherValue`.

- [ ] **Step 1: Extend the Open-Meteo fixture with six hourly probabilities**

Add this representative response data to `openMeteoFixture`:

```ts
hourly_units: {
  time: "iso8601",
  precipitation_probability: "%"
},
hourly: {
  time: [
    "2026-07-28T13:00",
    "2026-07-28T14:00",
    "2026-07-28T15:00",
    "2026-07-28T16:00",
    "2026-07-28T17:00",
    "2026-07-28T18:00"
  ],
  precipitation_probability: [10, 20, 35, 60, 45, 30]
}
```

- [ ] **Step 2: Write failing provider tests for maximum selection and invalid-series isolation**

Change the expected normalized weather value in
`tests/worker/weather.test.ts` to include:

```ts
rainChanceNext6HoursPercent: 60
```

Add a table-driven test that passes these series and expects `null`:

```ts
it.each([
  ["absent", undefined],
  ["incomplete", [10, 20, 35, 60, 45]],
  ["non-numeric", [10, 20, 35, "60", 45, 30]],
  ["non-finite", [10, 20, 35, Number.NaN, 45, 30]],
  ["below range", [10, 20, -1, 60, 45, 30]],
  ["above range", [10, 20, 35, 101, 45, 30]]
])("keeps current weather when the rain series is %s", (_case, series) => {
  const payload = {
    ...openMeteoFixture,
    hourly: series === undefined
      ? undefined
      : { ...openMeteoFixture.hourly, precipitation_probability: series }
  };

  expect(normalizeWeather(payload)).toMatchObject({
    temperatureC: 21.4,
    rainChanceNext6HoursPercent: null
  });
});
```

Rename the request test to `requests current weather and the next six rain probabilities for Watford Junction`. Replace its no-hourly assertion with:

```ts
expect(url.searchParams.get("hourly")).toBe("precipitation_probability");
expect(url.searchParams.get("forecast_hours")).toBe("6");
expect(requestedUrl).not.toContain("daily=");
```

- [ ] **Step 3: Run the provider tests to verify they fail**

Run:

```bash
npm test -- tests/worker/weather.test.ts
```

Expected: FAIL because normalization omits `rainChanceNext6HoursPercent` and the request omits `hourly` and `forecast_hours`.

- [ ] **Step 4: Add the provider-neutral contract field**

Add this required field to `WeatherPanel` in `src/shared/contracts.ts`, after
`precipitationMm`:

```ts
rainChanceNext6HoursPercent: number | null;
```

Extend the explicit nullable portion of `WeatherValue` in
`src/worker/providers/weather.ts`:

```ts
} & {
  pressureMslHpa: number | null;
  rainChanceNext6HoursPercent: number | null;
};
```

- [ ] **Step 5: Implement six-value validation and reduction in the weather adapter**

Add a focused helper in `src/worker/providers/weather.ts`:

```ts
function rainChanceNext6Hours(payload: Record<string, unknown>): number | null {
  const hourly = payload.hourly;
  if (typeof hourly !== "object" || hourly === null) return null;

  const probabilities =
    (hourly as Record<string, unknown>).precipitation_probability;
  if (
    !Array.isArray(probabilities) ||
    probabilities.length !== 6 ||
    !probabilities.every(
      (value) =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
    )
  ) {
    return null;
  }

  return Math.max(...probabilities);
}
```

Retain the top-level record once in `normalizeWeather`, then add the reduced
value to its return object:

```ts
const response = payload as Record<string, unknown>;
const current = response.current;
```

```ts
rainChanceNext6HoursPercent: rainChanceNext6Hours(response),
```

Add these request parameters in `fetchWeather`:

```ts
url.searchParams.set("hourly", "precipitation_probability");
url.searchParams.set("forecast_hours", "6");
```

- [ ] **Step 6: Update every typed dashboard fixture and unavailable fallback**

In `src/worker/dashboard.ts`, add this to the unavailable weather object:

```ts
rainChanceNext6HoursPercent: null,
```

Add `rainChanceNext6HoursPercent: 60` beside the existing live-weather
precipitation or pressure fields in:

- `tests/worker/dashboard.test.ts`
- `tests/app/api.test.ts`
- `tests/app/render.test.ts`
- `tests/e2e/dashboard.spec.ts`

Add `rainChanceNext6HoursPercent: null` to every explicitly unavailable weather
object in:

- `tests/worker/dashboard.test.ts`
- `tests/worker/index.test.ts`
- `tests/app/render.test.ts`

Preserve `60` in the render fixture used to test pressure-only unavailability;
pressure absence must not affect rain chance.

- [ ] **Step 7: Run focused data-pipeline tests and type checking**

Run:

```bash
npm test -- tests/worker/weather.test.ts tests/worker/dashboard.test.ts tests/worker/index.test.ts tests/app/api.test.ts
npm run typecheck
```

Expected: all selected tests PASS and TypeScript reports no errors.

- [ ] **Step 8: Commit the data-pipeline change**

```bash
git add src/shared/contracts.ts src/worker/providers/weather.ts src/worker/dashboard.ts tests/fixtures/open-meteo.ts tests/worker/weather.test.ts tests/worker/dashboard.test.ts tests/worker/index.test.ts tests/app/api.test.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: add six-hour rain chance data"
```

### Task 2: Weather Panel Presentation

**Files:**

- Modify: `src/app/render.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**

- Consumes: `WeatherPanel.rainChanceNext6HoursPercent: number | null` from Task 1.
- Produces: a `Rain chance, next 6 hours` definition-list measurement with percentage or unavailable text.

- [ ] **Step 1: Write failing rendering assertions**

Rename `renders only current weather measurements` to
`renders current weather and the six-hour rain chance`.

Add these assertions:

```ts
expect(within(weather).getByText("Rain chance, next 6 hours")).toBeTruthy();
expect(within(weather).getByText("60%")).toBeTruthy();
expect(within(weather).getByText("60 percent")).toBeTruthy();
```

Add an isolated unavailable-value test:

```ts
it("shows unavailable rain chance without hiding current weather", () => {
  const weather = getByRole(render({
    ...livePayload,
    weather: {
      ...livePayload.weather,
      rainChanceNext6HoursPercent: null
    }
  }), "region", { name: "Current weather" });

  expect(within(weather).getByText("Rain chance, next 6 hours")).toBeTruthy();
  expect(within(weather).getByText("Rain chance unavailable")).toBeTruthy();
  expect(within(weather).getByText("21.4°C")).toBeTruthy();
});
```

Keep the existing assertions that no forecast heading or list is present.

- [ ] **Step 2: Run the rendering tests to verify they fail**

Run:

```bash
npm test -- tests/app/render.test.ts
```

Expected: FAIL because the rain measurement is not rendered.

- [ ] **Step 3: Render the rain measurement with accessible text**

Add this entry to the existing `values` array in `renderWeather`, after
`Precipitation`:

```ts
panel.rainChanceNext6HoursPercent === null
  ? weatherValue(
      "Rain chance, next 6 hours",
      "Unavailable",
      "Rain chance unavailable"
    )
  : weatherValue(
      "Rain chance, next 6 hours",
      `${panel.rainChanceNext6HoursPercent}%`,
      `${panel.rainChanceNext6HoursPercent} percent`
    ),
```

Do not add CSS or change the weather heading; the existing definition-list
layout already supports another measurement.

- [ ] **Step 4: Run rendering tests, the full unit suite, and type checking**

Run:

```bash
npm test -- tests/app/render.test.ts
npm test
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 5: Commit the presentation change**

```bash
git add src/app/render.ts tests/app/render.test.ts
git commit -m "feat: display six-hour rain chance"
```

### Task 3: Browser, Build, and Production Verification

**Files:**

- Verify only; no planned source changes.

**Interfaces:**

- Consumes: the completed version 1 API and weather measurement from Tasks 1 and 2.
- Produces: verified Cloudflare deployment at `dashboard.cchk.uk` and pushed `main`.

- [ ] **Step 1: Run browser tests and the production build**

Run:

```bash
npm run test:e2e
npm run build
```

Expected: all Playwright tests PASS and Vite completes a production build.

- [ ] **Step 2: Review the final source diff and repository state**

Run:

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Expected: no whitespace errors, only the approved spec, plan, contract,
provider, dashboard fallback, renderer, and related tests differ, and the
working tree is clean.

- [ ] **Step 3: Deploy the committed source to Cloudflare Workers**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports a successful deployment for the existing Worker and
custom-domain configuration.

- [ ] **Step 4: Run the production smoke test**

Run:

```bash
npm run smoke:production
```

Expected: the production page and `/api/v1/dashboard` smoke checks PASS.

- [ ] **Step 5: Verify the live rain value without exposing credentials**

Run:

```bash
curl --silent --show-error --fail https://dashboard.cchk.uk/api/v1/dashboard |
  jq '{version, generatedAt, weather: {status: .weather.status, rainChanceNext6HoursPercent: .weather.rainChanceNext6HoursPercent}}'
```

Expected: `version` is `1`; the rain field is a number from 0 through 100 or
`null` only if Open-Meteo omitted or invalidated the six-hour series.

- [ ] **Step 6: Push the committed `main` branch**

Run:

```bash
git push origin main
```

Expected: GitHub accepts the push to
`https://github.com/chchingyesstyle/mydashboard`.
