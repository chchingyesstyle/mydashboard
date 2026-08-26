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
// Left white button. GPIO5 is not a boot-strapping pin, so it's safe to use
// as a second wake source. Each press flips a persisted toggle, so repeated
// presses alternate between the two views; any other wake (timer or the
// plain refresh button) resets the toggle back to the time-based default.
constexpr gpio_num_t kOverrideButtonPin = GPIO_NUM_5;
constexpr uint64_t kButtonWakeMask =
    (1ULL << kRefreshButtonPin) | (1ULL << kOverrideButtonPin);
RTC_DATA_ATTR char storedEtag[128] = "";
RTC_DATA_ATTR bool overrideActive = false;

void goToSleep() {
  WiFi.disconnect(true);
  rtc_gpio_pullup_en(kRefreshButtonPin);
  rtc_gpio_pulldown_dis(kRefreshButtonPin);
  rtc_gpio_pullup_en(kOverrideButtonPin);
  rtc_gpio_pulldown_dis(kOverrideButtonPin);
  esp_sleep_enable_ext1_wakeup(kButtonWakeMask, ESP_EXT1_WAKEUP_ANY_LOW);
  esp_sleep_enable_timer_wakeup(kSleepMicroseconds);
  esp_deep_sleep_start();
}
}  // namespace

void setup() {
  Serial0.begin(115200);
  delay(200);

  bool wokeFromButton = esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT1;
  bool overridePressed = wokeFromButton &&
      (esp_sleep_get_ext1_wakeup_status() & (1ULL << kOverrideButtonPin)) != 0;
  Serial0.println(
      overridePressed ? "E1001 waking up (mode-override button)"
      : wokeFromButton ? "E1001 waking up (manual refresh button)"
                        : "E1001 waking up");

  overrideActive = nextOverrideActive(overrideActive, overridePressed);

  initDisplay();

  if (!connectWiFi(15000)) {
    Serial0.println("WiFi connect failed, keeping existing screen");
    goToSleep();
    return;
  }

  struct tm timeinfo;
  bool hasTime = syncLocalTime(timeinfo);
  RouteMode timeBasedMode = hasTime ? routeModeForHour(timeinfo.tm_hour) : RouteMode::Commute;
  RouteMode mode = modeForOverride(timeBasedMode, overrideActive);
  std::string lastRefreshText = hasTime ? formatLocalTime(timeinfo) : "";

  Serial0.print("Route: ");
  Serial0.println(routeIdForMode(mode).c_str());

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
