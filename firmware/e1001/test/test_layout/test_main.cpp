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
                               const std::string& reason = "",
                               bool hasFinalDestination = false,
                               const std::string& finalDestinationName = "") {
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
  departure.hasFinalDestination = hasFinalDestination;
  departure.finalDestinationName = finalDestinationName;
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

void test_commute_mode_shows_operator_name_without_destination() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(makeDeparture(
      "2026-08-24T08:47:00+01:00", "On time", true, "9", true, 8, false,
      false, "", true, "London Euston"));

  LayoutResult layout = computeLayout(model, kMaxRows, -1, "", Screen::Commute);

  TEST_ASSERT_EQUAL_STRING("Watford to Euston", layout.routeTitle.c_str());
  TEST_ASSERT_EQUAL_STRING("London Northwestern Railway", layout.rows[0].operatorText.c_str());
  TEST_ASSERT_FALSE(layout.rows[0].hasDestination);
}

void test_all_departures_mode_shows_operator_code_and_destination() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(makeDeparture(
      "2026-08-24T08:47:00+01:00", "On time", true, "9", true, 8, false,
      false, "", true, "London Euston"));

  LayoutResult layout = computeLayout(model, kMaxRows, -1, "", Screen::AllDepartures);

  TEST_ASSERT_EQUAL_STRING("Watford Junction Departures", layout.routeTitle.c_str());
  TEST_ASSERT_EQUAL_STRING("LM", layout.rows[0].operatorText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].hasDestination);
  TEST_ASSERT_EQUAL_STRING("London Euston", layout.rows[0].destinationText.c_str());
}

void test_all_departures_mode_omits_destination_when_unknown() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(makeDeparture(
      "2026-08-24T08:47:00+01:00", "On time", true, "9", false, 0, false,
      false, "", false, ""));

  LayoutResult layout = computeLayout(model, kMaxRows, -1, "", Screen::AllDepartures);

  TEST_ASSERT_FALSE(layout.rows[0].hasDestination);
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
  model.weather.hasWeatherCode = true;
  model.weather.weatherCode = 2;

  LayoutResult layout = computeLayout(model, kMaxRows);
  TEST_ASSERT_TRUE(layout.hasWeatherText);
  TEST_ASSERT_EQUAL_STRING("12.4C", layout.weatherText.c_str());
  TEST_ASSERT_TRUE(layout.hasWeatherIcon);
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::PartlyCloudy),
                     static_cast<int>(layout.weatherIconKind));

  DashboardModel modelWithoutWeather;
  modelWithoutWeather.status = DashboardStatus::Partial;
  modelWithoutWeather.weather.hasTemperatureC = false;
  modelWithoutWeather.weather.hasCondition = false;
  modelWithoutWeather.weather.hasWeatherCode = false;

  LayoutResult layoutWithoutWeather = computeLayout(modelWithoutWeather, kMaxRows);
  TEST_ASSERT_FALSE(layoutWithoutWeather.hasWeatherText);
  TEST_ASSERT_FALSE(layoutWithoutWeather.hasWeatherIcon);
}

void test_weather_icon_kind_mapping() {
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Sun),
                     static_cast<int>(weatherIconKindFor(true, 0)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Sun),
                     static_cast<int>(weatherIconKindFor(true, 1)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::PartlyCloudy),
                     static_cast<int>(weatherIconKindFor(true, 2)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Cloud),
                     static_cast<int>(weatherIconKindFor(true, 3)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Fog),
                     static_cast<int>(weatherIconKindFor(true, 45)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Fog),
                     static_cast<int>(weatherIconKindFor(true, 48)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Rain),
                     static_cast<int>(weatherIconKindFor(true, 51)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Rain),
                     static_cast<int>(weatherIconKindFor(true, 67)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Rain),
                     static_cast<int>(weatherIconKindFor(true, 80)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Rain),
                     static_cast<int>(weatherIconKindFor(true, 82)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Snow),
                     static_cast<int>(weatherIconKindFor(true, 71)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Snow),
                     static_cast<int>(weatherIconKindFor(true, 77)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Snow),
                     static_cast<int>(weatherIconKindFor(true, 85)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Snow),
                     static_cast<int>(weatherIconKindFor(true, 86)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Thunderstorm),
                     static_cast<int>(weatherIconKindFor(true, 95)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Thunderstorm),
                     static_cast<int>(weatherIconKindFor(true, 99)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Cloud),
                     static_cast<int>(weatherIconKindFor(true, 4)));
  TEST_ASSERT_EQUAL(static_cast<int>(WeatherIconKind::Cloud),
                     static_cast<int>(weatherIconKindFor(false, 0)));
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
  model.weather.hasTemperatureMinTodayC = false;
  model.weather.hasTemperatureMaxTodayC = false;

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(3, (int)layout.weatherDetailLines.size());
  TEST_ASSERT_EQUAL_STRING("Feels like 11.1C", layout.weatherDetailLines[0].c_str());
  TEST_ASSERT_EQUAL_STRING("Humidity 63%", layout.weatherDetailLines[1].c_str());
  TEST_ASSERT_EQUAL_STRING("Rain (6h) 20%", layout.weatherDetailLines[2].c_str());
}

