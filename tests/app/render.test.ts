import { afterEach, describe, expect, it, vi } from "vitest";
import { getByRole, queryByRole, within } from "@testing-library/dom";
import type { DashboardPayload } from "../../src/shared/contracts";
import { renderDashboard, updateStaleAges } from "../../src/app/render";
import { startDashboardApp } from "../../src/app/main";

const livePayload: DashboardPayload = {
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
        id: "overground",
        scheduledDeparture: "2026-07-28T12:12:00+01:00",
        expectedDeparture: "2026-07-28T12:12:00+01:00",
        expectedDisplay: "On time",
        platform: "3",
        platformStatus: "live",
        operator: "London Overground",
        operatorCode: "LO",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: 5,
        status: "on_time",
        isCancelled: false,
        reason: null
      },
      {
        id: "lnr",
        scheduledDeparture: "2026-07-28T12:20:00+01:00",
        expectedDeparture: "2026-07-28T12:28:00+01:00",
        expectedDisplay: "Expected 12:28",
        platform: null,
        platformStatus: null,
        operator: "LNR",
        operatorCode: "LM",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
        status: "delayed",
        isCancelled: false,
        reason: "A signalling fault"
      },
      {
        id: "cancelled",
        scheduledDeparture: "2026-07-28T12:30:00+01:00",
        expectedDeparture: null,
        expectedDisplay: "No report",
        platform: "6",
        platformStatus: "live",
        operator: "LNR",
        operatorCode: "LM",
        finalDestination: { name: "London Euston", crs: "EUS" },
        coachCount: null,
        status: "cancelled",
        isCancelled: true,
        reason: "A train fault"
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
    dailyForecast: [],
    hourlyForecast: [],
    warning: null,
    error: null
  },
  electricity: {
    status: "live",
    updatedAt: "2026-07-28T12:00:00.000Z",
    stale: false,
    prices: [],
    todayAveragePencePerKwh: null,
    error: null
  }
};

const reversePayload: DashboardPayload = {
  ...livePayload,
  route: {
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" }
  },
  departures: {
    ...livePayload.departures,
    services: livePayload.departures.services.map((service) => ({
      ...service,
      id: `reverse-${service.id}`,
      finalDestination: service.operatorCode === "LO"
        ? { name: "Watford Junction", crs: "WFJ" }
        : { name: "Birmingham New Street", crs: "BHM" }
    }))
  },
  weather: {
    ...livePayload.weather,
    temperatureC: 22.1,
    condition: "Clear sky",
    weatherCode: 0
  }
};

