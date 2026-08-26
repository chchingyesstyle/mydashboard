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

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  RUN_TEST(test_final_destination_absent_when_null);
  RUN_TEST(test_handles_null_platform_null_coach_count_and_cancelled_service);
  RUN_TEST(test_parses_weather_panel_and_dashboard_status);
  RUN_TEST(test_weather_code_absent_when_null);
  RUN_TEST(test_parses_stale_and_unavailable_panel_statuses);
  RUN_TEST(test_parses_operator_code_and_extended_weather_fields);
  RUN_TEST(test_extended_weather_fields_absent_when_null);
  RUN_TEST(test_parses_electricity_panel_skipping_malformed_slots);
  RUN_TEST(test_today_average_price_absent_when_null);
  RUN_TEST(test_rejects_dashboard_missing_electricity_panel);
  return UNITY_END();
}
