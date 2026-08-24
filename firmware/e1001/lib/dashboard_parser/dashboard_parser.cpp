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

  result.ok = true;
  result.model = model;
  return result;
}
