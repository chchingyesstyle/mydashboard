#include <unity.h>
#include "dashboard_parser.h"

void test_parses_live_departure_with_all_fields() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "abc123",
          "scheduledDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDisplay": "On time",
          "platform": "9",
          "platformStatus": "live",
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": {"name": "London Euston", "crs": "EUS"},
          "coachCount": 8,
          "status": "on_time",
          "isCancelled": false,
          "reason": null
        }
      ],
      "error": null
    },
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.departures.status == PanelStatus::Live);
  TEST_ASSERT_FALSE(result.model.departures.stale);
  TEST_ASSERT_TRUE(result.model.departures.hasUpdatedAt);
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:00:00.000Z", result.model.departures.updatedAt.c_str());
  TEST_ASSERT_EQUAL(1, (int)result.model.departures.services.size());

  const ParsedDeparture& departure = result.model.departures.services[0];
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:47:00+01:00", departure.scheduledDeparture.c_str());
  TEST_ASSERT_EQUAL_STRING("On time", departure.expectedDisplay.c_str());
  TEST_ASSERT_TRUE(departure.hasPlatform);
  TEST_ASSERT_EQUAL_STRING("9", departure.platform.c_str());
  TEST_ASSERT_EQUAL_STRING("London Northwestern Railway", departure.operatorName.c_str());
  TEST_ASSERT_TRUE(departure.hasCoachCount);
  TEST_ASSERT_EQUAL(8, departure.coachCount);
  TEST_ASSERT_FALSE(departure.isCancelled);
  TEST_ASSERT_FALSE(departure.hasReason);
  TEST_ASSERT_TRUE(departure.hasFinalDestination);
  TEST_ASSERT_EQUAL_STRING("London Euston", departure.finalDestinationName.c_str());
}

void test_final_destination_absent_when_null() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "All destinations", "crs": ""}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "xyz789",
          "scheduledDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDisplay": "On time",
          "platform": "9",
          "platformStatus": "live",
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": null,
          "coachCount": null,
          "status": "on_time",
          "isCancelled": false,
          "reason": null
        }
      ],
      "error": null
    },
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "prices": [], "error": null}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_FALSE(result.model.departures.services[0].hasFinalDestination);
}

void test_handles_null_platform_null_coach_count_and_cancelled_service() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "partial",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "def456",
          "scheduledDeparture": "2026-08-24T09:17:00+01:00",
          "expectedDeparture": null,
          "expectedDisplay": "Cancelled",
          "platform": null,
          "platformStatus": null,
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": null,
          "coachCount": null,
          "status": "cancelled",
          "isCancelled": true,
          "reason": "This service has been cancelled because of a shortage of train crew"
        }
      ],
      "error": null
    },
    "weather": {
      "status": "unavailable",
      "updatedAt": null,
      "stale": false,
      "temperatureC": null,
      "condition": null,
      "error": "Current weather is temporarily unavailable."
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(1, (int)result.model.departures.services.size());

  const ParsedDeparture& departure = result.model.departures.services[0];
  TEST_ASSERT_FALSE(departure.hasPlatform);
  TEST_ASSERT_FALSE(departure.hasCoachCount);
  TEST_ASSERT_TRUE(departure.isCancelled);
  TEST_ASSERT_EQUAL_STRING("Cancelled", departure.expectedDisplay.c_str());
  TEST_ASSERT_TRUE(departure.hasReason);
  TEST_ASSERT_EQUAL_STRING(
      "This service has been cancelled because of a shortage of train crew",
      departure.reason.c_str());
}

void test_parses_weather_panel_and_dashboard_status() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "weatherCode": 2,
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.status == DashboardStatus::Live);
  TEST_ASSERT_TRUE(result.model.weather.status == PanelStatus::Live);
  TEST_ASSERT_FALSE(result.model.weather.stale);
  TEST_ASSERT_TRUE(result.model.weather.hasTemperatureC);
  TEST_ASSERT_EQUAL_FLOAT(12.4, result.model.weather.temperatureC);
  TEST_ASSERT_TRUE(result.model.weather.hasCondition);
  TEST_ASSERT_EQUAL_STRING("Partly cloudy", result.model.weather.condition.c_str());
  TEST_ASSERT_TRUE(result.model.weather.hasWeatherCode);
  TEST_ASSERT_EQUAL(2, result.model.weather.weatherCode);
}

