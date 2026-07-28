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
  apparentTemperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  condition: string | null;
  windSpeedKph: number | null;
  windDirectionDegrees: number | null;
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

export const ROUTE = {
  origin: { name: "Watford Junction", crs: "WFJ" },
  destination: { name: "London Euston", crs: "EUS" }
} as const;
