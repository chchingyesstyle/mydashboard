#pragma once

#include <string>

enum class RouteMode { Commute, AllDepartures };

// Commute mode (Watford Junction -> Euston) applies 6am-9am local time;
// every other hour shows all Watford Junction departures.
RouteMode routeModeForHour(int hourOfDay);

std::string routeIdForMode(RouteMode mode);
std::string routeTitleForMode(RouteMode mode);

// Whether the manual override toggle should be active for this wake, given
// whether it was active going into this wake and whether the override
// (left) button caused this wake. Pressing the override button flips it;
// any other wake (timer or the plain refresh button) always resets it off,
// so only pressing the button again keeps alternating the display.
bool nextOverrideActive(bool currentlyActive, bool overrideButtonPressed);

// Resolves the mode to display given the time-based default and whether
// the manual override toggle is currently active.
RouteMode modeForOverride(RouteMode timeBasedMode, bool overrideActive);
