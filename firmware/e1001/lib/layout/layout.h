#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"
#include "route_selector.h"

constexpr int kMaxRows = 8;

enum class RowEmphasis { Normal, Delayed, Cancelled };

enum class WeatherIconKind {
  Sun,
  PartlyCloudy,
  Cloud,
  Fog,
  Rain,
  Snow,
  Thunderstorm
};

struct DepartureRow {
  std::string time;
  std::string statusText;
  std::string platformText;
  std::string operatorText;
  bool hasCoachText;
  std::string coachText;
  RowEmphasis emphasis;
  bool hasReason;
  std::string reasonText;
  bool hasDestination;
  std::string destinationText;
};

struct ElectricityRow {
  std::string time;
  std::string priceText;
  bool belowAverage;
};

struct DailyForecastRow {
  std::string dateText;
  WeatherIconKind icon;
  bool hasRainChance;
  std::string rainChanceText;
  std::string tempRangeText;
};

struct HourlyForecastRow {
  std::string timeText;
  WeatherIconKind icon;
  bool hasRainChance;
  std::string rainChanceText;
  std::string tempText;
};

struct LayoutResult {
  Screen screen;
  std::string routeTitle;
  std::string statusBannerText;
  bool hasWeatherText;
  std::string weatherText;
  bool hasWeatherIcon;
  WeatherIconKind weatherIconKind;
  std::vector<std::string> weatherDetailLines;
  std::vector<DepartureRow> rows;
  std::vector<DailyForecastRow> dailyRows;
  std::vector<HourlyForecastRow> hourlyRows;
  std::vector<ElectricityRow> electricityRows;
  int batteryPercent;
  std::string lastRefreshText;
};

// Populates the right-hand weather/electricity column identically for every
// screen. The left-hand column comes from exactly one of rows (Commute /
// AllDepartures), dailyRows (SevenDayWeather), or hourlyRows
// (TwelveHourWeather), matching layout.screen.
LayoutResult computeLayout(const DashboardModel& model, int maxRows, int batteryPercent = -1,
                           const std::string& lastRefreshText = "",
                           Screen screen = Screen::Commute);

int batteryPercentFromVoltage(double voltage);

WeatherIconKind weatherIconKindFor(bool hasWeatherCode, int weatherCode);

// Day of week (0=Sunday..6=Saturday) for a Gregorian calendar date, via
// Sakamoto's algorithm.
int weekdayIndexFor(int year, int month, int day);
