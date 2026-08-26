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

void test_override_button_flips_toggle_off_or_on() {
  TEST_ASSERT_TRUE(nextOverrideActive(false, true) == true);
  TEST_ASSERT_TRUE(nextOverrideActive(true, true) == false);
}

void test_non_override_wake_always_resets_toggle_off() {
  TEST_ASSERT_TRUE(nextOverrideActive(true, false) == false);
  TEST_ASSERT_TRUE(nextOverrideActive(false, false) == false);
}

void test_mode_for_override_uses_time_based_default_when_inactive() {
  TEST_ASSERT_TRUE(modeForOverride(RouteMode::Commute, false) == RouteMode::Commute);
  TEST_ASSERT_TRUE(
      modeForOverride(RouteMode::AllDepartures, false) == RouteMode::AllDepartures);
}

void test_mode_for_override_flips_time_based_default_when_active() {
  TEST_ASSERT_TRUE(modeForOverride(RouteMode::Commute, true) == RouteMode::AllDepartures);
  TEST_ASSERT_TRUE(modeForOverride(RouteMode::AllDepartures, true) == RouteMode::Commute);
}

void test_repeated_presses_alternate_between_both_views() {
  bool active = false;
  RouteMode timeBasedMode = RouteMode::Commute;

  active = nextOverrideActive(active, true);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::AllDepartures);

  active = nextOverrideActive(active, true);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::Commute);

  active = nextOverrideActive(active, true);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::AllDepartures);
}

void test_non_override_wake_between_presses_resets_the_alternation() {
  bool active = false;
  RouteMode timeBasedMode = RouteMode::Commute;

  active = nextOverrideActive(active, true);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::AllDepartures);

  active = nextOverrideActive(active, false);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::Commute);

  active = nextOverrideActive(active, true);
  TEST_ASSERT_TRUE(modeForOverride(timeBasedMode, active) == RouteMode::AllDepartures);
}

int main(int argc, char** argv) {
  UNITY_BEGIN();
  RUN_TEST(test_commute_mode_from_six_to_before_nine);
  RUN_TEST(test_all_departures_mode_outside_commute_window);
  RUN_TEST(test_route_id_for_mode);
  RUN_TEST(test_route_title_for_mode);
  RUN_TEST(test_override_button_flips_toggle_off_or_on);
  RUN_TEST(test_non_override_wake_always_resets_toggle_off);
  RUN_TEST(test_mode_for_override_uses_time_based_default_when_inactive);
  RUN_TEST(test_mode_for_override_flips_time_based_default_when_active);
  RUN_TEST(test_repeated_presses_alternate_between_both_views);
  RUN_TEST(test_non_override_wake_between_presses_resets_the_alternation);
  return UNITY_END();
}
