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
        platformStatus: "live",
        operator: "London Northwestern Railway",
        operatorCode: "LM",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
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
        platformStatus: "live",
        operator: "Avanti West Coast",
        operatorCode: "VT",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
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
        platformStatus: null,
        operator: "London Overground",
        operatorCode: "LO",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
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
        platformStatus: "planned",
        operator: "London Northwestern Railway",
        operatorCode: "LM",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
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
  },
  electricity: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    prices: [],
    error: null
  }
};

const reverseDashboard: DashboardPayload = {
  ...liveDashboard,
  route: {
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" }
  },
  departures: {
    ...liveDashboard.departures,
    services: liveDashboard.departures.services.map((service) => ({
      ...service,
      id: `reverse-${service.id}`,
      finalDestination: service.operatorCode === "LO"
        ? { name: "Watford Junction", crs: "WFJ" }
        : { name: "Birmingham New Street", crs: "BHM" }
    }))
  },
  weather: {
    ...liveDashboard.weather,
    temperatureC: 22.1,
    condition: "Clear sky",
    weatherCode: 0
  }
};

async function openDashboard(page: Page): Promise<void> {
  await page.route("**/api/v1/dashboard**", async (route) => {
    const routeId = new URL(route.request().url()).searchParams.get("route");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        routeId === "EUS-WFJ" ? reverseDashboard : liveDashboard
      )
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
  await expect(page.getByRole("button", { name: "To Euston" })).toBeVisible();
  await expect(page.getByRole("button", { name: "To Watford" })).toBeVisible();
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

test("switches route content without phone overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  await expect(page.getByText(
    "London Northwestern Railway · To Birmingham New Street"
  ).first()).toBeVisible();
  await expect(page.getByRole("region", {
    name: "Current weather"
  })).toContainText("22.1°C");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("uses compact departure rows on a large screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  const firstRow = await page.locator(".departure article").first().boundingBox();
  const time = await page.locator(".departure-time").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );

  expect(firstRow).not.toBeNull();
  expect(firstRow!.height).toBeLessThanOrEqual(70);
  expect(time).toBeLessThanOrEqual(36);
});

test("uses compact departure rows without phone overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  await expect(page.getByText("Planned 10")).toBeVisible();
  const firstRow = await page.locator(".departure article").first().boundingBox();
  const time = await page.locator(".departure-time").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(firstRow).not.toBeNull();
  expect(firstRow!.height).toBeLessThanOrEqual(60);
  expect(time).toBeLessThanOrEqual(30);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("exposes accessible names for dashboard controls", async ({ page }) => {
  await openDashboard(page);

  const toEuston = page.getByRole("button", { name: "To Euston" });
  const toWatford = page.getByRole("button", { name: "To Watford" });
  await expect(toEuston).toBeVisible();
  await expect(toWatford).toBeVisible();
  expect((await toEuston.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await toWatford.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Switch to dark mode" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh dashboard" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enter fullscreen" })
  ).toBeVisible();
});

test("defaults to light and remembers a selected dark theme", async ({ page }) => {
  await openDashboard(page);

  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", {
    name: "Switch to light mode"
  })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("reload resets the route while preserving the selected theme", async ({
  page
}) => {
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

test("shows a strong keyboard focus indicator through the header controls", async ({
  page
}) => {
  await openDashboard(page);

  await page.keyboard.press("Tab");
  const toEuston = page.getByRole("button", { name: "To Euston" });
  await expect(toEuston).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "To Watford" })).toBeFocused();
  await page.keyboard.press("Tab");
  const theme = page.getByRole("button", { name: "Switch to dark mode" });
  await expect(theme).toBeFocused();
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
  const routeControl = page.getByRole("button", { name: "To Watford" });

  const normalMotion = await refresh.evaluate((control) => {
    const style = getComputedStyle(control);
    return {
      duration: style.transitionDuration,
      property: style.transitionProperty
    };
  });
  expect(normalMotion.property).toBe("opacity, transform");
  expect(normalMotion.duration).not.toBe("0s");
  expect(await routeControl.evaluate((control) =>
    getComputedStyle(control).transitionDuration
  )).not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () =>
      refresh.evaluate((control) => getComputedStyle(control).transitionDuration)
    )
    .toBe("0s");
  await expect
    .poll(async () =>
      routeControl.evaluate((control) =>
        getComputedStyle(control).transitionDuration
      )
    )
    .toBe("0s");
});
