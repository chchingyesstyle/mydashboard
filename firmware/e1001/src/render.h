#pragma once

#include "layout.h"

void initDisplay();
void renderDashboard(const LayoutResult& layout);

// Redraws just the header's right-hand text (date/time, status, battery)
// using a fast e-ink partial refresh, instead of the full-screen redraw
// renderDashboard() does. routeTitle/statusBannerText/batteryPercent
// should be whatever was last shown by a full renderDashboard() call, so
// only the time portion actually changes between ticks.
void updateClockOnly(const std::string& lastRefreshText,
                      const std::string& statusBannerText, int batteryPercent);
