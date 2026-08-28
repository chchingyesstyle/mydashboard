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

Screen timeBasedDefaultScreen(int hourOfDay) {
  return routeModeForHour(hourOfDay) == RouteMode::Commute
             ? Screen::Commute
             : Screen::SevenDayWeather;
}

RouteMode routeModeForScreen(Screen screen) {
  switch (screen) {
    case Screen::Commute: return RouteMode::Commute;
    case Screen::AllDepartures:
    case Screen::SevenDayWeather:
    case Screen::TwelveHourWeather:
    case Screen::HongKongNews:
    case Screen::UkNews:
      return RouteMode::AllDepartures;
  }
  return RouteMode::AllDepartures;
}

std::string routeIdForScreen(Screen screen) {
  return routeIdForMode(routeModeForScreen(screen));
}

std::string screenTitle(Screen screen) {
  switch (screen) {
    case Screen::Commute: return routeTitleForMode(RouteMode::Commute);
    case Screen::AllDepartures: return routeTitleForMode(RouteMode::AllDepartures);
    case Screen::SevenDayWeather: return "7-Day Forecast";
    case Screen::TwelveHourWeather: return "Next 12 Hours";
    case Screen::HongKongNews: return "Hong Kong News";
    case Screen::UkNews: return "UK News";
  }
  return routeTitleForMode(RouteMode::Commute);
}

int screenCycleIndexFor(Screen screen) {
  for (int i = 0; i < kScreenCycleLength; i++) {
    if (kScreenCycle[i] == screen) return i;
  }
  return 0;
}

Screen screenForCycleIndex(int index) {
  return kScreenCycle[index];
}

int nextScreenCycleIndex(int currentIndex, bool overrideButtonPressed,
                          Screen timeBasedDefault) {
  if (overrideButtonPressed) {
    return (currentIndex + 1) % kScreenCycleLength;
  }
  return screenCycleIndexFor(timeBasedDefault);
}

int sleepMinutesForHour(int hourOfDay) {
  return routeModeForHour(hourOfDay) == RouteMode::Commute ? 2 : 15;
}
