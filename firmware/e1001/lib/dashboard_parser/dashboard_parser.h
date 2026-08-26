#pragma once

#include <string>
#include <vector>

enum class PanelStatus { Live, Stale, Unavailable };
enum class DashboardStatus { Live, Partial, Unavailable };

struct ParsedDeparture {
  std::string scheduledDeparture;
  std::string expectedDisplay;
  bool hasPlatform;
  std::string platform;
  std::string operatorName;
  std::string operatorCode;
  bool hasCoachCount;
  int coachCount;
  bool isCancelled;
  bool hasReason;
  std::string reason;
  bool hasFinalDestination;
  std::string finalDestinationName;
};

struct DeparturesPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  std::vector<ParsedDeparture> services;
};

struct DailyForecastDay {
  std::string date;
  int weatherCode;
  double temperatureMinC;
  double temperatureMaxC;
  double rainChancePercent;
};

struct HourlyForecastEntry {
  std::string time;
  int weatherCode;
  double temperatureC;
  double rainChancePercent;
};

struct WeatherPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  bool hasTemperatureC;
  double temperatureC;
  bool hasCondition;
  std::string condition;
  bool hasWeatherCode;
  int weatherCode;
  bool hasApparentTemperatureC;
  double apparentTemperatureC;
  bool hasRelativeHumidityPercent;
  double relativeHumidityPercent;
  bool hasPrecipitationMm;
  double precipitationMm;
  bool hasRainChanceNext6HoursPercent;
  double rainChanceNext6HoursPercent;
  bool hasPressureMslHpa;
  double pressureMslHpa;
  bool hasTemperatureMinTodayC;
  double temperatureMinTodayC;
  bool hasTemperatureMaxTodayC;
  double temperatureMaxTodayC;
  std::vector<DailyForecastDay> dailyForecast;
  std::vector<HourlyForecastEntry> hourlyForecast;
  bool hasWarning;
  std::string warningLevel;
  std::string warningEvent;
  std::string warningHeadline;
};

struct ElectricityPriceSlot {
  std::string validFrom;
  std::string validTo;
  double pricePencePerKwh;
};

struct ElectricityPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  std::vector<ElectricityPriceSlot> prices;
  bool hasTodayAveragePencePerKwh;
  double todayAveragePencePerKwh;
};

struct DashboardModel {
  DashboardStatus status;
  DeparturesPanel departures;
  WeatherPanel weather;
  ElectricityPanel electricity;
};

struct ParseResult {
  bool ok;
  std::string error;
  DashboardModel model;
};

ParseResult parseDashboard(const std::string& json);
