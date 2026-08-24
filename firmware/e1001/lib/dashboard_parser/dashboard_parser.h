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
  bool hasCoachCount;
  int coachCount;
  bool isCancelled;
};

struct DeparturesPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  std::vector<ParsedDeparture> services;
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
};

struct DashboardModel {
  DashboardStatus status;
  DeparturesPanel departures;
  WeatherPanel weather;
};

struct ParseResult {
  bool ok;
  std::string error;
  DashboardModel model;
};

ParseResult parseDashboard(const std::string& json);
