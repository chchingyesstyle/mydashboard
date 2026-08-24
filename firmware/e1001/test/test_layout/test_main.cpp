#include <unity.h>
#include <cstdio>
#include "layout.h"

namespace {

ParsedDeparture makeDeparture(const std::string& scheduledDeparture,
                               const std::string& expectedDisplay,
                               bool hasPlatform,
                               const std::string& platform,
                               bool hasCoachCount,
                               int coachCount,
                               bool isCancelled,
                               bool hasReason = false,
                               const std::string& reason = "") {
  ParsedDeparture departure;
  departure.scheduledDeparture = scheduledDeparture;
  departure.expectedDisplay = expectedDisplay;
  departure.hasPlatform = hasPlatform;
  departure.platform = platform;
  departure.operatorName = "London Northwestern Railway";
  departure.operatorCode = "LM";
  departure.hasCoachCount = hasCoachCount;
  departure.coachCount = coachCount;
  departure.isCancelled = isCancelled;
  departure.hasReason = hasReason;
  departure.reason = reason;
  return departure;
}

}  // namespace

void test_extracts_time_of_day_and_platform_text() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T08:47:00+01:00", "On time", true, "9", true, 8, false));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(1, (int)layout.rows.size());
  TEST_ASSERT_EQUAL_STRING("08:47", layout.rows[0].time.c_str());
  TEST_ASSERT_EQUAL_STRING("On time", layout.rows[0].statusText.c_str());
  TEST_ASSERT_EQUAL_STRING("Platform 9", layout.rows[0].platformText.c_str());
  TEST_ASSERT_EQUAL_STRING("London Northwestern Railway", layout.rows[0].operatorText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].hasCoachText);
  TEST_ASSERT_EQUAL_STRING("8 coaches", layout.rows[0].coachText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Normal);
  TEST_ASSERT_FALSE(layout.rows[0].hasReason);
}

void test_null_platform_and_coach_count_produce_fallback_text() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T09:17:00+01:00", "Cancelled", false, "", false, 0, true, true,
                    "This service has been cancelled because of a shortage of train crew"));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(1, (int)layout.rows.size());
  TEST_ASSERT_EQUAL_STRING("Platform TBC", layout.rows[0].platformText.c_str());
  TEST_ASSERT_FALSE(layout.rows[0].hasCoachText);
  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Cancelled);
  TEST_ASSERT_TRUE(layout.rows[0].hasReason);
  TEST_ASSERT_EQUAL_STRING(
      "This service has been cancelled because of a shortage of train crew",
      layout.rows[0].reasonText.c_str());
}

void test_delayed_departure_gets_delayed_emphasis() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T09:02:00+01:00", "09:11", true, "4", true, 4, false));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Delayed);
}

void test_row_count_is_capped_at_max_rows() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  for (int i = 0; i < 10; i++) {
    model.departures.services.push_back(
        makeDeparture("2026-08-24T08:00:00+01:00", "On time", true, "1", false, 0, false));
  }

  LayoutResult layout = computeLayout(model, 6);

  TEST_ASSERT_EQUAL(6, (int)layout.rows.size());
}

void test_max_rows_constant_is_eight() {
  TEST_ASSERT_EQUAL(8, kMaxRows);
}

void test_status_banner_text_for_each_dashboard_status() {
  DashboardModel liveModel;
  liveModel.status = DashboardStatus::Live;
  TEST_ASSERT_EQUAL_STRING("Live", computeLayout(liveModel, kMaxRows).statusBannerText.c_str());

  DashboardModel partialModel;
  partialModel.status = DashboardStatus::Partial;
  TEST_ASSERT_EQUAL_STRING("Partial", computeLayout(partialModel, kMaxRows).statusBannerText.c_str());

  DashboardModel unavailableModel;
  unavailableModel.status = DashboardStatus::Unavailable;
  TEST_ASSERT_EQUAL_STRING("Unavailable", computeLayout(unavailableModel, kMaxRows).statusBannerText.c_str());
}

void test_weather_text_formatting_and_missing_weather() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasTemperatureC = true;
  model.weather.temperatureC = 12.4;
  model.weather.hasCondition = true;
  model.weather.condition = "Partly cloudy";

  LayoutResult layout = computeLayout(model, kMaxRows);
  TEST_ASSERT_TRUE(layout.hasWeatherText);
  TEST_ASSERT_EQUAL_STRING("12C, Partly cloudy", layout.weatherText.c_str());

  DashboardModel modelWithoutWeather;
  modelWithoutWeather.status = DashboardStatus::Partial;
  modelWithoutWeather.weather.hasTemperatureC = false;
  modelWithoutWeather.weather.hasCondition = false;

  LayoutResult layoutWithoutWeather = computeLayout(modelWithoutWeather, kMaxRows);
  TEST_ASSERT_FALSE(layoutWithoutWeather.hasWeatherText);
}

void test_weather_detail_lines_include_only_present_fields() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasApparentTemperatureC = true;
  model.weather.apparentTemperatureC = 11.1;
  model.weather.hasRelativeHumidityPercent = true;
  model.weather.relativeHumidityPercent = 63;
  model.weather.hasPrecipitationMm = false;
  model.weather.hasRainChanceNext6HoursPercent = true;
  model.weather.rainChanceNext6HoursPercent = 20;
  model.weather.hasPressureMslHpa = false;

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(3, (int)layout.weatherDetailLines.size());
  TEST_ASSERT_EQUAL_STRING("Feels like 11C", layout.weatherDetailLines[0].c_str());
  TEST_ASSERT_EQUAL_STRING("Humidity 63%", layout.weatherDetailLines[1].c_str());
  TEST_ASSERT_EQUAL_STRING("Rain (6h) 20%", layout.weatherDetailLines[2].c_str());
}

void test_electricity_rows_capped_at_sixteen_slots() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  for (int i = 0; i < 17; i++) {
    char timestamp[32];
    snprintf(timestamp, sizeof(timestamp), "2026-08-24T%02d:%02d:00+01:00",
             8 + (i / 2), (i % 2) * 30);
    ElectricityPriceSlot slot;
    slot.validFrom = timestamp;
    slot.validTo = timestamp;
    slot.pricePencePerKwh = 20.0 + i;
    model.electricity.prices.push_back(slot);
  }

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(16, (int)layout.electricityRows.size());
  TEST_ASSERT_EQUAL_STRING("08:00", layout.electricityRows[0].time.c_str());
  TEST_ASSERT_EQUAL_STRING("20.0p", layout.electricityRows[0].priceText.c_str());
  TEST_ASSERT_EQUAL_STRING("15:30", layout.electricityRows[15].time.c_str());
  TEST_ASSERT_EQUAL_STRING("35.0p", layout.electricityRows[15].priceText.c_str());
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_extracts_time_of_day_and_platform_text);
  RUN_TEST(test_null_platform_and_coach_count_produce_fallback_text);
  RUN_TEST(test_delayed_departure_gets_delayed_emphasis);
  RUN_TEST(test_row_count_is_capped_at_max_rows);
  RUN_TEST(test_max_rows_constant_is_eight);
  RUN_TEST(test_status_banner_text_for_each_dashboard_status);
  RUN_TEST(test_weather_text_formatting_and_missing_weather);
  RUN_TEST(test_weather_detail_lines_include_only_present_fields);
  RUN_TEST(test_electricity_rows_capped_at_sixteen_slots);
  return UNITY_END();
}
