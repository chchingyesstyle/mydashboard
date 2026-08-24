#include "layout.h"

#include <cstdio>

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

std::string bannerTextFor(DashboardStatus status) {
  switch (status) {
    case DashboardStatus::Live: return "Live";
    case DashboardStatus::Partial: return "Partial";
    case DashboardStatus::Unavailable: return "Unavailable";
  }
  return "";
}

std::string formatWholeNumber(double value) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%d", static_cast<int>(value));
  return std::string(buffer);
}

std::string formatPrice(double pricePencePerKwh) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.1fp", pricePencePerKwh);
  return std::string(buffer);
}

void appendWeatherDetailLines(const WeatherPanel& weather, std::vector<std::string>& lines) {
  if (weather.hasApparentTemperatureC) {
    lines.push_back("Feels like " + formatWholeNumber(weather.apparentTemperatureC) + "C");
  }
  if (weather.hasRelativeHumidityPercent) {
    lines.push_back("Humidity " + formatWholeNumber(weather.relativeHumidityPercent) + "%");
  }
  if (weather.hasPrecipitationMm) {
    lines.push_back("Precip " + formatWholeNumber(weather.precipitationMm) + "mm");
  }
  if (weather.hasRainChanceNext6HoursPercent) {
    lines.push_back("Rain (6h) " + formatWholeNumber(weather.rainChanceNext6HoursPercent) + "%");
  }
  if (weather.hasPressureMslHpa) {
    lines.push_back("Pressure " + formatWholeNumber(weather.pressureMslHpa) + "hPa");
  }
}

}  // namespace

LayoutResult computeLayout(const DashboardModel& model, int maxRows) {
  LayoutResult layout;
  layout.statusBannerText = bannerTextFor(model.status);

  if (model.weather.hasTemperatureC && model.weather.hasCondition) {
    layout.hasWeatherText = true;
    layout.weatherText = std::to_string(static_cast<int>(model.weather.temperatureC)) +
                          "C, " + model.weather.condition;
  } else {
    layout.hasWeatherText = false;
  }
  appendWeatherDetailLines(model.weather, layout.weatherDetailLines);

  int rowCount = static_cast<int>(model.departures.services.size());
  int rowsToRender = rowCount < maxRows ? rowCount : maxRows;

  for (int i = 0; i < rowsToRender; i++) {
    const ParsedDeparture& departure = model.departures.services[i];
    DepartureRow row;
    row.time = extractTimeOfDay(departure.scheduledDeparture);
    row.statusText = departure.expectedDisplay;
    row.platformText = departure.hasPlatform ? ("Platform " + departure.platform) : "Platform TBC";
    row.operatorText = departure.operatorCode;
    row.hasCoachText = departure.hasCoachCount;
    if (row.hasCoachText) {
      row.coachText = std::to_string(departure.coachCount) + "coa";
    }
    row.emphasis = emphasisFor(departure);
    layout.rows.push_back(row);
  }

  int electricityCount = static_cast<int>(model.electricity.prices.size());
  int electricityRowsToRender = electricityCount < 6 ? electricityCount : 6;
  for (int i = 0; i < electricityRowsToRender; i++) {
    const ElectricityPriceSlot& slot = model.electricity.prices[i];
    ElectricityRow row;
    row.time = extractTimeOfDay(slot.validFrom);
    row.priceText = formatPrice(slot.pricePencePerKwh);
    layout.electricityRows.push_back(row);
  }

  return layout;
}
