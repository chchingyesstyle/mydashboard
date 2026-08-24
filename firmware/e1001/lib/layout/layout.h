#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"

constexpr int kMaxRows = 8;

enum class RowEmphasis { Normal, Delayed, Cancelled };

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
  std::vector<std::string> weatherDetailLines;
  std::vector<DepartureRow> rows;
  std::vector<ElectricityRow> electricityRows;
  int batteryPercent;
};

LayoutResult computeLayout(const DashboardModel& model, int maxRows, int batteryPercent = -1);

int batteryPercentFromVoltage(double voltage);
