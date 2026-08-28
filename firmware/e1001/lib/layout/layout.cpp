#include "layout.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <ctime>

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

constexpr const char* kWeekdayNames[7] = {
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
bool parseIsoDate(const std::string& date, int& year, int& month, int& day) {
  if (date.size() < 10) return false;
  year = std::atoi(date.substr(0, 4).c_str());
  month = std::atoi(date.substr(5, 2).c_str());
  day = std::atoi(date.substr(8, 2).c_str());
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

std::string formatDailyDateText(const std::string& date) {
  int year, month, day;
  if (!parseIsoDate(date, year, month, day)) return date;
  int weekday = weekdayIndexFor(year, month, day);
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%s %d", kWeekdayNames[weekday], day);
  return std::string(buffer);
}

bool shouldShowRainChance(WeatherIconKind icon) {
  return icon == WeatherIconKind::Rain || icon == WeatherIconKind::Snow ||
         icon == WeatherIconKind::Thunderstorm;
}

std::string formatRoundedWhole(double value) {
  return formatWholeNumber(std::round(value));
}

std::string formatPercent(double value) {
  return formatWholeNumber(std::round(value)) + "%";
}

void appendWeatherDetailLines(const WeatherPanel& weather, std::vector<std::string>& lines) {
  lines.push_back(weather.hasApparentTemperatureC
                      ? "Feels like " + formatOneDecimal(weather.apparentTemperatureC) + "C"
                      : "");
  lines.push_back(weather.hasRelativeHumidityPercent
                      ? "Humidity " + formatWholeNumber(weather.relativeHumidityPercent) + "%"
                      : "");
  lines.push_back(weather.hasPrecipitationMm
                      ? "Precip " + formatOneDecimal(weather.precipitationMm) + "mm"
                      : "");
  lines.push_back(weather.hasRainChanceNext6HoursPercent
                      ? "Rain (6h) " + formatWholeNumber(weather.rainChanceNext6HoursPercent) + "%"
                      : "");
  lines.push_back(weather.hasPressureMslHpa
                      ? "Pressure " + formatTwoDecimals(weather.pressureMslHpa) + "hPa"
                      : "");
  lines.push_back(weather.hasTemperatureMinTodayC && weather.hasTemperatureMaxTodayC
                      ? "Today " + formatOneDecimal(weather.temperatureMinTodayC) + "C / " +
                            formatOneDecimal(weather.temperatureMaxTodayC) + "C"
                      : "");
}

std::string weatherWarningTextFor(const WeatherPanel& weather) {
  if (!weather.hasWarning) return "";
  std::string text = weather.warningEvent;
  const size_t kMaxLineLength = 45;
  if (text.size() > kMaxLineLength) {
    text = text.substr(0, kMaxLineLength - 3) + "...";
  }
  return text;
}

bool isLeapYear(int year) {
  return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
}

int daysInMonth(int year, int month) {
  static const int days[] = {31, 28, 31, 30, 31, 30,
                             31, 31, 30, 31, 30, 31};
  if (month == 2 && isLeapYear(year)) return 29;
  return days[month - 1];
}

bool parseIsoEpoch(const std::string& timestamp, time_t& epoch) {
  if (timestamp.size() < 19 || timestamp[4] != '-' || timestamp[7] != '-' ||
      timestamp[10] != 'T' || timestamp[13] != ':' || timestamp[16] != ':') {
    return false;
  }
  int year = std::atoi(timestamp.substr(0, 4).c_str());
  int month = std::atoi(timestamp.substr(5, 2).c_str());
  int day = std::atoi(timestamp.substr(8, 2).c_str());
  int hour = std::atoi(timestamp.substr(11, 2).c_str());
  int minute = std::atoi(timestamp.substr(14, 2).c_str());
  int second = std::atoi(timestamp.substr(17, 2).c_str());
  if (year < 1970 || month < 1 || month > 12 || day < 1 ||
      day > daysInMonth(year, month) || hour > 23 || minute > 59 ||
      second > 59) {
    return false;
  }

  int offsetMinutes = 0;
  if (timestamp.size() > 19 && timestamp[19] != 'Z') {
    if ((timestamp[19] != '+' && timestamp[19] != '-') || timestamp.size() < 25 ||
        timestamp[22] != ':') {
      return false;
    }
    int offsetHours = std::atoi(timestamp.substr(20, 2).c_str());
    int offsetPartMinutes = std::atoi(timestamp.substr(23, 2).c_str());
    if (offsetHours > 23 || offsetPartMinutes > 59) return false;
    offsetMinutes = offsetHours * 60 + offsetPartMinutes;
    if (timestamp[19] == '-') offsetMinutes = -offsetMinutes;
  }

  int64_t days = 0;
  for (int currentYear = 1970; currentYear < year; currentYear++) {
    days += isLeapYear(currentYear) ? 366 : 365;
  }
  for (int currentMonth = 1; currentMonth < month; currentMonth++) {
    days += daysInMonth(year, currentMonth);
  }
  days += day - 1;
  epoch = static_cast<time_t>(days * 86400 + hour * 3600 + minute * 60 +
                              second - offsetMinutes * 60);
  return true;
}

bool gmtTime(time_t epoch, struct tm& output) {
#if defined(_WIN32)
  return gmtime_s(&output, &epoch) == 0;
#else
  return gmtime_r(&epoch, &output) != nullptr;
#endif
}

bool isBritishSummerTime(time_t utcEpoch) {
  struct tm utc{};
  if (!gmtTime(utcEpoch, utc)) return false;
  if (utc.tm_mon < 2 || utc.tm_mon > 9) return false;
  if (utc.tm_mon > 2 && utc.tm_mon < 9) return true;
  int lastSunday = 31 - weekdayIndexFor(utc.tm_year + 1900, utc.tm_mon + 1, 31);
  if (utc.tm_mon == 2) {
    return utc.tm_mday > lastSunday ||
           (utc.tm_mday == lastSunday && utc.tm_hour >= 1);
  }
  return utc.tm_mday < lastSunday ||
         (utc.tm_mday == lastSunday && utc.tm_hour < 1);
}

std::string formatNewsTime(const std::string& timestamp) {
  time_t epoch;
  if (!parseIsoEpoch(timestamp, epoch)) return "";
  if (isBritishSummerTime(epoch)) epoch += 3600;
  struct tm london{};
  if (!gmtTime(epoch, london)) return "";
  char buffer[6];
  snprintf(buffer, sizeof(buffer), "%02d:%02d", london.tm_hour, london.tm_min);
  return std::string(buffer);
}

void appendNewsRows(const NewsPanel& panel, bool hongKong, LayoutResult& layout) {
  layout.newsSourceText = panel.source;
  layout.newsTopHeading = hongKong ? "熱門" : "Top Stories";
  layout.newsLatestHeading = hongKong ? "最新消息" : "Latest";
  layout.newsStale = panel.status == PanelStatus::Stale || panel.stale;
  layout.newsUnavailable = panel.status == PanelStatus::Unavailable;
  layout.newsUnavailableText = hongKong
      ? "Hong Kong news unavailable"
      : "UK news unavailable";

  if (panel.hasUpdatedAt) {
    const std::string localTime = formatNewsTime(panel.updatedAt);
    layout.newsUpdateText = layout.newsStale ? "Stale" : "Updated";
    if (!localTime.empty()) layout.newsUpdateText += " " + localTime;
  } else {
    layout.newsUpdateText = layout.newsUnavailable ? "Unavailable" : "";
  }

  const size_t topCount = panel.topStories.size() < 3 ? panel.topStories.size() : 3;
  for (size_t i = 0; i < topCount; i++) {
    const NewsStory& story = panel.topStories[i];
    layout.newsTopRows.push_back(NewsStoryRow{story.title, formatNewsTime(story.publishedAt)});
  }
  const size_t latestCount = panel.latestStories.size() < 6 ? panel.latestStories.size() : 6;
  for (size_t i = 0; i < latestCount; i++) {
    const NewsStory& story = panel.latestStories[i];
    layout.newsLatestRows.push_back(NewsStoryRow{story.title, formatNewsTime(story.publishedAt)});
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

int hourlyForecastHeaderBaseline(int headerHeight) {
  return headerHeight + 18;
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
                           const std::string& lastRefreshText, Screen screen) {
  LayoutResult layout{};
  layout.screen = screen;
  layout.routeTitle = screenTitle(screen);
  layout.batteryPercent = batteryPercent;
  layout.lastRefreshText = lastRefreshText;
  layout.statusBannerText = bannerTextFor(model.status);

  if (model.weather.hasTemperatureC && model.weather.hasCondition) {
    layout.hasWeatherText = true;
    layout.weatherText = formatOneDecimal(model.weather.temperatureC) + "C";
    layout.weatherConditionText = "Now: " + model.weather.condition;
    layout.hasWeatherIcon = true;
    layout.weatherIconKind =
        weatherIconKindFor(model.weather.hasWeatherCode, model.weather.weatherCode);
  } else {
    layout.hasWeatherText = false;
    layout.hasWeatherIcon = false;
    layout.weatherIconKind = WeatherIconKind::Cloud;
  }
  appendWeatherDetailLines(model.weather, layout.weatherDetailLines);
  layout.hasWeatherWarning = model.weather.hasWarning;
  layout.weatherWarningText = weatherWarningTextFor(model.weather);

  if (screen == Screen::Commute || screen == Screen::AllDepartures) {
    int rowCount = static_cast<int>(model.departures.services.size());
    int rowsToRender = rowCount < maxRows ? rowCount : maxRows;

    for (int i = 0; i < rowsToRender; i++) {
      const ParsedDeparture& departure = model.departures.services[i];
      DepartureRow row;
      row.time = extractTimeOfDay(departure.scheduledDeparture);
      row.statusText = departure.expectedDisplay;
      row.platformText = departure.hasPlatform ? ("Platform " + departure.platform) : "Platform TBC";
      if (screen == Screen::AllDepartures) {
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
      if (row.emphasis == RowEmphasis::Delayed) {
        row.statusText = "Expected " + row.statusText;
      }
      row.hasReason = departure.hasReason;
      if (row.hasReason) {
        row.reasonText = departure.reason;
      }
      layout.rows.push_back(row);
    }
  } else if (screen == Screen::SevenDayWeather) {
    for (const auto& day : model.weather.dailyForecast) {
      DailyForecastRow row;
      row.dateText = formatDailyDateText(day.date);
      row.icon = weatherIconKindFor(true, day.weatherCode);
      row.hasRainChance = true;
      row.rainChanceText = formatPercent(day.rainChancePercent);
      row.tempRangeText = formatRoundedWhole(day.temperatureMinC) + "C / " +
                           formatRoundedWhole(day.temperatureMaxC) + "C";
      layout.dailyRows.push_back(row);
    }
  } else if (screen == Screen::TwelveHourWeather) {
    for (const auto& hour : model.weather.hourlyForecast) {
      HourlyForecastRow row;
      row.timeText = extractTimeOfDay(hour.time);
      row.icon = weatherIconKindFor(true, hour.weatherCode);
      row.hasRainChance = true;
      row.rainChanceText = formatPercent(hour.rainChancePercent);
      row.tempText = formatRoundedWhole(hour.temperatureC) + "C";
      layout.hourlyRows.push_back(row);
    }
  } else if (screen == Screen::HongKongNews) {
    appendNewsRows(model.news.hongKong, true, layout);
  } else if (screen == Screen::UkNews) {
    appendNewsRows(model.news.unitedKingdom, false, layout);
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

int weekdayIndexFor(int year, int month, int day) {
  static const int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (month < 3) year -= 1;
  return (year + year / 4 - year / 100 + year / 400 + t[month - 1] + day) % 7;
}