function render(
  payload: DashboardPayload = livePayload,
  now = new Date(livePayload.generatedAt)
): HTMLElement {
  const root = document.createElement("main");
  document.body.appendChild(root);
  renderDashboard(root, payload, now);
  return root;
}

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  delete document.documentElement.dataset.theme;
  localStorage.removeItem("dashboard-theme");
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("dashboard rendering", () => {
  it("renders the route and every direct service with accessible departure semantics", () => {
    const root = render();
    const departures = getByRole(root, "region", { name: "Departures" });

    expect(getByRole(root, "heading", {
      level: 1,
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(within(departures).getByText("London Overground · 5 coaches")).toBeTruthy();
    expect(within(departures).getAllByText("LNR")).toHaveLength(2);
    expect(within(departures).getByText("12:12")).toBeTruthy();
    expect(within(departures).getByText("On time")).toBeTruthy();
    expect(within(departures).getByText("Platform 3")).toBeTruthy();
    expect(within(departures).getByText("Expected 12:28")).toBeTruthy();
    expect(within(departures).getByText("Platform TBC")).toBeTruthy();
    expect(getByRole(root, "button", {
      name: "Switch to dark mode"
    })).toBeTruthy();
  });

  it("labels planned platforms without presenting them as confirmed", () => {
    const payload: DashboardPayload = {
      ...livePayload,
      departures: {
        ...livePayload.departures,
        services: livePayload.departures.services.map((service) =>
          service.id === "lnr"
            ? {
              ...service,
              platform: "10",
              platformStatus: "planned"
            }
            : service
        )
      }
    };
    const departures = getByRole(render(payload), "region", {
      name: "Departures"
    });

    expect(within(departures).getByText("Planned 10")).toBeTruthy();
    expect(within(departures).getByText("Planned platform 10")).toBeTruthy();
    expect(within(departures).queryByText("Platform 10")).toBeNull();
  });

  it("renders two route controls with the loaded direction selected", () => {
    const root = render();
    const toEuston = getByRole<HTMLButtonElement>(root, "button", {
      name: "To Euston"
    });
    const toWatford = getByRole<HTMLButtonElement>(root, "button", {
      name: "To Watford"
    });

    expect(toEuston.getAttribute("aria-pressed")).toBe("true");
    expect(toWatford.getAttribute("aria-pressed")).toBe("false");
    expect(toEuston.dataset.dashboardRoute).toBe("WFJ-EUS");
    expect(toWatford.dataset.dashboardRoute).toBe("EUS-WFJ");
    expect(
      root.querySelector<HTMLElement>("[data-dashboard-route-status]")?.hidden
    ).toBe(true);
  });

  it("selects To Watford for an Euston to Watford payload", () => {
    const root = render(reversePayload);

    expect(getByRole(root, "heading", {
      name: "London Euston to Watford Junction"
    })).toBeTruthy();
    expect(getByRole(root, "button", {
      name: "To Watford"
    }).getAttribute("aria-pressed")).toBe("true");
  });

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

  it("uses singular grammar and omits unavailable coach counts", () => {
    const departures = getByRole(render({
      ...livePayload,
      departures: {
        ...livePayload.departures,
        services: [
          { ...livePayload.departures.services[0], coachCount: 1 },
          { ...livePayload.departures.services[1], coachCount: null }
        ]
      }
    }), "region", { name: "Departures" });

    expect(within(departures).getByText("London Overground · 1 coach")).toBeTruthy();
    expect(within(departures).getByText("LNR")).toBeTruthy();
    expect(within(departures).queryByText(/LNR ·/)).toBeNull();
  });

  it("keeps a cancelled service and its disruption reason visible", () => {
    const departures = getByRole(render(), "region", { name: "Departures" });

    expect(within(departures).getByText("12:30")).toBeTruthy();
    expect(within(departures).getByText("Cancelled")).toBeTruthy();
    expect(within(departures).getByText("A train fault")).toBeTruthy();
  });

  it("renders current weather and the six-hour rain chance", () => {
    const root = render();
    const weather = getByRole(root, "region", { name: "Current weather" });

    expect(within(weather).getByText("21.4°C")).toBeTruthy();
    expect(within(weather).getByText("Partly cloudy")).toBeTruthy();
    expect(within(weather).getByText("20.8°C")).toBeTruthy();
    expect(within(weather).getByText("63%")).toBeTruthy();
    expect(within(weather).getByText("0 mm")).toBeTruthy();
    expect(within(weather).getByText("Rain chance, next 6 hours")).toBeTruthy();
    expect(within(weather).getByText("60%")).toBeTruthy();
    expect(within(weather).getByText("60 percent")).toBeTruthy();
    expect(within(weather).getByText("Today")).toBeTruthy();
    expect(within(weather).getByText("Min 13.2°C · Max 26.8°C")).toBeTruthy();
    expect(within(weather).getByText(
      "Today, minimum temperature 13.2 degrees Celsius, maximum temperature 26.8 degrees Celsius"
    )).toBeTruthy();
    expect(within(weather).queryByText(/km\/h at/)).toBeNull();
    expect(within(weather).getByText("1016.40 hPa")).toBeTruthy();
    expect(within(weather).getByText("1016.40 hectopascals")).toBeTruthy();
    expect(queryByRole(root, "heading", { name: /forecast/i })).toBeNull();
    expect(queryByRole(root, "list", { name: /forecast/i })).toBeNull();
  });

  it("matches the weather icon to the current condition", () => {
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
        weather: {
          ...livePayload.weather,
          weatherCode,
          condition
        }
      }), "region", { name: "Current weather" });

      expect(weather.querySelector(`.${iconClass}`)).toBeTruthy();
      expect(within(weather).getByText(condition)).toBeTruthy();
    }
  });

  it("shows unavailable pressure without hiding current weather", () => {
    const weather = getByRole(render({
      ...livePayload,
      weather: {
        ...livePayload.weather,
        pressureMslHpa: null
      }
    }), "region", { name: "Current weather" });

    expect(within(weather).getByText("Pressure")).toBeTruthy();
    expect(within(weather).getByText("Unavailable")).toBeTruthy();
    expect(within(weather).getByText("21.4°C")).toBeTruthy();
  });

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

  it("treats a missing rain chance from an older payload as unavailable", () => {
    const weather = getByRole(render({
      ...livePayload,
      weather: {
        ...livePayload.weather,
        rainChanceNext6HoursPercent: undefined
      } as unknown as DashboardPayload["weather"]
    }), "region", { name: "Current weather" });

    expect(within(weather).getByText("Rain chance unavailable")).toBeTruthy();
    expect(within(weather).queryByText("undefined%")).toBeNull();
  });

  it("treats missing today temperatures from an older payload as unavailable", () => {
    const weather = getByRole(render({
      ...livePayload,
      weather: {
        ...livePayload.weather,
        temperatureMinTodayC: undefined,
        temperatureMaxTodayC: undefined
      } as unknown as DashboardPayload["weather"]
    }), "region", { name: "Current weather" });

    expect(within(weather).getByText("Today temperatures unavailable")).toBeTruthy();
    expect(within(weather).queryByText("Min undefined°C · Max undefined°C")).toBeNull();
  });

  it("labels stale panels and exposes their data age", () => {
    const root = render({
      ...livePayload,
      status: "partial",
      departures: {
        ...livePayload.departures,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T11:55:00.000Z"
      },
      weather: {
        ...livePayload.weather,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T11:50:00.000Z"
      }
    });

    const departures = getByRole(root, "region", { name: "Departures" });
    const weather = getByRole(root, "region", { name: "Current weather" });
    const announcement = within(departures).getByRole("status");
    const age = departures.querySelector<HTMLElement>(
      "[data-dashboard-stale-age]"
    )!;

    expect(announcement.textContent).toBe("Stale data");
    expect(announcement.contains(age)).toBe(false);
    expect(age.getAttribute("aria-live")).toBe("off");
    expect(departures.textContent).toContain("Stale data · 5 minutes old");
    expect(weather.textContent).toContain("Stale data · 10 minutes old");
  });

  it("uses the client clock to age two stale panels with a stable snapshot timestamp", () => {
    const root = render({
      ...livePayload,
      generatedAt: "2026-07-28T12:00:00.000Z",
      status: "partial",
      departures: {
        ...livePayload.departures,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T12:00:00.000Z"
      },
      weather: {
        ...livePayload.weather,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T11:50:00.000Z"
      }
    }, new Date("2026-07-28T12:07:00.000Z"));

    expect(getByRole(root, "region", { name: "Departures" }).textContent)
      .toContain("Stale data · 7 minutes old");
    expect(getByRole(root, "region", { name: "Current weather" }).textContent)
      .toContain("Stale data · 17 minutes old");
  });

  it("does not rewrite a stale age until its formatted value changes", () => {
    const stalePayload: DashboardPayload = {
      ...livePayload,
      status: "partial",
      departures: {
        ...livePayload.departures,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T12:00:00.000Z"
      }
    };
    const root = render(
      stalePayload,
      new Date("2026-07-28T12:07:00.000Z")
    );
    const age = root.querySelector<HTMLElement>(
      "[data-dashboard-stale-age]"
    )!;
    const originalTextNode = age.firstChild;

    updateStaleAges(root, new Date("2026-07-28T12:07:01.000Z"));
    expect(age.firstChild).toBe(originalTextNode);

    updateStaleAges(root, new Date("2026-07-28T12:08:00.000Z"));
    expect(age.firstChild).not.toBe(originalTextNode);
    expect(age.textContent).toBe(" · 8 minutes old");
  });

  it("renders static icons alongside non-live status text", () => {
    const root = render({
      ...livePayload,
      status: "partial",
      departures: {
        ...livePayload.departures,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T11:55:00.000Z"
      },
      weather: {
        status: "unavailable",
        updatedAt: null,
        stale: false,
        temperatureC: null,
        temperatureMinTodayC: null,
        temperatureMaxTodayC: null,
        apparentTemperatureC: null,
        relativeHumidityPercent: null,
        precipitationMm: null,
        rainChanceNext6HoursPercent: null,
        weatherCode: null,
        condition: null,
        windSpeedKph: null,
        windDirectionDegrees: null,
        pressureMslHpa: null,
        dailyForecast: [],
        hourlyForecast: [],
        warning: null,
        error: "Current weather is temporarily unavailable."
      }
    });

    expect(root.querySelector(".status-icon-delayed")).toBeTruthy();
    expect(root.querySelector(".status-icon-cancelled")).toBeTruthy();
    expect(root.querySelector(".status-icon-stale")).toBeTruthy();
    expect(root.querySelector(".status-icon-unavailable")).toBeTruthy();
  });

  it("states when there are no direct departures", () => {
    const root = render({
      ...livePayload,
      departures: {
        ...livePayload.departures,
        services: []
      }
    });

    expect(within(getByRole(root, "region", { name: "Departures" }))
      .getByText("No direct departures are currently available.")).toBeTruthy();
  });

  it("shows a departures error while current weather remains visible", () => {
    const root = render({
      ...livePayload,
      status: "partial",
      departures: {
        status: "unavailable",
        updatedAt: null,
        stale: false,
        services: [],
        error: "Live departures are temporarily unavailable."
      }
    });

    expect(within(getByRole(root, "region", { name: "Departures" }))
      .getByRole("alert").textContent).toBe(
      "Live departures are temporarily unavailable."
    );
    expect(within(getByRole(root, "region", { name: "Current weather" }))
      .getByText("21.4°C")).toBeTruthy();
  });

  it("shows a weather error while departures remain visible", () => {
    const root = render({
      ...livePayload,
      status: "partial",
      weather: {
        status: "unavailable",
        updatedAt: null,
        stale: false,
        temperatureC: null,
        temperatureMinTodayC: null,
        temperatureMaxTodayC: null,
        apparentTemperatureC: null,
        relativeHumidityPercent: null,
        precipitationMm: null,
        rainChanceNext6HoursPercent: null,
        weatherCode: null,
        condition: null,
        windSpeedKph: null,
        windDirectionDegrees: null,
        pressureMslHpa: null,
        dailyForecast: [],
        hourlyForecast: [],
        warning: null,
        error: "Current weather is temporarily unavailable."
      }
    });

    expect(within(getByRole(root, "region", { name: "Current weather" }))
      .getByRole("alert").textContent).toBe(
      "Current weather is temporarily unavailable."
    );
    expect(within(getByRole(root, "region", { name: "Departures" }))
      .getByText(/London Overground/)).toBeTruthy();
  });

  it("treats provider text as text instead of markup", () => {
    const root = render({
      ...livePayload,
      departures: {
        ...livePayload.departures,
        services: [{
          ...livePayload.departures.services[0],
          operator: "<img src=x onerror=alert(1)>",
          coachCount: null
        }]
      }
    });

    expect(within(getByRole(root, "region", { name: "Departures" }))
      .getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(root.querySelector("img")).toBeNull();
  });
});