void test_parses_daily_and_hourly_forecast() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "weatherCode": 2,
      "dailyForecast": [
        {"date": "2026-08-24", "weatherCode": 2, "temperatureMinC": 13.2, "temperatureMaxC": 26.8, "rainChancePercent": 60},
        {"date": "2026-08-25", "weatherCode": 61, "temperatureMinC": 14.1, "temperatureMaxC": 24.5, "rainChancePercent": 80}
      ],
      "hourlyForecast": [
        {"time": "2026-08-24T09:00", "weatherCode": 2, "temperatureC": 21.6, "rainChancePercent": 10},
        {"time": "2026-08-24T10:00", "weatherCode": 61, "temperatureC": 22.1, "rainChancePercent": 20}
      ],
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(2, (int)result.model.weather.dailyForecast.size());
  TEST_ASSERT_EQUAL_STRING("2026-08-24", result.model.weather.dailyForecast[0].date.c_str());
  TEST_ASSERT_EQUAL(2, result.model.weather.dailyForecast[0].weatherCode);
  TEST_ASSERT_EQUAL_FLOAT(13.2, result.model.weather.dailyForecast[0].temperatureMinC);
  TEST_ASSERT_EQUAL_FLOAT(26.8, result.model.weather.dailyForecast[0].temperatureMaxC);
  TEST_ASSERT_EQUAL_FLOAT(60, result.model.weather.dailyForecast[0].rainChancePercent);
  TEST_ASSERT_EQUAL_STRING("2026-08-25", result.model.weather.dailyForecast[1].date.c_str());

  TEST_ASSERT_EQUAL(2, (int)result.model.weather.hourlyForecast.size());
  TEST_ASSERT_EQUAL_STRING("2026-08-24T09:00", result.model.weather.hourlyForecast[0].time.c_str());
  TEST_ASSERT_EQUAL(2, result.model.weather.hourlyForecast[0].weatherCode);
  TEST_ASSERT_EQUAL_FLOAT(21.6, result.model.weather.hourlyForecast[0].temperatureC);
  TEST_ASSERT_EQUAL_FLOAT(10, result.model.weather.hourlyForecast[0].rainChancePercent);
  TEST_ASSERT_EQUAL_STRING("2026-08-24T10:00", result.model.weather.hourlyForecast[1].time.c_str());
}

void test_forecasts_empty_when_absent() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "weatherCode": 2,
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(0, (int)result.model.weather.dailyForecast.size());
  TEST_ASSERT_EQUAL(0, (int)result.model.weather.hourlyForecast.size());
  TEST_ASSERT_FALSE(result.model.weather.hasWarning);
}

void test_parses_weather_warning_when_present() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "weatherCode": 2,
      "warning": {"level": "yellow", "event": "Yellow thunderstorm warning", "headline": "A small risk of flooding and disruption from thunderstorms."},
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.weather.hasWarning);
  TEST_ASSERT_EQUAL_STRING("yellow", result.model.weather.warningLevel.c_str());
  TEST_ASSERT_EQUAL_STRING(
      "Yellow thunderstorm warning", result.model.weather.warningEvent.c_str());
  TEST_ASSERT_EQUAL_STRING(
      "A small risk of flooding and disruption from thunderstorms.",
      result.model.weather.warningHeadline.c_str());
}

void test_weather_code_absent_when_null() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "partial",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "unavailable",
      "updatedAt": null,
      "stale": false,
      "temperatureC": null,
      "condition": null,
      "weatherCode": null,
      "error": "Current weather is temporarily unavailable."
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_FALSE(result.model.weather.hasWeatherCode);
}

