#include <unity.h>
#include "route_selector.h"

void test_commute_mode_from_six_to_before_nine() {
  TEST_ASSERT_TRUE(routeModeForHour(6) == RouteMode::Commute);
  TEST_ASSERT_TRUE(routeModeForHour(7) == RouteMode::Commute);
  TEST_ASSERT_TRUE(routeModeForHour(8) == RouteMode::Commute);
}

void test_all_departures_mode_outside_commute_window() {
  TEST_ASSERT_TRUE(routeModeForHour(9) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForHour(5) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForHour(0) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForHour(23) == RouteMode::AllDepartures);
}

void test_route_id_for_mode() {
  TEST_ASSERT_EQUAL_STRING("WFJ-EUS", routeIdForMode(RouteMode::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForMode(RouteMode::AllDepartures).c_str());
}

void test_route_title_for_mode() {
  TEST_ASSERT_EQUAL_STRING("Watford to Euston", routeTitleForMode(RouteMode::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING(
      "Watford Junction Departures", routeTitleForMode(RouteMode::AllDepartures).c_str());
}

void test_time_based_default_screen() {
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(6) == Screen::Commute);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(8) == Screen::Commute);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(9) == Screen::SevenDayWeather);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(0) == Screen::SevenDayWeather);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(23) == Screen::SevenDayWeather);
}

void test_route_mode_for_screen() {
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::Commute) == RouteMode::Commute);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::AllDepartures) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::SevenDayWeather) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::TwelveHourWeather) == RouteMode::AllDepartures);
}

void test_route_id_for_screen() {
  TEST_ASSERT_EQUAL_STRING("WFJ-EUS", routeIdForScreen(Screen::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::AllDepartures).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::SevenDayWeather).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::TwelveHourWeather).c_str());
}

void test_screen_title() {
  TEST_ASSERT_EQUAL_STRING("Watford to Euston", screenTitle(Screen::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING(
      "Watford Junction Departures", screenTitle(Screen::AllDepartures).c_str());
  TEST_ASSERT_TRUE(screenTitle(Screen::SevenDayWeather).size() > 0);
  TEST_ASSERT_TRUE(screenTitle(Screen::TwelveHourWeather).size() > 0);
  TEST_ASSERT_FALSE(
      screenTitle(Screen::SevenDayWeather) == screenTitle(Screen::TwelveHourWeather));
}

void test_screen_cycle_index_for_each_screen() {
  TEST_ASSERT_EQUAL(0, screenCycleIndexFor(Screen::Commute));
  TEST_ASSERT_EQUAL(1, screenCycleIndexFor(Screen::SevenDayWeather));
  TEST_ASSERT_EQUAL(2, screenCycleIndexFor(Screen::TwelveHourWeather));
  TEST_ASSERT_EQUAL(3, screenCycleIndexFor(Screen::AllDepartures));
}

void test_screen_for_cycle_index_round_trips() {
  for (int i = 0; i < kScreenCycleLength; i++) {
    TEST_ASSERT_EQUAL(i, screenCycleIndexFor(screenForCycleIndex(i)));
  }
}

void test_non_override_wake_resets_to_time_based_default_position() {
  TEST_ASSERT_EQUAL(0, nextScreenCycleIndex(2, false, Screen::Commute));
  TEST_ASSERT_EQUAL(1, nextScreenCycleIndex(3, false, Screen::SevenDayWeather));
}

void test_override_button_advances_one_step_from_current_position() {
  int index = nextScreenCycleIndex(0, false, Screen::Commute);  // start at Commute (0)
  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::SevenDayWeather);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::TwelveHourWeather);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::AllDepartures);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::Commute);
}

