#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"

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
};

struct ElectricityRow {
  std::string time;
  std::string priceText;
  bool belowAverage;
};

struct LayoutResult {
  std::string statusBannerText;
  bool hasWeatherText;
  std::string weatherText;
  bool hasWeatherIcon;
  WeatherIconKind weatherIconKind;
  std::vector<std::string> weatherDetailLines;
  std::vector<DepartureRow> rows;
  std::vector<ElectricityRow> electricityRows;
  int batteryPercent;
  std::string lastRefreshText;
};

LayoutResult computeLayout(const DashboardModel& model, int maxRows, int batteryPercent = -1,
                           const std::string& lastRefreshText = "");

int batteryPercentFromVoltage(double voltage);

WeatherIconKind weatherIconKindFor(bool hasWeatherCode, int weatherCode);
