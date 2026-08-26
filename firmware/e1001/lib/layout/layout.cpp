#include "layout.h"

#include <cmath>
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

std::string formatOneDecimal(double value) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.1f", value);
  return std::string(buffer);
}

std::string formatTwoDecimals(double value) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.2f", value);
  return std::string(buffer);
}

std::string formatPrice(double pricePencePerKwh) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.2fp", pricePencePerKwh);
  return std::string(buffer);
}

void appendWeatherDetailLines(const WeatherPanel& weather, std::vector<std::string>& lines) {
  if (weather.hasApparentTemperatureC) {
    lines.push_back("Feels like " + formatOneDecimal(weather.apparentTemperatureC) + "C");
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
    lines.push_back("Pressure " + formatTwoDecimals(weather.pressureMslHpa) + "hPa");
  }
  if (weather.hasTemperatureMinTodayC && weather.hasTemperatureMaxTodayC) {
    lines.push_back("Min " + formatOneDecimal(weather.temperatureMinTodayC) + "C / Max " +
                     formatOneDecimal(weather.temperatureMaxTodayC) + "C");
  }
}

}  // namespace

WeatherIconKind weatherIconKindFor(bool hasWeatherCode, int weatherCode) {
  if (hasWeatherCode) {
    if (weatherCode == 0 || weatherCode == 1) return WeatherIconKind::Sun;
    if (weatherCode == 2) return WeatherIconKind::PartlyCloudy;
    if (weatherCode == 3) return WeatherIconKind::Cloud;
    if (weatherCode == 45 || weatherCode == 48) return WeatherIconKind::Fog;
    if ((weatherCode >= 51 && weatherCode <= 67) ||
        (weatherCode >= 80 && weatherCode <= 82)) {
      return WeatherIconKind::Rain;
    }
    if ((weatherCode >= 71 && weatherCode <= 77) ||
        (weatherCode >= 85 && weatherCode <= 86)) {
      return WeatherIconKind::Snow;
    }
    if (weatherCode >= 95 && weatherCode <= 99) return WeatherIconKind::Thunderstorm;
  }
  return WeatherIconKind::Cloud;
}

int batteryPercentFromVoltage(double voltage) {
  struct Point { double voltage; int percent; };
  static const Point kCurve[] = {
    {3.27, 0}, {3.30, 5}, {3.41, 10}, {3.49, 20}, {3.58, 30},
    {3.68, 40}, {3.75, 50}, {3.80, 60}, {3.85, 70}, {3.91, 80},
    {3.96, 90}, {4.15, 100}
  };
  const int count = sizeof(kCurve) / sizeof(kCurve[0]);

  if (voltage <= kCurve[0].voltage) return kCurve[0].percent;
  if (voltage >= kCurve[count - 1].voltage) return kCurve[count - 1].percent;

  for (int i = 0; i < count - 1; i++) {
    if (voltage >= kCurve[i].voltage && voltage <= kCurve[i + 1].voltage) {
      double ratio = (voltage - kCurve[i].voltage) / (kCurve[i + 1].voltage - kCurve[i].voltage);
      return static_cast<int>(std::round(kCurve[i].percent + ratio * (kCurve[i + 1].percent - kCurve[i].percent)));
    }
  }
  return 0;
}

LayoutResult computeLayout(const DashboardModel& model, int maxRows, int batteryPercent,
                           const std::string& lastRefreshText, RouteMode mode) {
  LayoutResult layout;
  layout.routeTitle = routeTitleForMode(mode);
  layout.batteryPercent = batteryPercent;
  layout.lastRefreshText = lastRefreshText;
  layout.statusBannerText = bannerTextFor(model.status);

  if (model.weather.hasTemperatureC && model.weather.hasCondition) {
    layout.hasWeatherText = true;
    layout.weatherText = formatOneDecimal(model.weather.temperatureC) + "C";
    layout.hasWeatherIcon = true;
    layout.weatherIconKind =
        weatherIconKindFor(model.weather.hasWeatherCode, model.weather.weatherCode);
  } else {
    layout.hasWeatherText = false;
    layout.hasWeatherIcon = false;
    layout.weatherIconKind = WeatherIconKind::Cloud;
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
    if (mode == RouteMode::AllDepartures) {
      row.operatorText = departure.operatorCode;
      row.hasDestination = departure.hasFinalDestination;
      row.destinationText = departure.finalDestinationName;
    } else {
      row.operatorText = departure.operatorName;
      row.hasDestination = false;
    }
    row.hasCoachText = departure.hasCoachCount;
    if (row.hasCoachText) {
      row.coachText = std::to_string(departure.coachCount) + " coaches";
    }
    row.emphasis = emphasisFor(departure);
    row.hasReason = departure.hasReason;
    if (row.hasReason) {
      row.reasonText = departure.reason;
    }
    layout.rows.push_back(row);
  }

  int electricityCount = static_cast<int>(model.electricity.prices.size());
  int electricityRowsToRender = electricityCount < 16 ? electricityCount : 16;
  for (int i = 0; i < electricityRowsToRender; i++) {
    const ElectricityPriceSlot& slot = model.electricity.prices[i];
    ElectricityRow row;
    row.time = extractTimeOfDay(slot.validFrom);
    row.priceText = formatPrice(slot.pricePencePerKwh);
    row.belowAverage = model.electricity.hasTodayAveragePencePerKwh &&
                        slot.pricePencePerKwh < model.electricity.todayAveragePencePerKwh;
    layout.electricityRows.push_back(row);
  }

  return layout;
}