void test_pressure_and_today_min_max_lines() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasApparentTemperatureC = false;
  model.weather.hasRelativeHumidityPercent = false;
  model.weather.hasPrecipitationMm = false;
  model.weather.hasRainChanceNext6HoursPercent = false;
  model.weather.hasPressureMslHpa = true;
  model.weather.pressureMslHpa = 1016.4;
  model.weather.hasTemperatureMinTodayC = true;
  model.weather.temperatureMinTodayC = 13.2;
  model.weather.hasTemperatureMaxTodayC = true;
  model.weather.temperatureMaxTodayC = 26.8;

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(2, (int)layout.weatherDetailLines.size());
  TEST_ASSERT_EQUAL_STRING("Pressure 1016.40hPa", layout.weatherDetailLines[0].c_str());
  TEST_ASSERT_EQUAL_STRING("Min 13.2C / Max 26.8C", layout.weatherDetailLines[1].c_str());
}

void test_today_min_max_line_omitted_when_either_missing() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasApparentTemperatureC = false;
  model.weather.hasRelativeHumidityPercent = false;
  model.weather.hasPrecipitationMm = false;
  model.weather.hasRainChanceNext6HoursPercent = false;
  model.weather.hasPressureMslHpa = false;
  model.weather.hasTemperatureMinTodayC = true;
  model.weather.temperatureMinTodayC = 13.2;
  model.weather.hasTemperatureMaxTodayC = false;

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(0, (int)layout.weatherDetailLines.size());
}

void test_electricity_rows_capped_at_sixteen_slots() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.electricity.hasTodayAveragePencePerKwh = false;
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
  TEST_ASSERT_EQUAL_STRING("20.00p", layout.electricityRows[0].priceText.c_str());
  TEST_ASSERT_EQUAL_STRING("15:30", layout.electricityRows[15].time.c_str());
  TEST_ASSERT_EQUAL_STRING("35.00p", layout.electricityRows[15].priceText.c_str());
}

void test_electricity_rows_flag_below_average_price() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.electricity.hasTodayAveragePencePerKwh = true;
  model.electricity.todayAveragePencePerKwh = 20.0;
  const double prices[] = {10.0, 20.0, 30.0};
  for (double price : prices) {
    ElectricityPriceSlot slot;
    slot.validFrom = "2026-08-24T08:00:00+01:00";
    slot.validTo = "2026-08-24T08:30:00+01:00";
    slot.pricePencePerKwh = price;
    model.electricity.prices.push_back(slot);
  }

  LayoutResult layout = computeLayout(model, kMaxRows);

  // Today's average is 20.0: only the 10.0 slot is strictly below it.
  TEST_ASSERT_TRUE(layout.electricityRows[0].belowAverage);
  TEST_ASSERT_FALSE(layout.electricityRows[1].belowAverage);
  TEST_ASSERT_FALSE(layout.electricityRows[2].belowAverage);
}

