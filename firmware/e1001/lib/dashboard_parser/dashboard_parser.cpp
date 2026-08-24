#include "dashboard_parser.h"

#include <ArduinoJson.h>

namespace {

PanelStatus parsePanelStatus(const char* value) {
  if (value == nullptr) return PanelStatus::Unavailable;
  std::string s(value);
  if (s == "live") return PanelStatus::Live;
  if (s == "stale") return PanelStatus::Stale;
  return PanelStatus::Unavailable;
}

DashboardStatus parseDashboardStatus(const char* value) {
  if (value == nullptr) return DashboardStatus::Unavailable;
  std::string s(value);
  if (s == "live") return DashboardStatus::Live;
  if (s == "partial") return DashboardStatus::Partial;
  return DashboardStatus::Unavailable;
}

void parseDeparturesPanel(JsonObject departuresJson, DeparturesPanel& departures) {
  departures.status = parsePanelStatus(departuresJson["status"] | "");
  departures.stale = departuresJson["stale"] | false;

  if (departuresJson["updatedAt"].is<const char*>()) {
    departures.hasUpdatedAt = true;
    departures.updatedAt = departuresJson["updatedAt"].as<const char*>();
  } else {
    departures.hasUpdatedAt = false;
  }

  for (JsonObject service : departuresJson["services"].as<JsonArray>()) {
    ParsedDeparture departure;
    departure.scheduledDeparture = std::string(service["scheduledDeparture"] | "");
    departure.expectedDisplay = std::string(service["expectedDisplay"] | "");
    departure.operatorName = std::string(service["operator"] | "");
    departure.operatorCode = std::string(service["operatorCode"] | "");
    departure.isCancelled = service["isCancelled"] | false;

    if (service["platform"].is<const char*>()) {
      departure.hasPlatform = true;
      departure.platform = service["platform"].as<const char*>();
    } else {
      departure.hasPlatform = false;
    }

    if (service["coachCount"].is<int>()) {
      departure.hasCoachCount = true;
      departure.coachCount = service["coachCount"].as<int>();
    } else {
      departure.hasCoachCount = false;
    }

    departures.services.push_back(departure);
  }
}

void parseWeatherPanel(JsonObject weatherJson, WeatherPanel& weather) {
  weather.status = parsePanelStatus(weatherJson["status"] | "");
  weather.stale = weatherJson["stale"] | false;

  if (weatherJson["updatedAt"].is<const char*>()) {
    weather.hasUpdatedAt = true;
    weather.updatedAt = weatherJson["updatedAt"].as<const char*>();
  } else {
    weather.hasUpdatedAt = false;
  }

  if (weatherJson["temperatureC"].is<double>()) {
    weather.hasTemperatureC = true;
    weather.temperatureC = weatherJson["temperatureC"].as<double>();
  } else {
    weather.hasTemperatureC = false;
  }

  if (weatherJson["condition"].is<const char*>()) {
    weather.hasCondition = true;
    weather.condition = weatherJson["condition"].as<const char*>();
  } else {
    weather.hasCondition = false;
  }

  if (weatherJson["apparentTemperatureC"].is<double>()) {
    weather.hasApparentTemperatureC = true;
    weather.apparentTemperatureC = weatherJson["apparentTemperatureC"].as<double>();
  } else {
    weather.hasApparentTemperatureC = false;
  }

  if (weatherJson["relativeHumidityPercent"].is<double>()) {
    weather.hasRelativeHumidityPercent = true;
    weather.relativeHumidityPercent = weatherJson["relativeHumidityPercent"].as<double>();
  } else {
    weather.hasRelativeHumidityPercent = false;
  }

  if (weatherJson["precipitationMm"].is<double>()) {
    weather.hasPrecipitationMm = true;
    weather.precipitationMm = weatherJson["precipitationMm"].as<double>();
  } else {
    weather.hasPrecipitationMm = false;
  }

  if (weatherJson["rainChanceNext6HoursPercent"].is<double>()) {
    weather.hasRainChanceNext6HoursPercent = true;
    weather.rainChanceNext6HoursPercent = weatherJson["rainChanceNext6HoursPercent"].as<double>();
  } else {
    weather.hasRainChanceNext6HoursPercent = false;
  }

  if (weatherJson["pressureMslHpa"].is<double>()) {
    weather.hasPressureMslHpa = true;
    weather.pressureMslHpa = weatherJson["pressureMslHpa"].as<double>();
  } else {
    weather.hasPressureMslHpa = false;
  }
}

}  // namespace

ParseResult parseDashboard(const std::string& json) {
  ParseResult result;
  result.ok = false;

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, json);
  if (error) {
    result.error = "JSON parse error";
    return result;
  }

  if (!doc["status"].is<const char*>() ||
      !doc["departures"].is<JsonObject>() ||
      !doc["weather"].is<JsonObject>()) {
    result.error = "Missing required top-level fields";
    return result;
  }

  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);
  parseWeatherPanel(doc["weather"].as<JsonObject>(), model.weather);

  result.ok = true;
  result.model = model;
  return result;
}
