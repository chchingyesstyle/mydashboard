# Daily Temperature Extremes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the displayed wind measurement with Watford Junction's local-day minimum and maximum temperatures while preserving API v1 wind compatibility.

**Architecture:** Request two Open-Meteo daily aggregates alongside the existing current and six-hour rain data. Normalize only the first local-day values into two additive API fields, then replace the Wind definition-list row with an accessible Today temperature-range row.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, Open-Meteo, Vitest, Testing Library, Playwright

## Global Constraints

- Keep `/api/v1/dashboard` at version `1`.
- Add `temperatureMinTodayC: number | null` and `temperatureMaxTodayC: number | null`.
- Use the first local-day values from `daily.temperature_2m_min` and `daily.temperature_2m_max`.
- Keep `windSpeedKph` and `windDirectionDegrees` in API v1 and the provider request; remove only their web display.
- Request only `temperature_2m_min` and `temperature_2m_max` daily variables with `forecast_days=1`; do not expose daily arrays or add a forecast list or chart.
- Render `Today` as `Min <value>°C · Max <value>°C`, with an accessible expanded sentence.
- Render `Unavailable` when either daily temperature is absent or invalid, without hiding current weather.
- Keep the existing rain chance, pressure formatting, cache timing, `ETag`, CORS, responsive layout, and credentials handling unchanged.
- Add no dependencies, CSS, coach count work, or unrelated refactors.

---

## File Structure

- `src/shared/contracts.ts`: owns the two additive provider-neutral temperature fields.
- `src/worker/providers/weather.ts`: owns Open-Meteo daily request parameters and first-value normalization.
- `src/worker/dashboard.ts`: owns `null` values in the fully unavailable weather API response.
- `src/app/render.ts`: owns replacement of the Wind row with the Today range row.
- `tests/fixtures/open-meteo.ts`: owns a representative one-day daily response.
- `tests/worker/weather.test.ts`: verifies daily request construction, normalization, and invalid daily values.
- `tests/worker/dashboard.test.ts`: verifies live and unavailable weather API objects.
- `tests/app/render.test.ts`: verifies range text, accessible text, unavailable text, and absence of Wind.
- `tests/app/api.test.ts`, `tests/worker/index.test.ts`, and `tests/e2e/dashboard.spec.ts`: keep typed API fixtures aligned with the additive contract.

### Task 1: Daily Temperature Contract and Provider

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

- Consumes: Open-Meteo `daily.temperature_2m_min` and `daily.temperature_2m_max` arrays.
- Produces: `WeatherPanel.temperatureMinTodayC: number | null` and `WeatherPanel.temperatureMaxTodayC: number | null`.

- [ ] **Step 1: Extend the Open-Meteo fixture with daily local-day values**

Add this data to `tests/fixtures/open-meteo.ts`:

```ts
daily_units: {
  time: "iso8601",
  temperature_2m_min: "°C",
  temperature_2m_max: "°C"
},
daily: {
  time: ["2026-07-28"],
  temperature_2m_min: [13.2],
  temperature_2m_max: [26.8]
}
```

- [ ] **Step 2: Write failing provider tests for the two first daily values**

Extend the first expected normalized weather object in
`tests/worker/weather.test.ts` with:

```ts
temperatureMinTodayC: 13.2,
temperatureMaxTodayC: 26.8,
```

Add this table-driven test, using literal expectations independent of the
adapter:

```ts
it.each([
  ["absent", undefined],
  ["empty", []],
  ["non-numeric minimum", ["13.2"]],
  ["non-finite maximum", [Number.NaN]]
])("keeps current weather when daily temperatures are %s", (_case, values) => {
  const payload = {
    ...openMeteoFixture,
    daily: values === undefined
      ? undefined
      : {
          ...openMeteoFixture.daily,
          temperature_2m_min: values,
          temperature_2m_max: values
        }
  };

  expect(normalizeWeather(payload)).toMatchObject({
    temperatureC: 21.4,
    temperatureMinTodayC: null,
    temperatureMaxTodayC: null
  });
});
```

Extend the request test with:

```ts
expect(url.searchParams.get("daily")).toBe(
  "temperature_2m_min,temperature_2m_max"
);
expect(url.searchParams.get("forecast_days")).toBe("1");
```

- [ ] **Step 3: Run the provider tests to verify they fail**

Run:

```bash
npm test -- tests/worker/weather.test.ts
```

Expected: FAIL because the weather adapter has no daily request parameters and
does not return the two daily temperature fields.

- [ ] **Step 4: Add the additive API and provider types**

Add these fields to `WeatherPanel` in `src/shared/contracts.ts`, after
`temperatureC`:

```ts
temperatureMinTodayC: number | null;
temperatureMaxTodayC: number | null;
```

Add the same two nullable fields to the explicit nullable portion of
`WeatherValue` in `src/worker/providers/weather.ts`:

```ts
} & {
  pressureMslHpa: number | null;
  rainChanceNext6HoursPercent: number | null;
  temperatureMinTodayC: number | null;
  temperatureMaxTodayC: number | null;
};
```

- [ ] **Step 5: Implement first-value daily normalization and request parameters**

Add a focused helper to `src/worker/providers/weather.ts`:

```ts
function todayTemperatureExtremes(
  payload: Record<string, unknown>
): { min: number | null; max: number | null } {
  const daily = payload.daily;
  if (typeof daily !== "object" || daily === null) {
    return { min: null, max: null };
  }

  const values = daily as Record<string, unknown>;
  const min = values.temperature_2m_min;
  const max = values.temperature_2m_max;
  if (
    !Array.isArray(min) ||
    !Array.isArray(max) ||
    typeof min[0] !== "number" ||
    typeof max[0] !== "number" ||
    !Number.isFinite(min[0]) ||
    !Number.isFinite(max[0])
  ) {
    return { min: null, max: null };
  }

  return { min: min[0], max: max[0] };
}
```

Compute the helper once in `normalizeWeather` and add its values to the return
object:

```ts
const temperatures = todayTemperatureExtremes(response);
```

```ts
temperatureMinTodayC: temperatures.min,
temperatureMaxTodayC: temperatures.max,
```

In `fetchWeather`, add:

```ts
url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max");
url.searchParams.set("forecast_days", "1");
```

Do not remove `wind_speed_10m`, `wind_direction_10m`, or `wind_speed_unit`.

- [ ] **Step 6: Align all typed weather fixtures and unavailable fallbacks**

In `src/worker/dashboard.ts`, add both fields as `null` to the unavailable
weather object:

```ts
temperatureMinTodayC: null,
temperatureMaxTodayC: null,
```

Add the following live values beside `temperatureC` in each typed fixture:

```ts
temperatureMinTodayC: 13.2,
temperatureMaxTodayC: 26.8,
```

Apply this to:

- `tests/worker/dashboard.test.ts`
- `tests/app/api.test.ts`
- `tests/app/render.test.ts`
- `tests/e2e/dashboard.spec.ts`

Add both `null` fields to every explicitly unavailable weather fixture in:

- `tests/worker/dashboard.test.ts`
- `tests/worker/index.test.ts`
- `tests/app/render.test.ts`

- [ ] **Step 7: Run focused data tests and type checking**

Run:

```bash
npm test -- tests/worker/weather.test.ts tests/worker/dashboard.test.ts tests/worker/index.test.ts tests/app/api.test.ts
npm run typecheck
```

Expected: all selected tests PASS and TypeScript reports no errors.

- [ ] **Step 8: Commit the data-pipeline change**

```bash
git add src/shared/contracts.ts src/worker/providers/weather.ts src/worker/dashboard.ts tests/fixtures/open-meteo.ts tests/worker/weather.test.ts tests/worker/dashboard.test.ts tests/worker/index.test.ts tests/app/api.test.ts tests/app/render.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: add daily temperature extremes"
```

### Task 2: Replace the Wind Row with Today Temperatures

**Files:**

