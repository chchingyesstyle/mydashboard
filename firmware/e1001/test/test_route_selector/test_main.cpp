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
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(9) == Screen::Forecast);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(0) == Screen::Forecast);
  TEST_ASSERT_TRUE(timeBasedDefaultScreen(23) == Screen::Forecast);
}

void test_route_mode_for_screen() {
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::Commute) == RouteMode::Commute);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::AllDepartures) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::Forecast) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::HongKongNews) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(routeModeForScreen(Screen::UkNews) == RouteMode::AllDepartures);
}

void test_route_id_for_screen() {
  TEST_ASSERT_EQUAL_STRING("WFJ-EUS", routeIdForScreen(Screen::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::AllDepartures).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::Forecast).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::HongKongNews).c_str());
  TEST_ASSERT_EQUAL_STRING("WFJ-ALL", routeIdForScreen(Screen::UkNews).c_str());
}

void test_screen_title() {
  TEST_ASSERT_EQUAL_STRING("Watford to Euston", screenTitle(Screen::Commute).c_str());
  TEST_ASSERT_EQUAL_STRING(
      "Watford Junction Departures", screenTitle(Screen::AllDepartures).c_str());
  TEST_ASSERT_EQUAL_STRING("Forecast", screenTitle(Screen::Forecast).c_str());
  TEST_ASSERT_EQUAL_STRING("Hong Kong News", screenTitle(Screen::HongKongNews).c_str());
  TEST_ASSERT_EQUAL_STRING("UK News", screenTitle(Screen::UkNews).c_str());
}

void test_screen_cycle_index_for_each_screen() {
  TEST_ASSERT_EQUAL(0, screenCycleIndexFor(Screen::Commute));
  TEST_ASSERT_EQUAL(1, screenCycleIndexFor(Screen::Forecast));
  TEST_ASSERT_EQUAL(2, screenCycleIndexFor(Screen::HongKongNews));
  TEST_ASSERT_EQUAL(3, screenCycleIndexFor(Screen::UkNews));
  TEST_ASSERT_EQUAL(4, screenCycleIndexFor(Screen::AllDepartures));
}

void test_screen_for_cycle_index_round_trips() {
  for (int i = 0; i < kScreenCycleLength; i++) {
    TEST_ASSERT_EQUAL(i, screenCycleIndexFor(screenForCycleIndex(i)));
  }
}

void test_non_override_wake_resets_to_time_based_default_position() {
  TEST_ASSERT_EQUAL(0, nextScreenCycleIndex(2, false, Screen::Commute));
  TEST_ASSERT_EQUAL(1, nextScreenCycleIndex(3, false, Screen::Forecast));
}

void test_override_button_advances_one_step_from_current_position() {
  int index = nextScreenCycleIndex(0, false, Screen::Commute);  // start at Commute (0)
  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::Forecast);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::HongKongNews);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::UkNews);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::AllDepartures);

  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::Commute);
}

void test_five_consecutive_presses_return_to_the_starting_screen() {
  // Starting from the off-peak default (Forecast), 5 presses should visit all
  // 5 screens exactly once and land back on Forecast.
  int index = nextScreenCycleIndex(0, false, Screen::Forecast);
  Screen start = screenForCycleIndex(index);
  TEST_ASSERT_TRUE(start == Screen::Forecast);

  for (int i = 0; i < 4; i++) {
    index = nextScreenCycleIndex(index, true, Screen::Forecast);
    TEST_ASSERT_FALSE(screenForCycleIndex(index) == start);
  }
  index = nextScreenCycleIndex(index, true, Screen::Forecast);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == start);
}

void test_non_override_wake_between_presses_realigns_to_current_default() {
  int index = nextScreenCycleIndex(0, false, Screen::Commute);
  index = nextScreenCycleIndex(index, true, Screen::Commute);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::Forecast);

  // An unpressed wake always realigns to whatever the clock says now,
  // even if that differs from where the press sequence started.
  index = nextScreenCycleIndex(index, false, Screen::AllDepartures);
  TEST_ASSERT_TRUE(screenForCycleIndex(index) == Screen::AllDepartures);
}

void test_screen_change_forces_body_fetch() {
  TEST_ASSERT_EQUAL_STRING(
      "", requestEtagForScreen("\"etag-123\"", 2, 1).c_str());
}

void test_same_rendered_screen_reuses_etag() {
  TEST_ASSERT_EQUAL_STRING(
      "\"etag-123\"", requestEtagForScreen("\"etag-123\"", 1, 1).c_str());
}

void test_first_render_forces_body_fetch() {
  TEST_ASSERT_EQUAL_STRING(
      "", requestEtagForScreen("\"etag-123\"", 1, -1).c_str());
}

void test_successful_render_commits_requested_screen() {
  TEST_ASSERT_EQUAL(2, screenCycleIndexAfterRender(1, 2, true));
}

void test_failed_render_keeps_displayed_screen() {
  TEST_ASSERT_EQUAL(1, screenCycleIndexAfterRender(1, 2, false));
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
  RUN_TEST(test_five_consecutive_presses_return_to_the_starting_screen);
  RUN_TEST(test_non_override_wake_between_presses_realigns_to_current_default);
  RUN_TEST(test_screen_change_forces_body_fetch);
  RUN_TEST(test_same_rendered_screen_reuses_etag);
  RUN_TEST(test_first_render_forces_body_fetch);
  RUN_TEST(test_successful_render_commits_requested_screen);
  RUN_TEST(test_failed_render_keeps_displayed_screen);
  RUN_TEST(test_sleep_minutes_two_during_commute_window);
  RUN_TEST(test_sleep_minutes_fifteen_outside_commute_window);
  return UNITY_END();
}
