#include <Arduino.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <cstring>

#include "dashboard_client.h"
#include "dashboard_parser.h"
#include "layout.h"
#include "render.h"

namespace {
constexpr uint64_t kSleepMicroseconds = 5ULL * 60 * 1000000;
RTC_DATA_ATTR char storedEtag[128] = "";

void goToSleep() {
  WiFi.disconnect(true);
  esp_sleep_enable_timer_wakeup(kSleepMicroseconds);
  esp_deep_sleep_start();
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("E1001 waking up");

  initDisplay();

  if (!connectWiFi(15000)) {
    Serial.println("WiFi connect failed, keeping existing screen");
    goToSleep();
    return;
  }

  FetchResult fetch = fetchDashboard(std::string(storedEtag));

  if (fetch.status == FetchStatus::NotModified) {
    Serial.println("304 Not Modified, skipping redraw");
  } else if (fetch.status == FetchStatus::Updated) {
    ParseResult parsed = parseDashboard(fetch.body);
    if (parsed.ok) {
      LayoutResult layout = computeLayout(parsed.model, kMaxRows);
      renderDashboard(layout);
      strncpy(storedEtag, fetch.etag.c_str(), sizeof(storedEtag) - 1);
      storedEtag[sizeof(storedEtag) - 1] = '\0';
      Serial.println("Rendered updated dashboard");
    } else {
      Serial.print("Parse failed, keeping existing screen: ");
      Serial.println(parsed.error.c_str());
    }
  } else {
    Serial.println("Fetch failed, keeping existing screen");
  }

  goToSleep();
}

void loop() {
  // Unreachable: setup() always ends in deep sleep, which resets execution
  // back to setup() on wake.
}
