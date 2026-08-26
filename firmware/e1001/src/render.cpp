#include "render.h"

#include <cmath>

#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold9pt7b.h>
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSansBold24pt7b.h>
#include <GxEPD2_BW.h>
#include <SPI.h>

namespace {
constexpr int kEpdSckPin = 7;
constexpr int kEpdMosiPin = 9;
constexpr int kEpdCsPin = 10;
constexpr int kEpdDcPin = 11;
constexpr int kEpdResPin = 12;
constexpr int kEpdBusyPin = 13;

constexpr int kHeaderHeight = 36;
constexpr int kColumnDividerX = 480;
constexpr int kScreenWidth = 800;
constexpr int kScreenHeight = 480;
constexpr int kRightColumnMidY = kHeaderHeight + (kScreenHeight - kHeaderHeight) / 2;

GxEPD2_BW<GxEPD2_750_GDEY075T7, GxEPD2_750_GDEY075T7::HEIGHT> display(
    GxEPD2_750_GDEY075T7(kEpdCsPin, kEpdDcPin, kEpdResPin, kEpdBusyPin));

void drawHeader(const std::string& routeTitle, const std::string& lastRefreshText,
                 const std::string& statusBannerText, int batteryPercent) {
  display.setFont(&FreeSans12pt7b);
  display.setTextColor(GxEPD_BLACK);
  display.setCursor(10, 26);
  display.print(routeTitle.c_str());

  std::string rightText;
  if (!lastRefreshText.empty()) {
    rightText += lastRefreshText + "  ";
  }
  rightText += statusBannerText;
  if (batteryPercent >= 0) {
    rightText += "  " + std::to_string(batteryPercent) + "%";
  }

  int16_t x1, y1;
  uint16_t textWidth, textHeight;
  display.getTextBounds(rightText.c_str(), 0, 0, &x1, &y1, &textWidth, &textHeight);
  display.setCursor(kScreenWidth - 10 - static_cast<int>(textWidth), 26);
  display.print(rightText.c_str());
}

void drawDepartureRows(const LayoutResult& layout) {
  int y = kHeaderHeight;
  const int rowHeight = (kScreenHeight - kHeaderHeight) / 8;
  for (const auto& row : layout.rows) {
    if (row.emphasis == RowEmphasis::Cancelled) {
      display.fillRect(0, y, kColumnDividerX, rowHeight, GxEPD_BLACK);
      display.setTextColor(GxEPD_WHITE);
    } else {
      display.setTextColor(GxEPD_BLACK);
    }

    display.setFont(&FreeSansBold18pt7b);
    display.setCursor(6, y + 24);
    display.print(row.time.c_str());

    display.setFont(&FreeSans9pt7b);
    display.setCursor(110, y + 22);
    display.print(row.statusText.c_str());

    display.setCursor(6, y + 42);
    std::string secondLine = row.platformText + "  ";
    if (row.hasDestination) {
      secondLine += "to " + row.destinationText + "  ";
    }
    secondLine += row.operatorText;
    if (row.hasCoachText) {
      secondLine += "  " + row.coachText;
    }
    display.print(secondLine.c_str());

    y += rowHeight;
  }
  display.setTextColor(GxEPD_BLACK);
}

void drawCloud(int cx, int cy, int scale) {
  display.fillCircle(cx - scale, cy, scale, GxEPD_BLACK);
  display.fillCircle(cx + scale, cy, scale, GxEPD_BLACK);
  display.fillCircle(cx, cy - scale / 2, static_cast<int>(scale * 1.2), GxEPD_BLACK);
  display.fillRect(cx - scale, cy, scale * 2, scale, GxEPD_BLACK);
}

void drawSunRays(int cx, int cy, int radius) {
  for (int i = 0; i < 8; i++) {
    double angle = i * (2 * 3.14159265 / 8);
    int x1 = cx + static_cast<int>((radius + 4) * cos(angle));
    int y1 = cy + static_cast<int>((radius + 4) * sin(angle));
    int x2 = cx + static_cast<int>((radius + 12) * cos(angle));
    int y2 = cy + static_cast<int>((radius + 12) * sin(angle));
    display.drawLine(x1, y1, x2, y2, GxEPD_BLACK);
  }
}

void drawWeatherIcon(WeatherIconKind kind, int cx, int cy, double scale = 1.0) {
  auto s = [scale](double v) { return static_cast<int>(v * scale); };
  switch (kind) {
    case WeatherIconKind::Sun:
      display.fillCircle(cx, cy, s(20), GxEPD_BLACK);
      drawSunRays(cx, cy, s(20));
      break;
    case WeatherIconKind::PartlyCloudy:
      display.fillCircle(cx + s(13), cy - s(16), s(13), GxEPD_BLACK);
      drawSunRays(cx + s(13), cy - s(16), s(13));
      drawCloud(cx - s(5), cy + s(7), s(16));
      break;
    case WeatherIconKind::Cloud:
      drawCloud(cx, cy, s(18));
      break;
    case WeatherIconKind::Fog:
      drawCloud(cx, cy - s(12), s(16));
      for (int i = 0; i < 3; i++) {
        int y = cy + s(14) + i * s(9);
        display.drawLine(cx - s(26), y, cx + s(26), y, GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Rain:
      drawCloud(cx, cy - s(10), s(18));
      for (int i = -1; i <= 1; i++) {
        int x = cx + i * s(16);
        display.drawLine(x, cy + s(16), x - s(5), cy + s(30), GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Snow:
      drawCloud(cx, cy - s(10), s(18));
      for (int i = -1; i <= 1; i++) {
        int x = cx + i * s(16);
        int y = cy + s(23);
        display.drawLine(x - s(6), y, x + s(6), y, GxEPD_BLACK);
        display.drawLine(x, y - s(6), x, y + s(6), GxEPD_BLACK);
        display.drawLine(x - s(5), y - s(5), x + s(5), y + s(5), GxEPD_BLACK);
        display.drawLine(x - s(5), y + s(5), x + s(5), y - s(5), GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Thunderstorm:
      drawCloud(cx, cy - s(12), s(18));
      display.fillTriangle(cx + s(7), cy + s(9), cx - s(7), cy + s(23), cx + s(5), cy + s(23),
                            GxEPD_BLACK);
      display.fillTriangle(cx - s(7), cy + s(23), cx + s(5), cy + s(23), cx - s(5), cy + s(37),
                            GxEPD_BLACK);
      break;
  }
}

void drawWeather(const LayoutResult& layout) {
  int y = kHeaderHeight + 48;
  display.setFont(&FreeSansBold24pt7b);
  display.setCursor(kColumnDividerX + 10, y);
  if (layout.hasWeatherText) {
    display.print(layout.weatherText.c_str());
  }
  if (layout.hasWeatherIcon) {
    drawWeatherIcon(layout.weatherIconKind, kColumnDividerX + 215, y - 8);
  }

  display.setFont(&FreeSans12pt7b);
  y += 40;
  for (const auto& line : layout.weatherDetailLines) {
    display.setCursor(kColumnDividerX + 10, y);
    display.print(line.c_str());
    y += 20;
  }
}

void drawElectricity(const LayoutResult& layout) {
  int headingY = kRightColumnMidY + 20;
  display.setFont(&FreeSans12pt7b);
  display.setCursor(kColumnDividerX + 10, headingY);
  display.print("Electricity (8h)");

  display.setFont(&FreeSans9pt7b);
  display.setCursor(kColumnDividerX + 200, headingY);
  display.print("*below avg");

  const int leftColumnX = kColumnDividerX + 10;
  const int rightColumnX = kColumnDividerX + 165;
  const int rowStep = 24;
  int startY = headingY + 22;

  for (size_t i = 0; i < layout.electricityRows.size(); i++) {
    const auto& row = layout.electricityRows[i];
    int columnX = i < 8 ? leftColumnX : rightColumnX;
    int y = startY + static_cast<int>(i % 8) * rowStep;
    display.setCursor(columnX, y);
    display.print(row.time.c_str());
    display.setCursor(columnX + 60, y);
    std::string priceText = row.belowAverage ? ("*" + row.priceText) : row.priceText;
    display.print(priceText.c_str());
  }
}

// Both forecast row sets render in the left column only (0..kColumnDividerX),
// leaving the right column's weather+electricity untouched, same split as
// the departures screens.

// Measures text in whatever font is currently set, without drawing it.
int measuredTextWidth(const std::string& text) {
  int16_t x1, y1;
  uint16_t textWidth, textHeight;
  display.getTextBounds(text.c_str(), 0, 0, &x1, &y1, &textWidth, &textHeight);
  return static_cast<int>(textWidth);
}

void drawDailyForecastRows(const LayoutResult& layout) {
  const int rowHeight = (kScreenHeight - kHeaderHeight) / 7;
  const int iconScale100 = 55;  // drawWeatherIcon scale, as a percent
  const int iconVisualRadius = 32 * iconScale100 / 100;  // sun ray reach at this scale
  int y = kHeaderHeight;
  for (const auto& row : layout.dailyRows) {
    int midY = y + rowHeight / 2;
    int x = 10;

    display.setFont(&FreeSansBold18pt7b);
    display.setCursor(x, midY + 8);
    display.print(row.dateText.c_str());
    x += measuredTextWidth(row.dateText) + 30;

    int iconCx = x + iconVisualRadius;
    drawWeatherIcon(row.icon, iconCx, midY, iconScale100 / 100.0);
    x = iconCx + iconVisualRadius + 14;

    display.setFont(&FreeSans12pt7b);
    if (row.hasRainChance) {
      display.setCursor(x, midY + 6);
      display.print(row.rainChanceText.c_str());
      x += measuredTextWidth(row.rainChanceText) + 20;
    }

    display.setFont(&FreeSansBold18pt7b);
    display.setCursor(x, midY + 8);
    display.print(row.tempRangeText.c_str());

    y += rowHeight;
    if (y < kScreenHeight) {
      display.drawFastHLine(0, y, kColumnDividerX, GxEPD_BLACK);
    }
  }
}

void drawHourlyForecastRows(const LayoutResult& layout) {
  const int rowHeight = (kScreenHeight - kHeaderHeight) / 6;
  const int columnWidth = kColumnDividerX / 2;
  const int iconScale100 = 30;
  const int iconVisualRadius = 32 * iconScale100 / 100;
  for (size_t i = 0; i < layout.hourlyRows.size(); i++) {
    const auto& row = layout.hourlyRows[i];
    int column = static_cast<int>(i) < 6 ? 0 : 1;
    int rowInColumn = static_cast<int>(i) % 6;
    int columnX = column * columnWidth;
    int y = kHeaderHeight + rowInColumn * rowHeight;
    int midY = y + rowHeight / 2;
    int x = columnX + 6;

    display.setFont(&FreeSansBold12pt7b);
    display.setCursor(x, midY + 6);
    display.print(row.timeText.c_str());
    x += measuredTextWidth(row.timeText) + 10;

    int iconCx = x + iconVisualRadius;
    drawWeatherIcon(row.icon, iconCx, midY, iconScale100 / 100.0);
    x = iconCx + iconVisualRadius + 6;

    display.setFont(&FreeSans9pt7b);
    if (row.hasRainChance) {
      display.setCursor(x, midY + 5);
      display.print(row.rainChanceText.c_str());
      x += measuredTextWidth(row.rainChanceText) + 8;
    }

    display.setFont(&FreeSansBold12pt7b);
    display.setCursor(x, midY + 6);
    display.print(row.tempText.c_str());

    if (rowInColumn > 0) {
      display.drawFastHLine(columnX, y, columnWidth, GxEPD_BLACK);
    }
  }
  display.drawFastVLine(columnWidth, kHeaderHeight, kScreenHeight - kHeaderHeight, GxEPD_BLACK);
}

}  // namespace

void initDisplay() {
  SPI.begin(kEpdSckPin, -1, kEpdMosiPin, kEpdCsPin);
  display.init(115200);
  display.setRotation(0);
}

void renderDashboard(const LayoutResult& layout) {
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);

    display.drawFastVLine(kColumnDividerX, kHeaderHeight, kScreenHeight - kHeaderHeight, GxEPD_BLACK);
    display.drawFastHLine(kColumnDividerX, kRightColumnMidY, kScreenWidth - kColumnDividerX, GxEPD_BLACK);

    drawHeader(layout.routeTitle, layout.lastRefreshText, layout.statusBannerText,
               layout.batteryPercent);
    switch (layout.screen) {
      case Screen::Commute:
      case Screen::AllDepartures:
        drawDepartureRows(layout);
        break;
      case Screen::SevenDayWeather:
        drawDailyForecastRows(layout);
        break;
      case Screen::TwelveHourWeather:
        drawHourlyForecastRows(layout);
        break;
    }
    drawWeather(layout);
    drawElectricity(layout);
  } while (display.nextPage());

  display.hibernate();
}
