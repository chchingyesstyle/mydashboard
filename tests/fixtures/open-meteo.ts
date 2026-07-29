export const openMeteoFixture = {
  latitude: 51.6635,
  longitude: -0.3969,
  generationtime_ms: 0.08404254913330078,
  utc_offset_seconds: 3600,
  timezone: "Europe/London",
  timezone_abbreviation: "BST",
  elevation: 76,
  current_units: {
    time: "iso8601",
    interval: "seconds",
    temperature_2m: "°C",
    apparent_temperature: "°C",
    relative_humidity_2m: "%",
    precipitation: "mm",
    weather_code: "wmo code",
    wind_speed_10m: "km/h",
    wind_direction_10m: "°",
    pressure_msl: "hPa"
  },
  current: {
    time: "2026-07-28T12:00",
    interval: 900,
    temperature_2m: 21.4,
    apparent_temperature: 20.8,
    relative_humidity_2m: 63,
    precipitation: 0,
    weather_code: 2,
    wind_speed_10m: 12.1,
    wind_direction_10m: 240,
    pressure_msl: 1016.4
  },
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
  },
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
};
