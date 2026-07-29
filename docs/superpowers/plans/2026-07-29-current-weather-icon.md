# Current Weather Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the dashboard's current-weather icon to its live Open-Meteo condition code.

**Architecture:** Keep the public weather contract unchanged. The renderer maps
the existing numeric `weatherCode` to one of seven decorative inline SVG
icons, while retaining the visible condition text as the accessible
description.

**Tech Stack:** TypeScript, DOM SVG APIs, Vitest, Testing Library, Playwright.

## Global Constraints

- Select the weather summary icon from the existing public `weather.weatherCode` value.
- Use compact, line-based symbols for clear, partly cloudy, cloudy, fog, rain, snow, and thunderstorm conditions.
- Keep the current condition text visible beside the icon.
- Do not change the weather provider, API contract, weather measurements, train information, layout, or theme behaviour.
- For any unknown code, show the cloud icon.

---

## File Structure

- Modify: `src/app/render.ts` — define weather-icon kinds and select the
  summary icon from the existing code.
- Modify: `tests/app/render.test.ts` — prove each code group produces the
  correct decorative SVG class while retaining condition text.

### Task 1: Render an icon that matches the current condition

**Files:**
- Modify: `src/app/render.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**
- Consumes `WeatherPanel.weatherCode: number | null`.
- Produces one SVG with `.icon-weather` plus exactly one condition class:
  `.icon-sun`, `.icon-partly-cloudy`, `.icon-cloud`, `.icon-fog`,
  `.icon-rain`, `.icon-snow`, or `.icon-thunderstorm`.
- Keeps `weather-condition` text unchanged.

- [ ] **Step 1: Write the failing rendering test**

  Add a table-driven test in `tests/app/render.test.ts` using the existing
  `livePayload`. For each case, call `render()` with the listed
  `weatherCode` and `condition`, then assert the weather region contains
  the expected class and the visible text:

  ```ts
  const cases = [
    [0, "Clear sky", "icon-sun"],
    [2, "Partly cloudy", "icon-partly-cloudy"],
    [61, "Rain", "icon-rain"],
    [71, "Snow fall", "icon-snow"],
    [95, "Thunderstorm", "icon-thunderstorm"],
    [999, "Conditions unavailable", "icon-cloud"]
  ] as const;

  for (const [weatherCode, condition, iconClass] of cases) {
    const weather = getByRole(render({
      ...livePayload,
      weather: { ...livePayload.weather, weatherCode, condition }
    }), "region", { name: "Current weather" });

    expect(weather.querySelector(`.${iconClass}`)).toBeTruthy();
    expect(within(weather).getByText(condition)).toBeTruthy();
  }
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: FAIL because the renderer always emits `.icon-weather` with
  the cloud path and no condition-specific class.

- [ ] **Step 3: Add the minimal condition-icon mapping**

  In `src/app/render.ts`:

  1. Extend `IconKind` with `sun`, `partly-cloudy`, `cloud`,
     `fog`, `rain`, `snow`, and `thunderstorm`; retain existing
     non-weather icon kinds.
  2. Add one compact line SVG path for each new icon kind in `staticIcon`.
  3. Add `weatherIconKind(weatherCode: number | null): WeatherIconKind`
     with these exact groups:

     ```ts
     if (weatherCode === 0 || weatherCode === 1) return "sun";
     if (weatherCode === 2) return "partly-cloudy";
     if (weatherCode === 3) return "cloud";
     if (weatherCode === 45 || weatherCode === 48) return "fog";
     if (
       (weatherCode !== null && weatherCode >= 51 && weatherCode <= 67) ||
       (weatherCode !== null && weatherCode >= 80 && weatherCode <= 82)
     ) return "rain";
     if (
       (weatherCode !== null && weatherCode >= 71 && weatherCode <= 77) ||
       (weatherCode !== null && weatherCode >= 85 && weatherCode <= 86)
     ) return "snow";
     if (weatherCode !== null && weatherCode >= 95 && weatherCode <= 99) {
       return "thunderstorm";
     }
     return "cloud";
     ```

  4. Replace `staticIcon("weather")` in `renderWeather` with
     `staticIcon(weatherIconKind(panel.weatherCode))`, then add the stable
     `icon-weather` class to that SVG so the existing CSS sizing and colour
     rules still apply.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: PASS; clear sky receives the sun icon, all listed weather groups
  use their matching icon, unknown values use cloud, and condition text remains
  visible.

- [ ] **Step 5: Run project verification**

  ```bash
  npm test
  npm run typecheck
  npm run test:e2e
  npm run build
  git diff --check
  ```

  Expected: every command exits successfully.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/render.ts tests/app/render.test.ts
  git commit -m "feat: match weather icon to conditions"
  ```
