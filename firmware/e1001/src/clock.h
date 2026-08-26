#pragma once

#include <string>

// Syncs wall-clock time via NTP (Europe/London, DST-aware) and returns it
// formatted as "Ddd D Mon  HH:MM" local time (e.g. "Tue 25 Aug  14:32").
// Returns an empty string if sync does not complete within the timeout.
// Requires an active WiFi connection.
std::string syncAndFormatLocalTime();