void test_parses_stale_and_unavailable_panel_statuses() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "unavailable",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "stale", "updatedAt": "2026-08-24T07:30:00.000Z", "stale": true, "services": [], "error": null},
    "weather": {"status": "unavailable", "updatedAt": null, "stale": false, "temperatureC": null, "condition": null, "error": "Current weather is temporarily unavailable."},
    "electricity": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "prices": [], "error": null}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.status == DashboardStatus::Unavailable);
  TEST_ASSERT_TRUE(result.model.departures.status == PanelStatus::Stale);
  TEST_ASSERT_TRUE(result.model.departures.stale);
  TEST_ASSERT_TRUE(result.model.weather.status == PanelStatus::Unavailable);
  TEST_ASSERT_FALSE(result.model.weather.hasUpdatedAt);
  TEST_ASSERT_FALSE(result.model.weather.hasTemperatureC);
  TEST_ASSERT_FALSE(result.model.weather.hasCondition);
}

void test_parses_operator_code_and_extended_weather_fields() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "abc123",
          "scheduledDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDisplay": "On time",
          "platform": "9",
          "platformStatus": "live",
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": null,
          "coachCount": 8,
          "status": "on_time",
          "isCancelled": false,
          "reason": null
        }
      ],
      "error": null
    },
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "apparentTemperatureC": 11.1,
      "relativeHumidityPercent": 63,
      "precipitationMm": 0,
      "rainChanceNext6HoursPercent": 20,
      "pressureMslHpa": 1016.4,
      "temperatureMinTodayC": 13.2,
      "temperatureMaxTodayC": 26.8,
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL_STRING("LM", result.model.departures.services[0].operatorCode.c_str());

  const WeatherPanel& weather = result.model.weather;
  TEST_ASSERT_TRUE(weather.hasApparentTemperatureC);
  TEST_ASSERT_EQUAL_FLOAT(11.1, weather.apparentTemperatureC);
  TEST_ASSERT_TRUE(weather.hasRelativeHumidityPercent);
  TEST_ASSERT_EQUAL_FLOAT(63, weather.relativeHumidityPercent);
  TEST_ASSERT_TRUE(weather.hasPrecipitationMm);
  TEST_ASSERT_EQUAL_FLOAT(0, weather.precipitationMm);
  TEST_ASSERT_TRUE(weather.hasTemperatureMinTodayC);
  TEST_ASSERT_EQUAL_FLOAT(13.2, weather.temperatureMinTodayC);
  TEST_ASSERT_TRUE(weather.hasTemperatureMaxTodayC);
  TEST_ASSERT_EQUAL_FLOAT(26.8, weather.temperatureMaxTodayC);
  TEST_ASSERT_TRUE(weather.hasRainChanceNext6HoursPercent);
  TEST_ASSERT_EQUAL_FLOAT(20, weather.rainChanceNext6HoursPercent);
  TEST_ASSERT_TRUE(weather.hasPressureMslHpa);
  TEST_ASSERT_EQUAL_FLOAT(1016.4, weather.pressureMslHpa);
}

void test_extended_weather_fields_absent_when_null() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "partial",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "apparentTemperatureC": 11.1,
      "relativeHumidityPercent": 63,
      "precipitationMm": 0,
      "rainChanceNext6HoursPercent": null,
      "pressureMslHpa": null,
      "error": null
    },
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_FALSE(result.model.weather.hasRainChanceNext6HoursPercent);
  TEST_ASSERT_FALSE(result.model.weather.hasPressureMslHpa);
}

void test_parses_electricity_panel_skipping_malformed_slots() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [
        {"validFrom": "2026-08-24T08:00:00Z", "validTo": "2026-08-24T08:30:00Z", "pricePencePerKwh": 20.5},
        {"validFrom": "2026-08-24T08:30:00Z", "validTo": "2026-08-24T09:00:00Z", "pricePencePerKwh": null}
      ],
      "todayAveragePencePerKwh": 29.14,
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.electricity.status == PanelStatus::Live);
  TEST_ASSERT_EQUAL(1, (int)result.model.electricity.prices.size());
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:00:00Z", result.model.electricity.prices[0].validFrom.c_str());
  TEST_ASSERT_EQUAL_FLOAT(20.5, result.model.electricity.prices[0].pricePencePerKwh);
  TEST_ASSERT_TRUE(result.model.electricity.hasTodayAveragePencePerKwh);
  TEST_ASSERT_EQUAL_FLOAT(29.14, result.model.electricity.todayAveragePencePerKwh);
}

