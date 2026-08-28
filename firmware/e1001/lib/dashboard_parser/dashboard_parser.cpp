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

    if (service["reason"].is<const char*>()) {
      departure.hasReason = true;
      departure.reason = service["reason"].as<const char*>();
    } else {
      departure.hasReason = false;
    }

    if (service["finalDestination"]["name"].is<const char*>()) {
      departure.hasFinalDestination = true;
      departure.finalDestinationName = service["finalDestination"]["name"].as<const char*>();
    } else {
      departure.hasFinalDestination = false;
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

  if (weatherJson["weatherCode"].is<int>()) {
    weather.hasWeatherCode = true;
    weather.weatherCode = weatherJson["weatherCode"].as<int>();
  } else {
    weather.hasWeatherCode = false;
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

  if (weatherJson["temperatureMinTodayC"].is<double>()) {
    weather.hasTemperatureMinTodayC = true;
    weather.temperatureMinTodayC = weatherJson["temperatureMinTodayC"].as<double>();
  } else {
    weather.hasTemperatureMinTodayC = false;
  }

  if (weatherJson["temperatureMaxTodayC"].is<double>()) {
    weather.hasTemperatureMaxTodayC = true;
    weather.temperatureMaxTodayC = weatherJson["temperatureMaxTodayC"].as<double>();
  } else {
    weather.hasTemperatureMaxTodayC = false;
  }

  if (weatherJson["dailyForecast"].is<JsonArray>()) {
    for (JsonObject day : weatherJson["dailyForecast"].as<JsonArray>()) {
      if (!day["date"].is<const char*>() || !day["weatherCode"].is<int>() ||
          !day["temperatureMinC"].is<double>() || !day["temperatureMaxC"].is<double>() ||
          !day["rainChancePercent"].is<double>()) {
        continue;
      }
      DailyForecastDay forecastDay;
      forecastDay.date = day["date"].as<const char*>();
      forecastDay.weatherCode = day["weatherCode"].as<int>();
      forecastDay.temperatureMinC = day["temperatureMinC"].as<double>();
      forecastDay.temperatureMaxC = day["temperatureMaxC"].as<double>();
      forecastDay.rainChancePercent = day["rainChancePercent"].as<double>();
      weather.dailyForecast.push_back(forecastDay);
    }
  }

  if (weatherJson["hourlyForecast"].is<JsonArray>()) {
    for (JsonObject hour : weatherJson["hourlyForecast"].as<JsonArray>()) {
      if (!hour["time"].is<const char*>() || !hour["weatherCode"].is<int>() ||
          !hour["temperatureC"].is<double>() || !hour["rainChancePercent"].is<double>()) {
        continue;
      }
      HourlyForecastEntry forecastHour;
      forecastHour.time = hour["time"].as<const char*>();
      forecastHour.weatherCode = hour["weatherCode"].as<int>();
      forecastHour.temperatureC = hour["temperatureC"].as<double>();
      forecastHour.rainChancePercent = hour["rainChancePercent"].as<double>();
      weather.hourlyForecast.push_back(forecastHour);
    }
  }

  if (weatherJson["warning"].is<JsonObject>()) {
    JsonObject warningJson = weatherJson["warning"].as<JsonObject>();
    if (warningJson["level"].is<const char*>() && warningJson["event"].is<const char*>() &&
        warningJson["headline"].is<const char*>()) {
      weather.hasWarning = true;
      weather.warningLevel = warningJson["level"].as<const char*>();
      weather.warningEvent = warningJson["event"].as<const char*>();
      weather.warningHeadline = warningJson["headline"].as<const char*>();
    } else {
      weather.hasWarning = false;
    }
  } else {
    weather.hasWarning = false;
  }
}

void parseElectricityPanel(JsonObject electricityJson, ElectricityPanel& electricity) {
  electricity.status = parsePanelStatus(electricityJson["status"] | "");
  electricity.stale = electricityJson["stale"] | false;

  if (electricityJson["updatedAt"].is<const char*>()) {
    electricity.hasUpdatedAt = true;
    electricity.updatedAt = electricityJson["updatedAt"].as<const char*>();
  } else {
    electricity.hasUpdatedAt = false;
  }

  for (JsonObject slot : electricityJson["prices"].as<JsonArray>()) {
    std::string validFrom = std::string(slot["validFrom"] | "");
    std::string validTo = std::string(slot["validTo"] | "");
    if (validFrom.empty() || validTo.empty() || !slot["pricePencePerKwh"].is<double>()) {
      continue;
    }
    ElectricityPriceSlot priceSlot;
    priceSlot.validFrom = validFrom;
    priceSlot.validTo = validTo;
    priceSlot.pricePencePerKwh = slot["pricePencePerKwh"].as<double>();
    electricity.prices.push_back(priceSlot);
  }

  if (electricityJson["todayAveragePencePerKwh"].is<double>()) {
    electricity.hasTodayAveragePencePerKwh = true;
    electricity.todayAveragePencePerKwh = electricityJson["todayAveragePencePerKwh"].as<double>();
  } else {
    electricity.hasTodayAveragePencePerKwh = false;
  }
}

void setUnavailableNewsPanel(NewsPanel& panel, const char* source) {
  panel.status = PanelStatus::Unavailable;
  panel.stale = false;
  panel.hasUpdatedAt = false;
  panel.updatedAt.clear();
  panel.source = source;
  panel.topStories.clear();
  panel.latestStories.clear();
}

void parseNewsStories(JsonVariant storiesJson, size_t maxStories,
                      std::vector<NewsStory>& stories) {
  if (!storiesJson.is<JsonArray>()) return;
  for (JsonObject storyJson : storiesJson.as<JsonArray>()) {
    if (stories.size() >= maxStories ||
        !storyJson["title"].is<const char*>() ||
        !storyJson["publishedAt"].is<const char*>() ||
        !storyJson["url"].is<const char*>()) {
      continue;
    }
    const char* title = storyJson["title"].as<const char*>();
    const char* publishedAt = storyJson["publishedAt"].as<const char*>();
    const char* url = storyJson["url"].as<const char*>();
    if (title == nullptr || publishedAt == nullptr || url == nullptr ||
        title[0] == '\0' || publishedAt[0] == '\0' || url[0] == '\0') {
      continue;
    }
    stories.push_back(NewsStory{title, publishedAt, url});
  }
}

void parseNewsPanel(JsonObject newsJson, NewsPanel& panel, const char* fallbackSource) {
  panel.status = parsePanelStatus(newsJson["status"] | "");
  panel.stale = newsJson["stale"] | false;
  if (newsJson["updatedAt"].is<const char*>()) {
    panel.hasUpdatedAt = true;
    panel.updatedAt = newsJson["updatedAt"].as<const char*>();
  } else {
    panel.hasUpdatedAt = false;
    panel.updatedAt.clear();
  }
  panel.source = newsJson["source"].is<const char*>()
                     ? newsJson["source"].as<const char*>()
                     : fallbackSource;
  panel.topStories.clear();
  panel.latestStories.clear();
  parseNewsStories(newsJson["topStories"], 3, panel.topStories);
  parseNewsStories(newsJson["latestStories"], 6, panel.latestStories);
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
      !doc["weather"].is<JsonObject>() ||
      !doc["electricity"].is<JsonObject>()) {
    result.error = "Missing required top-level fields";
    return result;
  }

  DashboardModel model{};
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  setUnavailableNewsPanel(model.news.hongKong, "RTHK News");
  setUnavailableNewsPanel(model.news.unitedKingdom, "BBC News");
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);
  parseWeatherPanel(doc["weather"].as<JsonObject>(), model.weather);
  parseElectricityPanel(doc["electricity"].as<JsonObject>(), model.electricity);

  if (doc["news"].is<JsonObject>()) {
    JsonObject newsJson = doc["news"].as<JsonObject>();
    if (newsJson["hongKong"].is<JsonObject>()) {
      parseNewsPanel(newsJson["hongKong"].as<JsonObject>(), model.news.hongKong,
                     "RTHK News");
    }
    if (newsJson["unitedKingdom"].is<JsonObject>()) {
      parseNewsPanel(newsJson["unitedKingdom"].as<JsonObject>(),
                     model.news.unitedKingdom, "BBC News");
    }
  }

  result.ok = true;
  result.model = model;
  return result;
}
