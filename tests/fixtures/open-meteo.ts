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
    weather_code: "wmo code",
    temperature_2m: "°C",
    precipitation_probability: "%"
  },
  hourly: {
    time: [
      "2026-07-28T13:00",
      "2026-07-28T14:00",
      "2026-07-28T15:00",
      "2026-07-28T16:00",
      "2026-07-28T17:00",
      "2026-07-28T18:00",
      "2026-07-28T19:00",
      "2026-07-28T20:00",
      "2026-07-28T21:00",
      "2026-07-28T22:00",
      "2026-07-28T23:00",
      "2026-07-29T00:00"
    ],
    weather_code: [2, 2, 3, 3, 61, 61, 61, 3, 3, 1, 1, 0],
    temperature_2m: [
      21.6, 22.1, 21.8, 20.9, 19.7, 18.5, 17.9, 17.2, 16.8, 16.1, 15.6, 15.0
    ],
    precipitation_probability: [10, 20, 35, 60, 45, 30, 55, 40, 25, 15, 10, 5]
  },
  daily_units: {
    time: "iso8601",
    weather_code: "wmo code",
    temperature_2m_min: "°C",
    temperature_2m_max: "°C",
    precipitation_probability_max: "%"
  },
  daily: {
    time: [
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
      "2026-08-03"
    ],
    weather_code: [2, 61, 3, 0, 1, 2, 63],
    temperature_2m_min: [13.2, 14.1, 12.8, 11.9, 13.5, 14.2, 15.0],
    temperature_2m_max: [26.8, 24.5, 22.1, 25.6, 27.3, 26.9, 23.4],
    precipitation_probability_max: [60, 80, 30, 5, 10, 20, 70]
  }
};
