#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"

constexpr int kMaxRows = 6;

enum class RowEmphasis { Normal, Delayed, Cancelled };

struct DepartureRow {
  std::string time;
  std::string statusText;
  std::string platformText;
  std::string operatorText;
  bool hasCoachText;
  std::string coachText;
  RowEmphasis emphasis;
};

struct LayoutResult {
  std::string statusBannerText;
  bool hasWeatherText;
  std::string weatherText;
  std::vector<DepartureRow> rows;
};

LayoutResult computeLayout(const DashboardModel& model, int maxRows);
