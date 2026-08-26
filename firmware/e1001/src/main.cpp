#include <Arduino.h>
#include <WiFi.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>
#include <cstring>

#include "battery.h"
#include "clock.h"
#include "dashboard_client.h"
#include "dashboard_parser.h"
#include "layout.h"
#include "render.h"
#include "route_selector.h"

namespace {
constexpr uint64_t kSleepMicroseconds = 5ULL * 60 * 1000000;
// Right white button. The green button (GPIO3) is a boot-strapping pin on
// the ESP32-S3 and Seeed's own docs warn against using it as a wake source,
// since it can interfere with future USB firmware uploads.
constexpr gpio_num_t kRefreshButtonPin = GPIO_NUM_4;
RTC_DATA_ATTR char storedEtag[128] = "";

void goToSleep() {
  WiFi.disconnect(true);
  rtc_gpio_pullup_en(kRefreshButtonPin);
  rtc_gpio_pulldown_dis(kRefreshButtonPin);
  esp_sleep_enable_ext0_wakeup(kRefreshButtonPin, 0);
  esp_sleep_enable_timer_wakeup(kSleepMicroseconds);
  esp_deep_sleep_start();
}
}  // namespace

void setup() {
  Serial0.begin(115200);
  delay(200);
  Serial0.println(
      esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT0
          ? "E1001 waking up (manual refresh button)"
          : "E1001 waking up");

  initDisplay();

  if (!connectWiFi(15000)) {
    Serial0.println("WiFi connect failed, keeping existing screen");
    goToSleep();
    return;
  }

  struct tm timeinfo;
  bool hasTime = syncLocalTime(timeinfo);
  RouteMode mode = hasTime ? routeModeForHour(timeinfo.tm_hour) : RouteMode::Commute;
  std::string lastRefreshText = hasTime ? formatLocalTime(timeinfo) : "";

  FetchResult fetch = fetchDashboard(std::string(storedEtag), routeIdForMode(mode));

  if (fetch.status == FetchStatus::NotModified) {
    Serial0.println("304 Not Modified, skipping redraw");
  } else if (fetch.status == FetchStatus::Updated) {
    ParseResult parsed = parseDashboard(fetch.body);
    if (parsed.ok) {
      int batteryPercent = batteryPercentFromVoltage(readBatteryVoltage());
      LayoutResult layout =
          computeLayout(parsed.model, kMaxRows, batteryPercent, lastRefreshText, mode);
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
