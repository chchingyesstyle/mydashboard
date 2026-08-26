#pragma once

#include <ctime>
#include <string>

// Syncs wall-clock time via NTP (Europe/London, DST-aware) and populates
// outTime with the local time on success. Returns false if sync does not
// complete within the timeout. Requires an active WiFi connection.
bool syncLocalTime(struct tm& outTime);

// Reads the current local time from the ESP32's RTC without contacting an
// NTP server — cheap and works with WiFi off. The RTC keeps counting
// through deep sleep once syncLocalTime() has synced it at least once, so
// this drifts only slightly between full syncs. Returns false if the clock
// has never been synced (implausibly early epoch).
bool readLocalTimeOffline(struct tm& outTime);

// Formats a local tm as "Ddd D Mon  HH:MM" (e.g. "Tue 25 Aug  14:32").
std::string formatLocalTime(const struct tm& timeinfo);