async function settlePromises(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

function dashboardResponse(
  payload: DashboardPayload = livePayload,
  etag = "\"dashboard-v1\""
): Response {
  return new Response(JSON.stringify(payload), {
    headers: { etag }
  });
}

function pageTransition(type: "pagehide" | "pageshow", persisted: boolean): Event {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

describe("dashboard runtime", () => {
  it("keeps current data visible while switching and replaces it on success", async () => {
    let resolveReverse: ((response: Response) => void) | undefined;
    const reverseRequest = new Promise<Response>((resolve) => {
      resolveReverse = resolve;
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse(livePayload, "\"watford\""))
      .mockReturnValueOnce(reverseRequest);
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();

    getByRole(root, "button", { name: "To Watford" }).click();

    expect(getByRole(root, "heading", {
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(within(root).getByText(
      "Loading London Euston to Watford Junction…"
    )).toBeTruthy();
    expect(getByRole<HTMLButtonElement>(root, "button", {
      name: "To Euston"
    }).disabled).toBe(true);
    expect(getByRole<HTMLButtonElement>(root, "button", {
      name: "To Watford"
    }).disabled).toBe(true);

    resolveReverse?.(dashboardResponse(reversePayload, "\"euston\""));
    await settlePromises();

    expect(getByRole(root, "heading", {
      name: "London Euston to Watford Junction"
    })).toBeTruthy();
    expect(getByRole(root, "button", {
      name: "To Watford"
    }).getAttribute("aria-pressed")).toBe("true");
    expect(within(getByRole(root, "region", {
      name: "Current weather"
    })).getByText("22.1°C")).toBeTruthy();
  });

  it("retains the loaded route and re-enables controls after switch failure", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse())
      .mockRejectedValueOnce(new Error("offline"));
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();

    getByRole(root, "button", { name: "To Watford" }).click();
    await settlePromises();

    expect(getByRole(root, "heading", {
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(within(root).getByText(
      "Connection lost. Showing the last updated data."
    )).toBeTruthy();
    expect(getByRole<HTMLButtonElement>(root, "button", {
      name: "To Euston"
    }).disabled).toBe(false);
    expect(getByRole<HTMLButtonElement>(root, "button", {
      name: "To Watford"
    }).disabled).toBe(false);
  });

  it("ignores route clicks while a switch is in flight", async () => {
    const pending = new Promise<Response>(() => undefined);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse())
      .mockReturnValueOnce(pending);
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();

    getByRole(root, "button", { name: "To Watford" }).click();
    getByRole(root, "button", { name: "To Euston" }).click();

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("automatically refreshes the selected route", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse(livePayload, "\"watford\""))
      .mockResolvedValueOnce(dashboardResponse(reversePayload, "\"euston\""))
      .mockResolvedValue(new Response(null, { status: 304 }));
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();
    getByRole(root, "button", { name: "To Watford" }).click();
    await settlePromises();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/dashboard?route=EUS-WFJ",
      { headers: { "If-None-Match": "\"euston\"" } }
    );
  });

  it("manually refreshes the selected route", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse(livePayload, "\"watford\""))
      .mockResolvedValueOnce(dashboardResponse(reversePayload, "\"euston\""))
      .mockResolvedValue(new Response(null, { status: 304 }));
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();
    getByRole(root, "button", { name: "To Watford" }).click();
    await settlePromises();

    getByRole(root, "button", { name: "Refresh dashboard" }).click();
    await settlePromises();

    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "/api/v1/dashboard?route=EUS-WFJ",
      { headers: { "If-None-Match": "\"euston\"" } }
    );
  });

  it("restores a previously loaded route after its conditional 304", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse(livePayload, "\"watford\""))
      .mockResolvedValueOnce(dashboardResponse(reversePayload, "\"euston\""))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();
    getByRole(root, "button", { name: "To Watford" }).click();
    await settlePromises();

    getByRole(root, "button", { name: "To Euston" }).click();
    await settlePromises();

    expect(getByRole(root, "heading", {
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(within(getByRole(root, "region", {
      name: "Current weather"
    })).getByText("21.4°C")).toBeTruthy();
  });

  it("switches to dark mode and persists the selection", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(dashboardResponse());
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();

    getByRole(root, "button", { name: "Switch to dark mode" }).click();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("dashboard-theme")).toBe("dark");
    expect(getByRole(root, "button", {
      name: "Switch to light mode"
    })).toBeTruthy();
  });

  it("renders loading immediately, then loads and refreshes every 30 seconds", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      dashboardResponse()
    );
    const root = document.createElement("main");
    document.body.appendChild(root);

    startDashboardApp(root, fetcher);

    expect(getByRole(root, "status").textContent).toBe(
      "Loading live departures and current weather…"
    );
    await settlePromises();
    expect(getByRole(root, "heading", {
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("updates the London clock every second without refetching", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:05:05.000Z"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(dashboardResponse());
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(root.querySelector<HTMLElement>("[data-dashboard-clock]")?.textContent)
      .toBe("14:05:06");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("advances stale ages after a conditional 304 without rebuilding focused controls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T12:05:30.000Z"));
    const stalePayload: DashboardPayload = {
      ...livePayload,
      generatedAt: "2026-07-28T12:05:30.000Z",
      status: "partial",
      departures: {
        ...livePayload.departures,
        status: "stale",
        stale: true,
        updatedAt: "2026-07-28T12:00:00.000Z"
      }
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse(stalePayload))
      .mockResolvedValue(new Response(null, { status: 304 }));
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();
    const departures = getByRole(root, "region", { name: "Departures" });
    const refresh = getByRole<HTMLButtonElement>(root, "button", {
      name: "Refresh dashboard"
    });
    refresh.focus();

    expect(departures.textContent).toContain("Stale data · 5 minutes old");

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(departures.textContent).toContain("Stale data · 6 minutes old");
    expect(getByRole(root, "button", { name: "Refresh dashboard" })).toBe(refresh);
    expect(document.activeElement).toBe(refresh);
  });

  it("temporarily disables manual refresh and preserves data after a connection failure", async () => {
    vi.useFakeTimers();
    let rejectRefresh: ((reason: Error) => void) | undefined;
    const failedRefresh = new Promise<Response>((_resolve, reject) => {
      rejectRefresh = reject;
    });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(dashboardResponse())
      .mockReturnValueOnce(failedRefresh);
    const root = document.createElement("main");
    document.body.appendChild(root);
    startDashboardApp(root, fetcher);
    await settlePromises();
    const refresh = getByRole<HTMLButtonElement>(root, "button", {
      name: "Refresh dashboard"
    });

    refresh.click();

    expect(refresh.disabled).toBe(true);
    rejectRefresh?.(new Error("offline"));
    await settlePromises();
    expect(refresh.disabled).toBe(false);
    expect(getByRole(root, "heading", {
      name: "Watford Junction to London Euston"
    })).toBeTruthy();
    expect(within(root).getByText(
      "Connection lost. Showing the last updated data."
    )).toBeTruthy();
  });

  it("enters and exits fullscreen and stops timers on pagehide", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(dashboardResponse());
    const root = document.createElement("main");
    document.body.appendChild(root);
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen
    });
    startDashboardApp(root, fetcher);
    await settlePromises();

    getByRole(root, "button", { name: "Enter fullscreen" }).click();
    await settlePromises();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    getByRole(root, "button", { name: "Exit fullscreen" }).click();
    await settlePromises();
    expect(exitFullscreen).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("restores polling, clock updates, and controls after a persisted page restore", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T13:05:05.000Z"));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(dashboardResponse());
    const root = document.createElement("main");
    document.body.appendChild(root);
    const requestFullscreen = vi.fn(async () => undefined);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen
    });
    startDashboardApp(root, fetcher);
    await settlePromises();

    window.dispatchEvent(pageTransition("pagehide", true));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetcher).toHaveBeenCalledTimes(1);

    window.dispatchEvent(pageTransition("pageshow", true));
    await settlePromises();
    expect(fetcher).toHaveBeenCalledTimes(2);

    window.dispatchEvent(pageTransition("pageshow", true));
    await settlePromises();
    expect(fetcher).toHaveBeenCalledTimes(2);

    getByRole(root, "button", { name: "Refresh dashboard" }).click();
    await settlePromises();
    expect(fetcher).toHaveBeenCalledTimes(3);
    getByRole(root, "button", { name: "Enter fullscreen" }).click();
    await settlePromises();
    expect(requestFullscreen).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(root.querySelector<HTMLElement>("[data-dashboard-clock]")?.textContent)
      .toBe("14:06:06");
  });
});
