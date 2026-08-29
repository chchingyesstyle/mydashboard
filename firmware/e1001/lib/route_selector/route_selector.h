#pragma once

#include <string>

enum class RouteMode { Commute, AllDepartures };

// Which screen is currently being displayed. Every screen renders its main
// content in the left column beside the shared weather/electricity panel.
enum class Screen {
  Commute,
  AllDepartures,
  Forecast,
  HongKongNews,
  UkNews
};

// Commute mode (Watford Junction -> Euston) applies 6am-9am local time;
// every other hour shows all Watford Junction departures.
RouteMode routeModeForHour(int hourOfDay);

std::string routeIdForMode(RouteMode mode);
std::string routeTitleForMode(RouteMode mode);

// The time-based default screen: Commute from 6am-9am local time,
// otherwise Forecast.
Screen timeBasedDefaultScreen(int hourOfDay);

// Which API route a screen's data comes from. Commute fetches WFJ-EUS;
// every other screen fetches WFJ-ALL, since Watford Junction's weather panel
// is the same regardless of which route was requested.
RouteMode routeModeForScreen(Screen screen);
std::string routeIdForScreen(Screen screen);
std::string screenTitle(Screen screen);

// All five screens, in a fixed cycle order used by the override button.
constexpr Screen kScreenCycle[] = {
    Screen::Commute, Screen::Forecast, Screen::HongKongNews,
    Screen::UkNews, Screen::AllDepartures};
constexpr int kScreenCycleLength = 5;

// The position of a screen within kScreenCycle.
int screenCycleIndexFor(Screen screen);
Screen screenForCycleIndex(int index);

// The screen-cycle index to use for this wake. Pressing the override
// button advances one step around the fixed 5-item cycle from wherever it
// last was; any other wake (timer or the plain refresh button) resets to
// the time-based default's position in the cycle. Five consecutive override
// presses (with no intervening non-override wake) always land back on the
// screen you started from, since it's a plain round-robin.
int nextScreenCycleIndex(int currentIndex, bool overrideButtonPressed,
                          Screen timeBasedDefault);

// A changed screen needs a response body even when API data is unchanged,
// because a 304 response cannot be rendered into the newly selected layout.
std::string requestEtagForScreen(const std::string& storedEtag,
                                 int requestedScreenCycleIndex,
                                 int renderedScreenCycleIndex);

// Only a successful redraw commits the requested cycle position. A failed
// request or parse keeps button navigation aligned with the visible screen.
int screenCycleIndexAfterRender(int currentIndex, int requestedIndex,
                                bool renderSucceeded);

// The deep-sleep wake interval, in minutes, for the device's timer wake
// source: 2 minutes during the 6am-9am commute window (fresher departure
// data when it matters most), 15 minutes otherwise (battery saving).
int sleepMinutesForHour(int hourOfDay);
