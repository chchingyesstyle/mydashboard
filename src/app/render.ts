import type {
  DashboardPayload,
  Departure,
  DeparturesPanel,
  WeatherPanel
} from "../shared/contracts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options: { className?: string; text?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  return node;
}

type IconKind =
  | "route"
  | "refresh"
  | "fullscreen"
  | "weather"
  | "delayed"
  | "cancelled"
  | "stale"
  | "unavailable";
type StatusIconKind = "delayed" | "cancelled" | "stale" | "unavailable";

function staticIcon(kind: IconKind): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("icon", `icon-${kind}`);

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  const paths = {
    route: "M5 12h14m-4-4 4 4-4 4",
    refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
    fullscreen: "M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5",
    weather: "M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.3 2A3 3 0 0 0 7 18Z",
    delayed: "M12 7v5l3 2m6-2a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
    cancelled: "M7 7l10 10m0-10L7 17m14-5a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z",
    stale: "M4 12a8 8 0 1 0 2.3-5.7M4 5v7h7",
    unavailable: "M12 4 21 20H3L12 4Zm0 6v4m0 3h.01"
  };
  path.setAttribute("d", paths[kind]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function statusIcon(kind: StatusIconKind): SVGSVGElement {
  const icon = staticIcon(kind);
  icon.classList.add("status-icon", `status-icon-${kind}`);
  return icon;
}

function appendStatusText(
  parent: HTMLElement,
  kind: StatusIconKind,
  text: string
): void {
  parent.appendChild(statusIcon(kind));
  parent.appendChild(document.createTextNode(text));
}

function statusText(status: DashboardPayload["status"]): string {
  switch (status) {
    case "live":
      return "Live data";
    case "partial":
      return "Some data is stale or unavailable";
    case "unavailable":
      return "Live data is unavailable";
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatDataAge(updatedAt: string, generatedAt: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.parse(generatedAt) - Date.parse(updatedAt)) / 1_000)
  );
  if (seconds < 60) {
    return `${seconds} ${seconds === 1 ? "second" : "seconds"} old`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} old`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} old`;
}

function appendExpandedValue(
  parent: HTMLElement,
  visible: string,
  expanded: string
): void {
  const abbreviated = element("span", { text: visible });
  abbreviated.setAttribute("aria-hidden", "true");
  const screenReaderText = element("span", {
    className: "sr-only",
    text: expanded
  });
  parent.appendChild(abbreviated);
  parent.appendChild(screenReaderText);
}

function panelStatus(
  panel: DeparturesPanel | WeatherPanel,
  generatedAt: string
): HTMLParagraphElement | null {
  if (!panel.stale || panel.updatedAt === null) {
    return null;
  }

  const status = element("p", {
    className: "panel-status panel-status-stale"
  });
  appendStatusText(
    status,
    "stale",
    `Stale data · ${formatDataAge(panel.updatedAt, generatedAt)}`
  );
  status.setAttribute("role", "status");
  return status;
}

function renderDeparture(service: Departure): HTMLLIElement {
  const item = element("li", {
    className: `departure departure-${service.status}`
  });
  const serviceDetails = element("article");
  serviceDetails.setAttribute(
    "aria-label",
    `${formatTime(service.scheduledDeparture)} ${service.operator} departure`
  );

  const scheduled = element("time", {
    className: "departure-time",
    text: formatTime(service.scheduledDeparture)
  });
  scheduled.dateTime = service.scheduledDeparture;
  const expected = element("p", { className: "departure-expected" });
  const expectedText = service.isCancelled
    ? "Cancelled"
    : service.expectedDisplay;
  if (service.status === "delayed" || service.status === "cancelled") {
    appendStatusText(expected, service.status, expectedText);
  } else {
    expected.textContent = expectedText;
  }
  const platform = element("p", { className: "departure-platform" });
  if (service.platform === null) {
    appendExpandedValue(platform, "Platform TBC", "Platform to be confirmed");
  } else {
    platform.textContent = `Platform ${service.platform}`;
  }
  const operator = element("p", {
    className: "departure-operator",
    text: service.operator
  });

  serviceDetails.appendChild(scheduled);
  serviceDetails.appendChild(expected);
  serviceDetails.appendChild(platform);
  serviceDetails.appendChild(operator);
  if (service.reason !== null) {
    serviceDetails.appendChild(element("p", {
      className: "departure-reason",
      text: service.reason
    }));
  }
  item.appendChild(serviceDetails);
  return item;
}

function renderDepartures(
  panel: DeparturesPanel,
  generatedAt: string
): HTMLElement {
  const section = element("section", { className: "departures-panel" });
  const heading = element("h2", { text: "Departures" });
  heading.id = "departures-heading";
  section.setAttribute("aria-labelledby", heading.id);
  section.appendChild(heading);

  const status = panelStatus(panel, generatedAt);
  if (status !== null) {
    section.appendChild(status);
  }
  if (panel.status === "unavailable") {
    const alert = element("p", {
      className: "panel-error"
    });
    appendStatusText(
      alert,
      "unavailable",
      panel.error ?? "Live departures are temporarily unavailable."
    );
    alert.setAttribute("role", "alert");
    section.appendChild(alert);
    return section;
  }
  if (panel.services.length === 0) {
    section.appendChild(element("p", {
      className: "panel-empty",
      text: "No direct departures are currently available."
    }));
    return section;
  }

  const list = element("ol", { className: "departure-list" });
  list.setAttribute("aria-label", "Direct departures");
  for (const service of panel.services) {
    list.appendChild(renderDeparture(service));
  }
  section.appendChild(list);
  return section;
}

