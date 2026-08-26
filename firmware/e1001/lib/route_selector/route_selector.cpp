#include "route_selector.h"

RouteMode routeModeForHour(int hourOfDay) {
  if (hourOfDay >= 6 && hourOfDay < 9) return RouteMode::Commute;
  return RouteMode::AllDepartures;
}

std::string routeIdForMode(RouteMode mode) {
  switch (mode) {
    case RouteMode::Commute: return "WFJ-EUS";
    case RouteMode::AllDepartures: return "WFJ-ALL";
  }
  return "WFJ-EUS";
}

std::string routeTitleForMode(RouteMode mode) {
  switch (mode) {
    case RouteMode::Commute: return "Watford to Euston";
    case RouteMode::AllDepartures: return "Watford Junction Departures";
  }
  return "Watford to Euston";
}

bool nextOverrideActive(bool currentlyActive, bool overrideButtonPressed) {
  if (!overrideButtonPressed) return false;
  return !currentlyActive;
}

RouteMode modeForOverride(RouteMode timeBasedMode, bool overrideActive) {
  if (!overrideActive) return timeBasedMode;
  return timeBasedMode == RouteMode::Commute ? RouteMode::AllDepartures : RouteMode::Commute;
}