void test_today_average_price_absent_when_null() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "todayAveragePencePerKwh": null,
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_FALSE(result.model.electricity.hasTodayAveragePencePerKwh);
}

void test_rejects_dashboard_missing_electricity_panel() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_FALSE(result.ok);
}

void test_parses_live_and_stale_news_panels_with_utf8_titles() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "prices": [], "error": null},
    "news": {
      "hongKong": {
        "status": "live",
        "updatedAt": "2026-08-24T08:00:00.000Z",
        "stale": false,
        "source": "RTHK News",
        "topStories": [
          {"title": "香港最新消息", "publishedAt": "2026-08-24T07:55:00.000Z", "url": "https://news.rthk.hk/story/1"},
          {"title": "第二條新聞", "publishedAt": "2026-08-24T07:50:00.000Z", "url": "https://news.rthk.hk/story/2"},
          {"title": "第三條新聞", "publishedAt": "2026-08-24T07:45:00.000Z", "url": "https://news.rthk.hk/story/3"},
          {"title": "第四條新聞", "publishedAt": "2026-08-24T07:40:00.000Z", "url": "https://news.rthk.hk/story/4"}
        ],
        "latestStories": [
          {"title": "第五條新聞", "publishedAt": "2026-08-24T07:35:00.000Z", "url": "https://news.rthk.hk/story/5"},
          {"title": "第六條新聞", "publishedAt": "2026-08-24T07:30:00.000Z", "url": "https://news.rthk.hk/story/6"},
          {"title": "第七條新聞", "publishedAt": "2026-08-24T07:25:00.000Z", "url": "https://news.rthk.hk/story/7"},
          {"title": "第八條新聞", "publishedAt": "2026-08-24T07:20:00.000Z", "url": "https://news.rthk.hk/story/8"},
          {"title": "第九條新聞", "publishedAt": "2026-08-24T07:15:00.000Z", "url": "https://news.rthk.hk/story/9"},
          {"title": "第十條新聞", "publishedAt": "2026-08-24T07:10:00.000Z", "url": "https://news.rthk.hk/story/10"},
          {"title": "第十一條新聞", "publishedAt": "2026-08-24T07:05:00.000Z", "url": "https://news.rthk.hk/story/11"}
        ],
        "error": null
      },
      "unitedKingdom": {
        "status": "stale",
        "updatedAt": "2026-08-24T07:00:00.000Z",
        "stale": true,
        "source": "BBC News",
        "topStories": [
          {"title": "UK headline", "publishedAt": "2026-08-24T06:55:00.000Z", "url": "https://www.bbc.co.uk/news/story/1"}
        ],
        "latestStories": [],
        "error": null
      }
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.news.hongKong.status == PanelStatus::Live);
  TEST_ASSERT_FALSE(result.model.news.hongKong.stale);
  TEST_ASSERT_EQUAL_STRING("RTHK News", result.model.news.hongKong.source.c_str());
  TEST_ASSERT_EQUAL(3, (int)result.model.news.hongKong.topStories.size());
  TEST_ASSERT_EQUAL_STRING("香港最新消息", result.model.news.hongKong.topStories[0].title.c_str());
  TEST_ASSERT_EQUAL_STRING("2026-08-24T07:55:00.000Z", result.model.news.hongKong.topStories[0].publishedAt.c_str());
  TEST_ASSERT_EQUAL_STRING("https://news.rthk.hk/story/1", result.model.news.hongKong.topStories[0].url.c_str());
  TEST_ASSERT_EQUAL(6, (int)result.model.news.hongKong.latestStories.size());
  TEST_ASSERT_EQUAL_STRING("第十條新聞", result.model.news.hongKong.latestStories[5].title.c_str());

  TEST_ASSERT_TRUE(result.model.news.unitedKingdom.status == PanelStatus::Stale);
  TEST_ASSERT_TRUE(result.model.news.unitedKingdom.stale);
  TEST_ASSERT_TRUE(result.model.news.unitedKingdom.hasUpdatedAt);
  TEST_ASSERT_EQUAL_STRING("2026-08-24T07:00:00.000Z", result.model.news.unitedKingdom.updatedAt.c_str());
}