void test_electricity_rows_never_flagged_when_average_unavailable() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.electricity.hasTodayAveragePencePerKwh = false;
  const double prices[] = {10.0, 20.0, 30.0};
  for (double price : prices) {
    ElectricityPriceSlot slot;
    slot.validFrom = "2026-08-24T08:00:00+01:00";
    slot.validTo = "2026-08-24T08:30:00+01:00";
    slot.pricePencePerKwh = price;
    model.electricity.prices.push_back(slot);
  }

  LayoutResult layout = computeLayout(model, kMaxRows);

  // Without a server-provided average, nothing should be flagged, even
  // though the cheapest slot would be "below" a locally-computed average.
  TEST_ASSERT_FALSE(layout.electricityRows[0].belowAverage);
  TEST_ASSERT_FALSE(layout.electricityRows[1].belowAverage);
  TEST_ASSERT_FALSE(layout.electricityRows[2].belowAverage);
}

void test_battery_percent_defaults_to_hidden_and_can_be_set() {
  DashboardModel model;
  model.status = DashboardStatus::Live;

  TEST_ASSERT_EQUAL(-1, computeLayout(model, kMaxRows).batteryPercent);
  TEST_ASSERT_EQUAL(87, computeLayout(model, kMaxRows, 87).batteryPercent);
}

void test_last_refresh_text_defaults_empty_and_can_be_set() {
  DashboardModel model;
  model.status = DashboardStatus::Live;

  TEST_ASSERT_EQUAL_STRING("", computeLayout(model, kMaxRows).lastRefreshText.c_str());
  TEST_ASSERT_EQUAL_STRING(
      "14:32", computeLayout(model, kMaxRows, -1, "14:32").lastRefreshText.c_str());
}

void test_battery_percent_from_voltage_matches_calibration_points() {
  TEST_ASSERT_EQUAL(0, batteryPercentFromVoltage(3.27));
  TEST_ASSERT_EQUAL(50, batteryPercentFromVoltage(3.75));
  TEST_ASSERT_EQUAL(100, batteryPercentFromVoltage(4.15));
}

void test_battery_percent_from_voltage_interpolates_between_points() {
  TEST_ASSERT_EQUAL(45, batteryPercentFromVoltage(3.715));
}

void test_weekday_index_for_known_anchor_dates() {
  TEST_ASSERT_EQUAL(4, weekdayIndexFor(1970, 1, 1));   // Thursday
  TEST_ASSERT_EQUAL(6, weekdayIndexFor(2000, 1, 1));   // Saturday
  TEST_ASSERT_EQUAL(1, weekdayIndexFor(2024, 1, 1));   // Monday
}

void test_daily_forecast_layout_formats_date_icon_and_temp_range() {
  DashboardModel model;
  model.weather.dailyForecast.push_back(
      DailyForecastDay{"2026-08-24", 2, 13.2, 26.8, 60});
  model.weather.dailyForecast.push_back(
      DailyForecastDay{"2026-08-25", 61, 14.1, 24.5, 80});

  LayoutResult layout = computeLayout(model, kMaxRows, -1, "", Screen::SevenDayWeather);

  TEST_ASSERT_EQUAL_STRING("7-Day Forecast", layout.routeTitle.c_str());
  TEST_ASSERT_EQUAL(2, (int)layout.dailyRows.size());

  const DailyForecastRow& monday = layout.dailyRows[0];
  TEST_ASSERT_EQUAL_STRING("Mon 24 Aug", monday.dateText.c_str());
  TEST_ASSERT_TRUE(monday.icon == WeatherIconKind::PartlyCloudy);
  TEST_ASSERT_FALSE(monday.hasRainChance);
  TEST_ASSERT_EQUAL_STRING("13-27C", monday.tempRangeText.c_str());

  const DailyForecastRow& tuesday = layout.dailyRows[1];
  TEST_ASSERT_EQUAL_STRING("Tue 25 Aug", tuesday.dateText.c_str());
  TEST_ASSERT_TRUE(tuesday.icon == WeatherIconKind::Rain);
  TEST_ASSERT_TRUE(tuesday.hasRainChance);
  TEST_ASSERT_EQUAL_STRING("80%", tuesday.rainChanceText.c_str());
  TEST_ASSERT_EQUAL_STRING("14-25C", tuesday.tempRangeText.c_str());
}

