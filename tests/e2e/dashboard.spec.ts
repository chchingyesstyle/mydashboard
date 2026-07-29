import { expect, test, type Page } from "@playwright/test";
import type { DashboardPayload } from "../../src/shared/contracts";

const liveDashboard: DashboardPayload = {
  version: 1,
  generatedAt: "2026-07-28T12:00:00.000Z",
  status: "live",
  route: {
    origin: { name: "Watford Junction", crs: "WFJ" },
    destination: { name: "London Euston", crs: "EUS" }
  },
  departures: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    services: [
      {
        id: "service-1212",
        scheduledDeparture: "2026-07-28T12:12:00+01:00",
        expectedDeparture: "2026-07-28T12:12:00+01:00",
        expectedDisplay: "On time",
        platform: "9",
        operator: "London Northwestern Railway",
        operatorCode: "LM",
        status: "on_time",
        isCancelled: false,
        reason: null
      },
      {
        id: "service-1220",
        scheduledDeparture: "2026-07-28T12:20:00+01:00",
        expectedDeparture: "2026-07-28T12:26:00+01:00",
        expectedDisplay: "Expected 12:26",
        platform: "7",
        operator: "Avanti West Coast",
        operatorCode: "VT",
        status: "delayed",
        isCancelled: false,
        reason: "Delayed by a late-running service"
      },
      {
        id: "service-1227",
        scheduledDeparture: "2026-07-28T12:27:00+01:00",
        expectedDeparture: null,
        expectedDisplay: "Cancelled",
        platform: null,
        operator: "London Overground",
        operatorCode: "LO",
        status: "cancelled",
        isCancelled: true,
        reason: "Cancelled due to a fault on this train"
      },
      {
        id: "service-1234",
        scheduledDeparture: "2026-07-28T12:34:00+01:00",
        expectedDeparture: "2026-07-28T12:34:00+01:00",
        expectedDisplay: "On time",
        platform: "10",
        operator: "London Northwestern Railway",
        operatorCode: "LM",
        status: "on_time",
        isCancelled: false,
        reason: null
      }
    ],
    error: null
  },
  weather: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    temperatureC: 21.4,
    temperatureMinTodayC: 13.2,
    temperatureMaxTodayC: 26.8,
    apparentTemperatureC: 20.8,
    relativeHumidityPercent: 63,
    precipitationMm: 0,
    rainChanceNext6HoursPercent: 60,
    weatherCode: 2,
    condition: "Partly cloudy",
    windSpeedKph: 12.1,
    windDirectionDegrees: 240,
    pressureMslHpa: 1016.4,
    error: null
  }
};

async function openDashboard(page: Page): Promise<void> {
  await page.route("**/api/v1/dashboard", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(liveDashboard)
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Departures" })).toBeVisible();
}

test("places departures and weather side by side in landscape", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  const departures = await page.locator(".departures-panel").boundingBox();
  const weather = await page.locator(".weather-panel").boundingBox();

  expect(departures).not.toBeNull();
  expect(weather).not.toBeNull();
  expect(Math.abs(departures!.y - weather!.y)).toBeLessThanOrEqual(2);
  expect(weather!.x).toBeGreaterThan(departures!.x + departures!.width);
});

test("keeps departure content out of the weather panel at 800px", async ({
  page
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openDashboard(page);

  const weather = await page.locator(".weather-panel").boundingBox();
  const furthestDepartureContentEdge = await page
    .locator(".departure article > *")
    .evaluateAll((elements) =>
      Math.max(...elements.map((element) =>
        element.getBoundingClientRect().right
      ))
    );

  expect(weather).not.toBeNull();
  expect(furthestDepartureContentEdge).toBeLessThanOrEqual(weather!.x);
});

test("places weather above departures without horizontal overflow on a phone", async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  const weather = await page.locator(".weather-panel").boundingBox();
  const departures = await page.locator(".departures-panel").boundingBox();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(weather).not.toBeNull();
  expect(departures).not.toBeNull();
  expect(weather!.y + weather!.height).toBeLessThanOrEqual(departures!.y);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("exposes accessible names for dashboard controls", async ({ page }) => {
  await openDashboard(page);

  await expect(
    page.getByRole("button", { name: "Refresh dashboard" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter fullscreen" })
  ).toBeVisible();
});

test("shows a strong keyboard focus indicator on refresh", async ({ page }) => {
  await openDashboard(page);

  await page.keyboard.press("Tab");
  const refresh = page.getByRole("button", { name: "Refresh dashboard" });
  await expect(refresh).toBeFocused();
  const outline = await refresh.evaluate((control) => {
    const style = getComputedStyle(control);
    return {
      offset: Number.parseFloat(style.outlineOffset),
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth)
    };
  });

  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.offset).toBeGreaterThanOrEqual(2);
});

test("labels a cancelled departure with visible text", async ({ page }) => {
  await openDashboard(page);

  await expect(
    page.locator(".departure-delayed .status-icon-delayed")
  ).toBeVisible();
  const cancelledDeparture = page
    .getByRole("listitem")
    .filter({ hasText: "Cancelled" });
  await expect(cancelledDeparture).toBeVisible();
  await expect(
    cancelledDeparture.locator(".status-icon-cancelled")
  ).toBeVisible();
  await expect(cancelledDeparture).toContainText(
    "Cancelled due to a fault on this train"
  );
});

test("disables control transitions when reduced motion is requested", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDashboard(page);
  const refresh = page.getByRole("button", { name: "Refresh dashboard" });

  const normalMotion = await refresh.evaluate((control) => {
    const style = getComputedStyle(control);
    return {
      duration: style.transitionDuration,
      property: style.transitionProperty
    };
  });
  expect(normalMotion.property).toBe("opacity, transform");
  expect(normalMotion.duration).not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () =>
      refresh.evaluate((control) => getComputedStyle(control).transitionDuration)
    )
    .toBe("0s");
});
