import type { WeatherPanel } from "../../shared/contracts";

export type WeatherValue = {
  [Key in
    | "temperatureC"
    | "apparentTemperatureC"
    | "relativeHumidityPercent"
    | "precipitationMm"
    | "weatherCode"
    | "condition"
    | "windSpeedKph"
    | "windDirectionDegrees"]: NonNullable<WeatherPanel[Key]>;
} & {
  pressureMslHpa: number | null;
  rainChanceNext6HoursPercent: number | null;
  temperatureMinTodayC: number | null;
  temperatureMaxTodayC: number | null;
};

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "pressure_msl"
].join(",");

function malformedResponse(): never {
  throw new Error("Open-Meteo current weather response was malformed");
}

function numberValue(current: Record<string, unknown>, field: string): number {
  const value = current[field];
  return typeof value === "number" && Number.isFinite(value) ? value : malformedResponse();
}

function optionalNumberValue(
  current: Record<string, unknown>,
  field: string
): number | null {
  const value = current[field];
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : malformedResponse();
}

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

function conditionFor(weatherCode: number): string {
  switch (weatherCode) {
    case 0:
      return "Clear sky";
    case 1:
      return "Mainly clear";
    case 2:
      return "Partly cloudy";
    case 3:
      return "Overcast";
    case 45:
    case 48:
      return "Fog";
    case 51:
    case 53:
    case 55:
      return "Drizzle";
    case 56:
    case 57:
      return "Freezing drizzle";
    case 61:
    case 63:
    case 65:
      return "Rain";
    case 66:
    case 67:
      return "Freezing rain";
    case 71:
    case 73:
    case 75:
      return "Snow fall";
    case 77:
      return "Snow grains";
    case 80:
    case 81:
    case 82:
      return "Rain showers";
    case 85:
    case 86:
      return "Snow showers";
    case 95:
      return "Thunderstorm";
    case 96:
    case 99:
      return "Thunderstorm with hail";
    default:
      return malformedResponse();
  }
}

export function normalizeWeather(payload: unknown): WeatherValue {
  if (typeof payload !== "object" || payload === null) malformedResponse();

  const response = payload as Record<string, unknown>;
  const current = response.current;
  if (typeof current !== "object" || current === null) malformedResponse();

  const values = current as Record<string, unknown>;
  const weatherCode = numberValue(values, "weather_code");
  const temperatures = todayTemperatureExtremes(response);

  return {
    temperatureC: numberValue(values, "temperature_2m"),
    temperatureMinTodayC: temperatures.min,
    temperatureMaxTodayC: temperatures.max,
    apparentTemperatureC: numberValue(values, "apparent_temperature"),
    relativeHumidityPercent: numberValue(values, "relative_humidity_2m"),
    precipitationMm: numberValue(values, "precipitation"),
    rainChanceNext6HoursPercent: rainChanceNext6Hours(response),
    weatherCode,
    condition: conditionFor(weatherCode),
    windSpeedKph: numberValue(values, "wind_speed_10m"),
    windDirectionDegrees: numberValue(values, "wind_direction_10m"),
    pressureMslHpa: optionalNumberValue(values, "pressure_msl")
  };
}

export async function fetchWeather(
  fetcher: typeof fetch,
  now: Date
): Promise<WeatherValue> {
  void now;
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", "51.6635");
  url.searchParams.set("longitude", "-0.3969");
  url.searchParams.set("timezone", "Europe/London");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("current", CURRENT_FIELDS);
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_hours", "6");
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_max");
  url.searchParams.set("forecast_days", "1");

  const response = await fetcher(url, { signal: AbortSignal.timeout(7000) });

  if (!response.ok) {
    throw new Error("Open-Meteo current weather request failed");
  }

  try {
    return normalizeWeather(await response.json());
  } catch (error) {
    if (error instanceof Error && error.message === "Open-Meteo current weather response was malformed") {
      throw error;
    }
    throw new Error("Open-Meteo current weather response was malformed");
  }
}