- Modify: `src/app/render.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**

- Consumes: `WeatherPanel.temperatureMinTodayC` and
  `WeatherPanel.temperatureMaxTodayC` from Task 1.
- Produces: one `Today` weather measurement and no rendered Wind measurement.

- [ ] **Step 1: Write failing rendering assertions**

In the main weather-rendering test, remove the assertion for
`12.1 km/h at 240°` and add:

```ts
expect(within(weather).getByText("Today")).toBeTruthy();
expect(within(weather).getByText("Min 13.2°C · Max 26.8°C")).toBeTruthy();
expect(within(weather).getByText(
  "Today, minimum temperature 13.2 degrees Celsius, maximum temperature 26.8 degrees Celsius"
)).toBeTruthy();
expect(within(weather).queryByText(/km\/h at/)).toBeNull();
```

Add an unavailable-range test:

```ts
it("shows unavailable today temperatures without hiding current weather", () => {
  const weather = getByRole(render({
    ...livePayload,
    weather: {
      ...livePayload.weather,
      temperatureMinTodayC: null,
      temperatureMaxTodayC: null
    }
  }), "region", { name: "Current weather" });

  expect(within(weather).getByText("Today")).toBeTruthy();
  expect(within(weather).getByText("Today temperatures unavailable")).toBeTruthy();
  expect(within(weather).getByText("21.4°C")).toBeTruthy();
});
```

- [ ] **Step 2: Run the rendering tests to verify they fail**

Run:

```bash
npm test -- tests/app/render.test.ts
```

Expected: FAIL because the renderer still displays Wind and has no Today row.

- [ ] **Step 3: Render the Today range using the existing measurement pattern**

Replace the existing Wind `weatherValue` entry in `renderWeather` with:

```ts
panel.temperatureMinTodayC === null || panel.temperatureMaxTodayC === null
  ? weatherValue("Today", "Unavailable", "Today temperatures unavailable")
  : weatherValue(
      "Today",
      `Min ${panel.temperatureMinTodayC}°C · Max ${panel.temperatureMaxTodayC}°C`,
      `Today, minimum temperature ${panel.temperatureMinTodayC} degrees Celsius, maximum temperature ${panel.temperatureMaxTodayC} degrees Celsius`
    ),
```

Do not add CSS, change the panel heading, or remove wind fields from the API.

- [ ] **Step 4: Run rendering, unit, and type checks**

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
git commit -m "feat: show daily temperature extremes"
```

### Task 3: Browser, Production, and GitHub Verification

**Files:**

- Verify only; no planned source changes.

**Interfaces:**

- Consumes: version 1 daily-temperature fields and the Today display from Tasks 1 and 2.
- Produces: verified deployment at `dashboard.cchk.uk` and a pushed `main` branch.

- [ ] **Step 1: Run browser tests and the production build**

Run:

```bash
npm run test:e2e
npm run build
```

Expected: all Playwright tests PASS and Vite completes the Worker and client
production builds.

- [ ] **Step 2: Review the final diff**

Run:

```bash
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Expected: no whitespace errors, no unrelated files, and a clean working tree.

- [ ] **Step 3: Deploy the committed source**

Run:

```bash
npm run deploy
```

Expected: Wrangler reports successful deployment to the existing
`dashboard.cchk.uk` custom domain.

- [ ] **Step 4: Verify production behavior**

Run:

```bash
npm run smoke:production
curl --silent --show-error --fail https://dashboard.cchk.uk/api/v1/dashboard |
  jq '{version, weather: {status: .weather.status, temperatureMinTodayC: .weather.temperatureMinTodayC, temperatureMaxTodayC: .weather.temperatureMaxTodayC, windSpeedKph: .weather.windSpeedKph, windDirectionDegrees: .weather.windDirectionDegrees}}'
```

Expected: version `1`; both daily temperature values are numbers or both are
`null`; wind fields remain present for API compatibility; and the production
smoke test confirms page, CORS, ETag, and conditional-response behavior.

- [ ] **Step 5: Push `main` to GitHub**

Run:

```bash
git push origin main
```

Expected: GitHub accepts the committed source at
`https://github.com/chchingyesstyle/mydashboard`.
