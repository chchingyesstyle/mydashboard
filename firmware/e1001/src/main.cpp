#include <Arduino.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <cstring>

#include "battery.h"
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
  Serial0.begin(115200);
  delay(200);
  Serial0.println("E1001 waking up");

  initDisplay();

  if (!connectWiFi(15000)) {
    Serial0.println("WiFi connect failed, keeping existing screen");
    goToSleep();
    return;
  }

  FetchResult fetch = fetchDashboard(std::string(storedEtag));

  if (fetch.status == FetchStatus::NotModified) {
    Serial0.println("304 Not Modified, skipping redraw");
  } else if (fetch.status == FetchStatus::Updated) {
    ParseResult parsed = parseDashboard(fetch.body);
    if (parsed.ok) {
      int batteryPercent = batteryPercentFromVoltage(readBatteryVoltage());
      LayoutResult layout = computeLayout(parsed.model, kMaxRows, batteryPercent);
      renderDashboard(layout);
      strncpy(storedEtag, fetch.etag.c_str(), sizeof(storedEtag) - 1);
      storedEtag[sizeof(storedEtag) - 1] = '\0';
      Serial0.println("Rendered updated dashboard");
    } else {
      Serial0.print("Parse failed, keeping existing screen: ");
      Serial0.println(parsed.error.c_str());
    }
  } else {
    Serial0.println("Fetch failed, keeping existing screen");
  }

  goToSleep();
}

void loop() {
  // Unreachable: setup() always ends in deep sleep, which resets execution
  // back to setup() on wake.
}