void test_four_consecutive_presses_return_to_the_starting_screen() {
  // Starting from the off-peak default (SevenDayWeather), 4 presses should
  // visit all 4 screens exactly once and land back on SevenDayWeather.
  int index = nextScreenCycleIndex(0, false, Screen::SevenDayWeather);
  Screen start = screenForCycleIndex(index);
  TEST_ASSERT_TRUE(start == Screen::SevenDayWeather);

  for (int i = 0; i < 3; i++) {
    index = nextScreenCycleIndex(index, true, Screen::SevenDayWeather);
    TEST_ASSERT_FALSE(screenForCycleIndex(index) == start);
  }
  index = nextScreenCycleIndex(index, true, Screen::SevenDayWeather);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == start);
}

void test_non_override_wake_between_presses_realigns_to_current_default() {
  int index = nextScreenCycleIndex(0, false, Screen::Commute);
  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::SevenDayWeather);

  // An unpressed wake always realigns to whatever the clock says now,
  // even if that differs from where the press sequence started.
  index = nextScreenCycleIndex(index, false, Screen::AllDepartures);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::AllDepartures);
}

void test_sleep_minutes_two_during_commute_window() {
  TEST_ASSERT_EQUAL(2, sleepMinutesForHour(6));
  TEST_ASSERT_EQUAL(2, sleepMinutesForHour(7));
  TEST_ASSERT_EQUAL(2, sleepMinutesForHour(8));
}

void test_sleep_minutes_fifteen_outside_commute_window() {
  TEST_ASSERT_EQUAL(15, sleepMinutesForHour(9));
  TEST_ASSERT_EQUAL(15, sleepMinutesForHour(5));
  TEST_ASSERT_EQUAL(15, sleepMinutesForHour(0));
  TEST_ASSERT_EQUAL(15, sleepMinutesForHour(23));
}

void test_full_refresh_forced_by_button_press() {
  TEST_ASSERT_TRUE(shouldDoFullRefresh(true, true, 0, 15));
  TEST_ASSERT_TRUE(shouldDoFullRefresh(true, false, 0, 15));
}

void test_full_refresh_forced_when_time_unknown() {
  TEST_ASSERT_TRUE(shouldDoFullRefresh(false, false, 0, 15));
}

void test_clock_only_tick_below_the_interval() {
  TEST_ASSERT_FALSE(shouldDoFullRefresh(false, true, 1, 15));
  TEST_ASSERT_FALSE(shouldDoFullRefresh(false, true, 14, 15));
}

void test_full_refresh_once_interval_elapsed() {
  TEST_ASSERT_TRUE(shouldDoFullRefresh(false, true, 15, 15));
  TEST_ASSERT_TRUE(shouldDoFullRefresh(false, true, 20, 15));
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_commute_mode_from_six_to_before_nine);
  RUN_TEST(test_all_departures_mode_outside_commute_window);
  RUN_TEST(test_route_id_for_mode);
  RUN_TEST(test_route_title_for_mode);
  RUN_TEST(test_time_based_default_screen);
  RUN_TEST(test_route_mode_for_screen);
  RUN_TEST(test_route_id_for_screen);
  RUN_TEST(test_screen_title);
  RUN_TEST(test_screen_cycle_index_for_each_screen);
  RUN_TEST(test_screen_for_cycle_index_round_trips);
  RUN_TEST(test_non_override_wake_resets_to_time_based_default_position);
  RUN_TEST(test_override_button_advances_one_step_from_current_position);
  RUN_TEST(test_four_consecutive_presses_return_to_the_starting_screen);
  RUN_TEST(test_non_override_wake_between_presses_realigns_to_current_default);
  RUN_TEST(test_sleep_minutes_two_during_commute_window);
  RUN_TEST(test_sleep_minutes_fifteen_outside_commute_window);
  RUN_TEST(test_full_refresh_forced_by_button_press);
  RUN_TEST(test_full_refresh_forced_when_time_unknown);
  RUN_TEST(test_clock_only_tick_below_the_interval);
  RUN_TEST(test_full_refresh_once_interval_elapsed);
  return UNITY_END();
}
