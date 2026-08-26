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

void test_override_flips_commute_to_all_departures() {
  TEST_ASSERT_TRUE(
      effectiveRouteMode(RouteMode::Commute, true) == RouteMode::AllDepartures);
}

void test_override_flips_all_departures_to_commute() {
  TEST_ASSERT_TRUE(
      effectiveRouteMode(RouteMode::AllDepartures, true) == RouteMode::Commute);
}

void test_no_override_keeps_time_based_mode() {
  TEST_ASSERT_TRUE(
      effectiveRouteMode(RouteMode::Commute, false) == RouteMode::Commute);
  TEST_ASSERT_TRUE(
      effectiveRouteMode(RouteMode::AllDepartures, false) == RouteMode::AllDepartures);
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_commute_mode_from_six_to_before_nine);
  RUN_TEST(test_all_departures_mode_outside_commute_window);
  RUN_TEST(test_route_id_for_mode);
  RUN_TEST(test_route_title_for_mode);
  RUN_TEST(test_override_flips_commute_to_all_departures);
  RUN_TEST(test_override_flips_all_departures_to_commute);
  RUN_TEST(test_no_override_keeps_time_based_mode);
  return UNITY_END();
}
