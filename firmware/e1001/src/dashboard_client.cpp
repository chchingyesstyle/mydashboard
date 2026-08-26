#include "dashboard_client.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

namespace {
const char* kDashboardUrl = "https://dashboard.cchk.uk/api/v1/dashboard";
}  // namespace

bool connectWiFi(uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > timeoutMs) {
      Serial0.print("WiFi status code: ");
      Serial0.println(WiFi.status());
      return false;
    }
    delay(200);
  }
  return true;
}

FetchResult fetchDashboard(const std::string& lastEtag, const std::string& routeId) {
  FetchResult result;
  result.status = FetchStatus::Failed;

  // No certificate pinning: acceptable trade-off for a public, read-only
  // endpoint on a battery-powered device with no sensitive data exchanged.
  WiFiClientSecure client;
  client.setInsecure();

  std::string url = std::string(kDashboardUrl) + "?route=" + routeId;

  HTTPClient http;
  if (!http.begin(client, url.c_str())) {
    return result;
  }

  if (!lastEtag.empty()) {
    http.addHeader("If-None-Match", lastEtag.c_str());
  }

  int httpCode = http.GET();

  if (httpCode == 304) {
    result.status = FetchStatus::NotModified;
  } else if (httpCode == 200) {
    result.status = FetchStatus::Updated;
    result.body = std::string(http.getString().c_str());
    result.etag = std::string(http.header("ETag").c_str());
  }

  http.end();
  return result;
}