function weatherValue(
  term: string,
  visible: string,
  expanded: string
): [HTMLElement, HTMLElement] {
  const name = element("dt", { text: term });
  const value = element("dd");
  appendExpandedValue(value, visible, expanded);
  return [name, value];
}

function renderWeather(panel: WeatherPanel, generatedAt: string): HTMLElement {
  const section = element("section", { className: "weather-panel" });
  const heading = element("h2", { text: "Current weather" });
  heading.id = "weather-heading";
  section.setAttribute("aria-labelledby", heading.id);
  section.appendChild(heading);

  const status = panelStatus(panel, generatedAt);
  if (status !== null) {
    section.appendChild(status);
  }
  if (panel.status === "unavailable") {
    const alert = element("p", {
      className: "panel-error"
    });
    appendStatusText(
      alert,
      "unavailable",
      panel.error ?? "Current weather is temporarily unavailable."
    );
    alert.setAttribute("role", "alert");
    section.appendChild(alert);
    return section;
  }

  const summary = element("div", { className: "weather-summary" });
  summary.appendChild(staticIcon("weather"));
  const temperature = element("p", { className: "weather-temperature" });
  appendExpandedValue(
    temperature,
    `${panel.temperatureC}°C`,
    `${panel.temperatureC} degrees Celsius`
  );
  summary.appendChild(temperature);
  summary.appendChild(element("p", {
    className: "weather-condition",
    text: panel.condition ?? "Conditions unavailable"
  }));

  const measurements = element("dl", { className: "weather-measurements" });
  const values: Array<[HTMLElement, HTMLElement]> = [
    weatherValue(
      "Feels like",
      `${panel.apparentTemperatureC}°C`,
      `${panel.apparentTemperatureC} degrees Celsius`
    ),
    weatherValue(
      "Humidity",
      `${panel.relativeHumidityPercent}%`,
      `${panel.relativeHumidityPercent} percent`
    ),
    weatherValue(
      "Precipitation",
      `${panel.precipitationMm} mm`,
      `${panel.precipitationMm} millimetres`
    ),
    weatherValue(
      "Wind",
      `${panel.windSpeedKph} km/h at ${panel.windDirectionDegrees}°`,
      `${panel.windSpeedKph} kilometres per hour at ${panel.windDirectionDegrees} degrees`
    )
  ];
  for (const [term, value] of values) {
    measurements.appendChild(term);
    measurements.appendChild(value);
  }

  section.appendChild(summary);
  section.appendChild(measurements);
  return section;
}

function renderHeader(payload: DashboardPayload): HTMLElement {
  const header = element("header", { className: "dashboard-header" });
  const route = element("div", { className: "route-heading" });
  route.appendChild(staticIcon("route"));
  route.appendChild(element("h1", {
    text: `${payload.route.origin.name} to ${payload.route.destination.name}`
  }));

  const metadata = element("div", { className: "dashboard-metadata" });
  const clock = element("time", {
    className: "dashboard-clock",
    text: formatTime(payload.generatedAt)
  });
  clock.dateTime = payload.generatedAt;
  clock.dataset.dashboardClock = "";
  clock.setAttribute("aria-label", "Current time in London");
  const status = element("p", {
    className: `dashboard-status dashboard-status-${payload.status}`,
    text: statusText(payload.status)
  });
  status.setAttribute("role", "status");
  metadata.appendChild(clock);
  metadata.appendChild(status);

  const controls = element("div", { className: "dashboard-controls" });
  const refresh = element("button", { className: "refresh-control" });
  refresh.type = "button";
  refresh.dataset.dashboardRefresh = "";
  refresh.setAttribute("aria-label", "Refresh dashboard");
  refresh.appendChild(staticIcon("refresh"));
  refresh.appendChild(element("span", { text: "Refresh" }));
  const fullscreen = element("button", { className: "fullscreen-control" });
  fullscreen.type = "button";
  fullscreen.dataset.dashboardFullscreen = "";
  fullscreen.setAttribute("aria-label", "Enter fullscreen");
  fullscreen.appendChild(staticIcon("fullscreen"));
  fullscreen.appendChild(element("span", { text: "Fullscreen" }));
  controls.appendChild(refresh);
  controls.appendChild(fullscreen);

  header.appendChild(route);
  header.appendChild(metadata);
  header.appendChild(controls);
  return header;
}

export function renderDashboard(
  root: HTMLElement,
  payload: DashboardPayload
): void {
  const panels = element("div", { className: "dashboard-panels" });
  panels.appendChild(renderDepartures(payload.departures, payload.generatedAt));
  panels.appendChild(renderWeather(payload.weather, payload.generatedAt));

  const connectionNotice = element("p", {
    className: "connection-notice"
  });
  connectionNotice.dataset.dashboardConnection = "";
  connectionNotice.setAttribute("role", "status");
  connectionNotice.hidden = true;

  const footer = element("footer", { className: "dashboard-footer" });
  footer.appendChild(element("p", {
    text: "Rail data provided by National Rail. Weather data provided by Open-Meteo."
  }));

  root.replaceChildren(
    renderHeader(payload),
    connectionNotice,
    panels,
    footer
  );
}
