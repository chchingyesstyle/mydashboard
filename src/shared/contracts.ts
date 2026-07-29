export type PanelStatus = "live" | "stale" | "unavailable";
export type TrainStatus = "on_time" | "delayed" | "cancelled" | "unknown";
export type DashboardStatus = "live" | "partial" | "unavailable";

export interface Departure {
  id: string;
  scheduledDeparture: string;
  expectedDeparture: string | null;
  expectedDisplay: string;
  platform: string | null;
  operator: string;
  operatorCode: string;
  coachCount: number | null;
  status: TrainStatus;
  isCancelled: boolean;
  reason: string | null;
}

export interface DeparturesPanel {
  status: PanelStatus;
  updatedAt: string | null;
  stale: boolean;
  services: Departure[];
  error: string | null;
}

export interface WeatherPanel {
  status: PanelStatus;
  updatedAt: string | null;
  stale: boolean;
  temperatureC: number | null;
  temperatureMinTodayC: number | null;
  temperatureMaxTodayC: number | null;
  apparentTemperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  rainChanceNext6HoursPercent: number | null;
  weatherCode: number | null;
  condition: string | null;
  windSpeedKph: number | null;
  windDirectionDegrees: number | null;
  pressureMslHpa: number | null;
  error: string | null;
}

export interface DashboardPayload {
  version: 1;
  generatedAt: string;
  status: DashboardStatus;
  route: {
    origin: { name: string; crs: string };
    destination: { name: string; crs: string };
  };
  departures: DeparturesPanel;
  weather: WeatherPanel;
}

export const ROUTES = {
  "WFJ-EUS": {
    id: "WFJ-EUS",
    origin: { name: "Watford Junction", crs: "WFJ" },
    destination: { name: "London Euston", crs: "EUS" },
    weather: { latitude: 51.6635, longitude: -0.3969 }
  },
  "EUS-WFJ": {
    id: "EUS-WFJ",
    origin: { name: "London Euston", crs: "EUS" },
    destination: { name: "Watford Junction", crs: "WFJ" },
    weather: { latitude: 51.5284, longitude: -0.1346 }
  }
} as const;

export type RouteId = keyof typeof ROUTES;
export type RouteConfig = (typeof ROUTES)[RouteId];
export const DEFAULT_ROUTE_ID: RouteId = "WFJ-EUS";
export const DEFAULT_ROUTE: RouteConfig = ROUTES[DEFAULT_ROUTE_ID];
export const ROUTE = DEFAULT_ROUTE;

export function isRouteId(value: string): value is RouteId {
  return Object.hasOwn(ROUTES, value);
}