void test_skips_malformed_news_stories_and_defaults_missing_news_to_unavailable() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "prices": [], "error": null},
    "news": {
      "hongKong": {
        "status": "live",
        "updatedAt": "2026-08-24T08:00:00.000Z",
        "stale": false,
        "source": "RTHK News",
        "topStories": [
          {"title": null, "publishedAt": "2026-08-24T07:55:00.000Z", "url": "https://news.rthk.hk/story/bad-title"},
          {"title": "有效新聞", "publishedAt": "2026-08-24T07:50:00.000Z", "url": 123}
        ],
        "latestStories": [
          {"title": "有效新聞", "publishedAt": null, "url": "https://news.rthk.hk/story/bad-time"},
          {"title": "有效新聞", "publishedAt": "2026-08-24T07:40:00.000Z", "url": "https://news.rthk.hk/story/good"}
        ],
        "error": null
      },
      "unitedKingdom": {
        "status": "unavailable",
        "updatedAt": null,
        "stale": false,
        "source": "BBC News",
        "topStories": [],
        "latestStories": [],
        "error": "UK news is temporarily unavailable."
      }
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(1, (int)result.model.news.hongKong.latestStories.size());
  TEST_ASSERT_EQUAL_STRING("https://news.rthk.hk/story/good", result.model.news.hongKong.latestStories[0].url.c_str());
  TEST_ASSERT_TRUE(result.model.news.unitedKingdom.status == PanelStatus::Unavailable);
  TEST_ASSERT_FALSE(result.model.news.unitedKingdom.stale);
  TEST_ASSERT_EQUAL(0, (int)result.model.news.unitedKingdom.topStories.size());
}

void test_missing_news_object_keeps_dashboard_parse_compatible() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "prices": [], "error": null}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.news.hongKong.status == PanelStatus::Unavailable);
  TEST_ASSERT_TRUE(result.model.news.unitedKingdom.status == PanelStatus::Unavailable);
  TEST_ASSERT_EQUAL_STRING("RTHK News", result.model.news.hongKong.source.c_str());
  TEST_ASSERT_EQUAL_STRING("BBC News", result.model.news.unitedKingdom.source.c_str());
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  RUN_TEST(test_final_destination_absent_when_null);
  RUN_TEST(test_handles_null_platform_null_coach_count_and_cancelled_service);
  RUN_TEST(test_parses_weather_panel_and_dashboard_status);
  RUN_TEST(test_parses_daily_and_hourly_forecast);
  RUN_TEST(test_forecasts_empty_when_absent);
  RUN_TEST(test_parses_weather_warning_when_present);
  RUN_TEST(test_weather_code_absent_when_null);
  RUN_TEST(test_parses_stale_and_unavailable_panel_statuses);
  RUN_TEST(test_parses_operator_code_and_extended_weather_fields);
  RUN_TEST(test_extended_weather_fields_absent_when_null);
  RUN_TEST(test_parses_electricity_panel_skipping_malformed_slots);
  RUN_TEST(test_today_average_price_absent_when_null);
  RUN_TEST(test_rejects_dashboard_missing_electricity_panel);
  RUN_TEST(test_parses_live_and_stale_news_panels_with_utf8_titles);
  RUN_TEST(test_skips_malformed_news_stories_and_defaults_missing_news_to_unavailable);
  RUN_TEST(test_missing_news_object_keeps_dashboard_parse_compatible);
  return UNITY_END();
}
