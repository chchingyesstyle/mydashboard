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
}

void test_parses_stale_and_unavailable_panel_statuses() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "unavailable",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "stale", "updatedAt": "2026-08-24T07:30:00.000Z", "stale": true, "services": [], "error": null},
    "weather": {"status": "unavailable", "updatedAt": null, "stale": false, "temperatureC": null, "condition": null, "error": "Current weather is temporarily unavailable."}
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

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  RUN_TEST(test_handles_null_platform_null_coach_count_and_cancelled_service);
  RUN_TEST(test_parses_weather_panel_and_dashboard_status);
  RUN_TEST(test_parses_stale_and_unavailable_panel_statuses);
  return UNITY_END();
}
