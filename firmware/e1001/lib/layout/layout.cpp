#include "layout.h"

namespace {

RowEmphasis emphasisFor(const ParsedDeparture& departure) {
  if (departure.isCancelled) return RowEmphasis::Cancelled;
  if (departure.expectedDisplay != "On time") return RowEmphasis::Delayed;
  return RowEmphasis::Normal;
}

std::string extractTimeOfDay(const std::string& isoTimestamp) {
  if (isoTimestamp.size() < 16) return isoTimestamp;
  return isoTimestamp.substr(11, 5);
}

}  // namespace

LayoutResult computeLayout(const DashboardModel& model, int maxRows) {
  LayoutResult layout;
  layout.hasWeatherText = false;

  int rowCount = static_cast<int>(model.departures.services.size());
  int rowsToRender = rowCount < maxRows ? rowCount : maxRows;

  for (int i = 0; i < rowsToRender; i++) {
    const ParsedDeparture& departure = model.departures.services[i];
    DepartureRow row;
    row.time = extractTimeOfDay(departure.scheduledDeparture);
    row.statusText = departure.expectedDisplay;
    row.platformText = departure.hasPlatform ? ("Platform " + departure.platform) : "Platform TBC";
    row.operatorText = departure.operatorName;
    row.hasCoachText = departure.hasCoachCount;
    if (row.hasCoachText) {
      row.coachText = std::to_string(departure.coachCount) + " coaches";
    }
    row.emphasis = emphasisFor(departure);
    layout.rows.push_back(row);
  }

  return layout;
}
