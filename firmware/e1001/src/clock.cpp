#include "clock.h"

#include <Arduino.h>
#include <time.h>

namespace {
// Standard POSIX TZ rule for Europe/London: GMT in winter, BST (UTC+1) from
// the last Sunday in March to the last Sunday in October.
constexpr const char* kLondonTz = "GMT0BST,M3.5.0/1,M10.5.0";
constexpr const char* kNtpServer = "pool.ntp.org";
constexpr uint32_t kSyncTimeoutMs = 5000;
// Any synced time will be well past this; an unsynced clock reads near zero.
constexpr time_t kMinPlausibleEpoch = 1000000000;
}  // namespace

std::string syncAndFormatLocalTime() {
  configTzTime(kLondonTz, kNtpServer);

  time_t now = 0;
  uint32_t start = millis();
  while (now < kMinPlausibleEpoch && millis() - start < kSyncTimeoutMs) {
    delay(100);
    time(&now);
  }

  if (now < kMinPlausibleEpoch) {
    return "";
  }

  struct tm timeinfo;
  localtime_r(&now, &timeinfo);
  char buffer[8];
  snprintf(buffer, sizeof(buffer), "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
  return std::string(buffer);
}
