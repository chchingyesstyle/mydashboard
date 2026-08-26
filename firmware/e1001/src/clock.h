#pragma once

#include <ctime>
#include <string>

// Syncs wall-clock time via NTP (Europe/London, DST-aware) and populates
// outTime with the local time on success. Returns false if sync does not
// complete within the timeout. Requires an active WiFi connection.
bool syncLocalTime(struct tm& outTime);

// Formats a local tm as "Ddd D Mon  HH:MM" (e.g. "Tue 25 Aug  14:32").
std::string formatLocalTime(const struct tm& timeinfo);
