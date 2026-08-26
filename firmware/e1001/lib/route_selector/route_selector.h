#pragma once

#include <string>

enum class RouteMode { Commute, AllDepartures };

// Commute mode (Watford Junction -> Euston) applies 6am-9am local time;
// every other hour shows all Watford Junction departures.
RouteMode routeModeForHour(int hourOfDay);

std::string routeIdForMode(RouteMode mode);
std::string routeTitleForMode(RouteMode mode);
