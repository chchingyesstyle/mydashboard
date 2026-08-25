#pragma once

#include <string>

// Syncs wall-clock time via NTP (Europe/London, DST-aware) and returns it
// formatted as "HH:MM" local time. Returns an empty string if sync does not
// complete within the timeout. Requires an active WiFi connection.
std::string syncAndFormatLocalTime();
