import { describe, expect, it, vi } from "vitest";
import { fetchWeather, normalizeWeather } from "../../src/worker/providers/weather";
import { openMeteoFixture } from "../fixtures/open-meteo";

describe("Open-Meteo weather provider", () => {
  it("normalizes current Watford weather", () => {
    expect(normalizeWeather(openMeteoFixture)).toEqual({
      temperatureC: 21.4,
      apparentTemperatureC: 20.8,
      relativeHumidityPercent: 63,
      precipitationMm: 0,
      weatherCode: 2,
      condition: "Partly cloudy",
      windSpeedKph: 12.1,
      windDirectionDegrees: 240,
      pressureMslHpa: 1016.4
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

  it("requests only current weather for Watford Junction", async () => {
    let requestedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify(openMeteoFixture));
    }) as typeof fetch;

    await fetchWeather(fetcher, new Date("2026-07-28T11:55:00.000Z"));

    const url = new URL(requestedUrl);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("51.6635");
    expect(url.searchParams.get("longitude")).toBe("-0.3969");
    expect(url.searchParams.get("timezone")).toBe("Europe/London");
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("current")).toBe(
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl"
    );
    expect(requestedUrl).not.toContain("hourly=");
    expect(requestedUrl).not.toContain("daily=");
  });

  it("throws a provider-specific error for a failed response", async () => {
    const fetcher = (async () => new Response("upstream error", { status: 503 })) as typeof fetch;

    await expect(fetchWeather(fetcher, new Date())).rejects.toThrow(
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

    const weather = fetchWeather(fetcher, new Date());
    controller.abort();

    await expect(weather).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
