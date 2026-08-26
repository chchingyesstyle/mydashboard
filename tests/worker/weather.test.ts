import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "../../src/shared/contracts";
import { fetchWeather, normalizeWeather } from "../../src/worker/providers/weather";
import { openMeteoFixture } from "../fixtures/open-meteo";

describe("Open-Meteo weather provider", () => {
  it("normalizes current Watford weather", () => {
    expect(normalizeWeather(openMeteoFixture)).toMatchObject({
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
      pressureMslHpa: 1016.4
    });
  });

  it("normalizes the 7-day forecast", () => {
    const { dailyForecast } = normalizeWeather(openMeteoFixture);

    expect(dailyForecast).toHaveLength(7);
    expect(dailyForecast[0]).toEqual({
      date: "2026-07-28",
      weatherCode: 2,
      temperatureMinC: 13.2,
      temperatureMaxC: 26.8,
      rainChancePercent: 60
    });
    expect(dailyForecast[6]).toEqual({
      date: "2026-08-03",
      weatherCode: 63,
      temperatureMinC: 15.0,
      temperatureMaxC: 23.4,
      rainChancePercent: 70
    });
  });

  it("normalizes the 12-hour forecast", () => {
    const { hourlyForecast } = normalizeWeather(openMeteoFixture);

    expect(hourlyForecast).toHaveLength(12);
    expect(hourlyForecast[0]).toEqual({
      time: "2026-07-28T13:00",
      weatherCode: 2,
      temperatureC: 21.6,
      rainChancePercent: 10
    });
    expect(hourlyForecast[11]).toEqual({
      time: "2026-07-29T00:00",
      weatherCode: 0,
      temperatureC: 15.0,
      rainChancePercent: 5
    });
  });

  it.each([
    ["absent", undefined],
    ["too short", { time: ["2026-07-28"], weather_code: [2], temperature_2m_min: [13.2], temperature_2m_max: [26.8], precipitation_probability_max: [60] }],
    ["non-numeric weather code", { ...openMeteoFixture.daily, weather_code: ["x", 61, 3, 0, 1, 2, 63] }]
  ])("keeps current weather with an empty daily forecast when it's malformed (%s)", (_case, daily) => {
    const payload = { ...openMeteoFixture, daily };

    expect(normalizeWeather(payload)).toMatchObject({
      temperatureC: 21.4,
      dailyForecast: []
    });
  });

  it.each([
    ["absent", undefined],
    ["too short", { time: ["2026-07-28T13:00"], weather_code: [2], temperature_2m: [21.6], precipitation_probability: [10] }],
    ["non-numeric temperature", { ...openMeteoFixture.hourly, temperature_2m: ["x", 22.1, 21.8, 20.9, 19.7, 18.5, 17.9, 17.2, 16.8, 16.1, 15.6, 15.0] }]
  ])("keeps current weather with an empty hourly forecast when it's malformed (%s)", (_case, hourly) => {
    const payload = { ...openMeteoFixture, hourly };

    expect(normalizeWeather(payload)).toMatchObject({
      temperatureC: 21.4,
      hourlyForecast: []
    });
  });

  it.each([
    [0, "Clear sky"],
    [45, "Fog"],
    [63, "Rain"],
    [73, "Snow fall"],
    [95, "Thunderstorm"]
  ])("normalizes WMO weather code %i as %s", (weatherCode, condition) => {
    const payload = {
      ...openMeteoFixture,
      current: { ...openMeteoFixture.current, weather_code: weatherCode }
    };

    expect(normalizeWeather(payload).condition).toBe(condition);
  });

  it("rejects malformed current weather payloads", () => {
    const payload = {
      ...openMeteoFixture,
      current: { ...openMeteoFixture.current, temperature_2m: Number.NaN }
    };

    expect(() => normalizeWeather(payload)).toThrow(
      "Open-Meteo current weather response was malformed"
    );
  });

  it("rejects unsupported weather codes", () => {
    const payload = {
      ...openMeteoFixture,
      current: { ...openMeteoFixture.current, weather_code: 4 }
    };

    expect(() => normalizeWeather(payload)).toThrow(
      "Open-Meteo current weather response was malformed"
    );
  });

  it("keeps current weather available when pressure is omitted", () => {
    const { pressure_msl: _pressure, ...current } = openMeteoFixture.current;

    expect(normalizeWeather({ ...openMeteoFixture, current })).toMatchObject({
      temperatureC: 21.4,
      pressureMslHpa: null
    });
  });

  it.each([
    ["absent", undefined],
    ["incomplete", [10, 20, 35, 60, 45]],
    ["non-numeric", [10, 20, 35, "60", 45, 30]],
    ["non-finite", [10, 20, 35, Number.NaN, 45, 30]],
    ["below range", [10, 20, -1, 60, 45, 30]],
    ["above range", [10, 20, 35, 101, 45, 30]]
  ])("keeps current weather when the rain series is %s", (_case, series) => {
    const payload = {
      ...openMeteoFixture,
      hourly: series === undefined
        ? undefined
        : { ...openMeteoFixture.hourly, precipitation_probability: series }
    };

    expect(normalizeWeather(payload)).toMatchObject({
      temperatureC: 21.4,
      rainChanceNext6HoursPercent: null
    });
  });

  it.each([
    ["absent", undefined],
    ["empty", []],
    ["non-numeric", ["13.2"]],
    ["non-finite", [Number.NaN]]
  ])("keeps current weather when daily temperatures are %s", (_case, values) => {
    const payload = {
      ...openMeteoFixture,
      daily: values === undefined
        ? undefined
        : {
            ...openMeteoFixture.daily,
            temperature_2m_min: values,
            temperature_2m_max: values
          }
    };

    expect(normalizeWeather(payload)).toMatchObject({
      temperatureC: 21.4,
      temperatureMinTodayC: null,
      temperatureMaxTodayC: null
    });
  });

  it.each([
    ["WFJ-EUS", "51.6635", "-0.3969"],
    ["EUS-WFJ", "51.5284", "-0.1346"]
  ] as const)("requests weather for the %s origin", async (
    routeId,
    latitude,
    longitude
  ) => {
    let requestedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(openMeteoFixture));
    }) as typeof fetch;

    await fetchWeather(
      fetcher,
      new Date("2026-07-28T11:55:00.000Z"),
      ROUTES[routeId]
    );

    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe(latitude);
    expect(url.searchParams.get("longitude")).toBe(longitude);
    expect(url.searchParams.get("timezone")).toBe("Europe/London");
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("current")).toBe(
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl"
    );
    expect(url.searchParams.get("hourly")).toBe(
      "weather_code,temperature_2m,precipitation_probability"
    );
    expect(url.searchParams.get("forecast_hours")).toBe("12");
    expect(url.searchParams.get("daily")).toBe(
      "weather_code,temperature_2m_min,temperature_2m_max,precipitation_probability_max"
    );
    expect(url.searchParams.get("forecast_days")).toBe("7");
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchWeather(
      fetcher,
      new Date(),
      ROUTES["WFJ-EUS"]
    )).rejects.toThrow(
      "Open-Meteo current weather request failed"
    );
  });

  it("aborts the Open-Meteo request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const weather = fetchWeather(fetcher, new Date(), ROUTES["WFJ-EUS"]);
    controller.abort();

    await expect(weather).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
