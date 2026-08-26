#include "clock.h"

#include <Arduino.h>
#include <cstdlib>
#include <time.h>

namespace {
// Standard POSIX TZ rule for Europe/London: GMT in winter, BST (UTC+1) from
// the last Sunday in March to the last Sunday in October.
constexpr const char* kLondonTz = "GMT0BST,M3.5.0/1,M10.5.0";
constexpr const char* kNtpServer = "pool.ntp.org";
constexpr uint32_t kSyncTimeoutMs = 5000;
// Any synced time will be well past this; an unsynced clock reads near zero.
constexpr time_t kMinPlausibleEpoch = 1000000000;

constexpr const char* kWeekdayNames[7] = {
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
constexpr const char* kMonthNames[12] = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
}  // namespace

bool syncLocalTime(struct tm& outTime) {
  configTzTime(kLondonTz, kNtpServer);

  time_t now = 0;
  uint32_t start = millis();
  while (now < kMinPlausibleEpoch && millis() - start < kSyncTimeoutMs) {
    delay(100);
    time(&now);
  }

  if (now < kMinPlausibleEpoch) {
    return false;
  }

  localtime_r(&now, &outTime);
  return true;
}

bool readLocalTimeOffline(struct tm& outTime) {
  setenv("TZ", kLondonTz, 1);
  tzset();

  time_t now = 0;
  time(&now);
  if (now < kMinPlausibleEpoch) {
    return false;
  }

  localtime_r(&now, &outTime);
  return true;
}

std::string formatLocalTime(const struct tm& timeinfo) {
  char buffer[24];
  snprintf(buffer, sizeof(buffer), "%s %d %s  %02d:%02d",
           kWeekdayNames[timeinfo.tm_wday], timeinfo.tm_mday,
           kMonthNames[timeinfo.tm_mon], timeinfo.tm_hour, timeinfo.tm_min);
  return std::string(buffer);
}
