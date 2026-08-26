#pragma once

#include <string>

enum class RouteMode { Commute, AllDepartures };

// Commute mode (Watford Junction -> Euston) applies 6am-9am local time;
// every other hour shows all Watford Junction departures.
RouteMode routeModeForHour(int hourOfDay);

std::string routeIdForMode(RouteMode mode);
std::string routeTitleForMode(RouteMode mode);

// Returns the opposite of timeBasedMode when the override button was
// pressed to wake the device, otherwise returns timeBasedMode unchanged.
// Since the caller re-derives timeBasedMode from the clock on every wake,
// the override naturally only applies for the wake that requested it.
RouteMode effectiveRouteMode(RouteMode timeBasedMode, bool overridePressed);