void test_hourly_forecast_layout_formats_time_icon_and_temp() {
  DashboardModel model;
  model.weather.hourlyForecast.push_back(
      HourlyForecastEntry{"2026-08-24T09:00", 0, 21.6, 5});
  model.weather.hourlyForecast.push_back(
      HourlyForecastEntry{"2026-08-24T10:00", 95, 19.2, 90});

  LayoutResult layout = computeLayout(model, kMaxRows, -1, "", Screen::TwelveHourWeather);

  TEST_ASSERT_EQUAL_STRING("Next 12 Hours", layout.routeTitle.c_str());
  TEST_ASSERT_EQUAL(2, (int)layout.hourlyRows.size());

  const HourlyForecastRow& first = layout.hourlyRows[0];
  TEST_ASSERT_EQUAL_STRING("09:00", first.timeText.c_str());
  TEST_ASSERT_TRUE(first.icon == WeatherIconKind::Sun);
  TEST_ASSERT_FALSE(first.hasRainChance);
  TEST_ASSERT_EQUAL_STRING("22C", first.tempText.c_str());

  const HourlyForecastRow& second = layout.hourlyRows[1];
  TEST_ASSERT_EQUAL_STRING("10:00", second.timeText.c_str());
  TEST_ASSERT_TRUE(second.icon == WeatherIconKind::Thunderstorm);
  TEST_ASSERT_TRUE(second.hasRainChance);
  TEST_ASSERT_EQUAL_STRING("90%", second.rainChanceText.c_str());
  TEST_ASSERT_EQUAL_STRING("19C", second.tempText.c_str());
}

void test_forecast_layout_passes_through_status_battery_and_refresh_text() {
  DashboardModel model;
  model.status = DashboardStatus::Partial;

  LayoutResult layout =
      computeLayout(model, kMaxRows, 42, "Mon 24 Aug  09:00", Screen::SevenDayWeather);

  TEST_ASSERT_EQUAL_STRING("Partial", layout.statusBannerText.c_str());
  TEST_ASSERT_EQUAL(42, layout.batteryPercent);
  TEST_ASSERT_EQUAL_STRING("Mon 24 Aug  09:00", layout.lastRefreshText.c_str());
}

void test_battery_percent_from_voltage_clamps_out_of_range() {
  TEST_ASSERT_EQUAL(0, batteryPercentFromVoltage(2.5));
  TEST_ASSERT_EQUAL(100, batteryPercentFromVoltage(4.5));
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_extracts_time_of_day_and_platform_text);
  RUN_TEST(test_commute_mode_shows_operator_name_without_destination);
  RUN_TEST(test_all_departures_mode_shows_operator_code_and_destination);
  RUN_TEST(test_all_departures_mode_omits_destination_when_unknown);
  RUN_TEST(test_null_platform_and_coach_count_produce_fallback_text);
  RUN_TEST(test_delayed_departure_gets_delayed_emphasis);
  RUN_TEST(test_row_count_is_capped_at_max_rows);
  RUN_TEST(test_max_rows_constant_is_eight);
  RUN_TEST(test_status_banner_text_for_each_dashboard_status);
  RUN_TEST(test_weather_text_formatting_and_missing_weather);
  RUN_TEST(test_weather_icon_kind_mapping);
  RUN_TEST(test_weather_detail_lines_include_only_present_fields);
  RUN_TEST(test_pressure_and_today_min_max_lines);
  RUN_TEST(test_today_min_max_line_omitted_when_either_missing);
  RUN_TEST(test_electricity_rows_capped_at_sixteen_slots);
  RUN_TEST(test_electricity_rows_flag_below_average_price);
  RUN_TEST(test_electricity_rows_never_flagged_when_average_unavailable);
  RUN_TEST(test_battery_percent_defaults_to_hidden_and_can_be_set);
  RUN_TEST(test_last_refresh_text_defaults_empty_and_can_be_set);
  RUN_TEST(test_battery_percent_from_voltage_matches_calibration_points);
  RUN_TEST(test_battery_percent_from_voltage_interpolates_between_points);
  RUN_TEST(test_battery_percent_from_voltage_clamps_out_of_range);
  RUN_TEST(test_weekday_index_for_known_anchor_dates);
  RUN_TEST(test_daily_forecast_layout_formats_date_icon_and_temp_range);
  RUN_TEST(test_hourly_forecast_layout_formats_time_icon_and_temp);
  RUN_TEST(test_forecast_layout_passes_through_status_battery_and_refresh_text);
  return UNITY_END();
}
