#pragma once

#include <string>

enum class RouteMode { Commute, AllDepartures };

// Which screen is currently being displayed. Commute and AllDepartures
// render the departures+weather+electricity split (as before); the two
// weather screens render a full-width forecast instead.
enum class Screen { Commute, AllDepartures, SevenDayWeather, TwelveHourWeather };

// Commute mode (Watford Junction -> Euston) applies 6am-9am local time;
// every other hour shows all Watford Junction departures.
RouteMode routeModeForHour(int hourOfDay);

std::string routeIdForMode(RouteMode mode);
std::string routeTitleForMode(RouteMode mode);

// The time-based default screen: Commute from 6am-9am local time,
// otherwise SevenDayWeather.
Screen timeBasedDefaultScreen(int hourOfDay);

// Which API route a screen's data comes from. Commute fetches WFJ-EUS;
// every other screen (AllDepartures and both weather screens) fetches
// WFJ-ALL, since Watford Junction's weather panel is the same regardless
// of which route was requested.
RouteMode routeModeForScreen(Screen screen);
std::string routeIdForScreen(Screen screen);
std::string screenTitle(Screen screen);

// All four screens, in a fixed cycle order used by the override button.
constexpr Screen kScreenCycle[] = {
    Screen::Commute, Screen::SevenDayWeather, Screen::TwelveHourWeather,
    Screen::AllDepartures};
constexpr int kScreenCycleLength = 4;

// The position of a screen within kScreenCycle.
int screenCycleIndexFor(Screen screen);
Screen screenForCycleIndex(int index);

// The screen-cycle index to use for this wake. Pressing the override
// button advances one step around the fixed 4-item cycle from wherever it
// last was; any other wake (timer or the plain refresh button) resets to
// the time-based default's position in the cycle. Four consecutive
// override presses (with no intervening non-override wake) always land
// back on the screen you started from, since it's a plain round-robin.
int nextScreenCycleIndex(int currentIndex, bool overrideButtonPressed,
                          Screen timeBasedDefault);

// The deep-sleep wake interval, in minutes, for the device's timer wake
// source: 2 minutes during the 6am-9am commute window (fresher departure
// data when it matters most), 15 minutes otherwise (battery saving).
int sleepMinutesForHour(int hourOfDay);
