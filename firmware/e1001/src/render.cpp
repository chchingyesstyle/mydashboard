#include "render.h"

#include <cmath>

#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
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

void drawHeader(const LayoutResult& layout) {
  display.setFont(&FreeSans12pt7b);
  display.setTextColor(GxEPD_BLACK);
  display.setCursor(10, 26);
  display.print("Watford to Euston");

  std::string rightText;
  if (!layout.lastRefreshText.empty()) {
    rightText += layout.lastRefreshText + "  ";
  }
  rightText += layout.statusBannerText;
  if (layout.batteryPercent >= 0) {
    rightText += "  " + std::to_string(layout.batteryPercent) + "%";
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
    std::string secondLine = row.platformText + "  " + row.operatorText;
    if (row.hasCoachText) {
      secondLine += "  " + row.coachText;
    }
    if (row.hasReason) {
      secondLine += "  " + row.reasonText;
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

void drawWeatherIcon(WeatherIconKind kind, int cx, int cy) {
  switch (kind) {
    case WeatherIconKind::Sun:
      display.fillCircle(cx, cy, 20, GxEPD_BLACK);
      drawSunRays(cx, cy, 20);
      break;
    case WeatherIconKind::PartlyCloudy:
      display.fillCircle(cx + 13, cy - 16, 13, GxEPD_BLACK);
      drawSunRays(cx + 13, cy - 16, 13);
      drawCloud(cx - 5, cy + 7, 16);
      break;
    case WeatherIconKind::Cloud:
      drawCloud(cx, cy, 18);
      break;
    case WeatherIconKind::Fog:
      drawCloud(cx, cy - 12, 16);
      for (int i = 0; i < 3; i++) {
        int y = cy + 14 + i * 9;
        display.drawLine(cx - 26, y, cx + 26, y, GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Rain:
      drawCloud(cx, cy - 10, 18);
      for (int i = -1; i <= 1; i++) {
        int x = cx + i * 16;
        display.drawLine(x, cy + 16, x - 5, cy + 30, GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Snow:
      drawCloud(cx, cy - 10, 18);
      for (int i = -1; i <= 1; i++) {
        int x = cx + i * 16;
        int y = cy + 23;
        display.drawLine(x - 6, y, x + 6, y, GxEPD_BLACK);
        display.drawLine(x, y - 6, x, y + 6, GxEPD_BLACK);
        display.drawLine(x - 5, y - 5, x + 5, y + 5, GxEPD_BLACK);
        display.drawLine(x - 5, y + 5, x + 5, y - 5, GxEPD_BLACK);
      }
      break;
    case WeatherIconKind::Thunderstorm:
      drawCloud(cx, cy - 12, 18);
      display.fillTriangle(cx + 7, cy + 9, cx - 7, cy + 23, cx + 5, cy + 23, GxEPD_BLACK);
      display.fillTriangle(cx - 7, cy + 23, cx + 5, cy + 23, cx - 5, cy + 37, GxEPD_BLACK);
      break;
  }
}

void drawWeather(const LayoutResult& layout) {
  int y = kHeaderHeight + 34;
  display.setFont(&FreeSansBold24pt7b);
  display.setCursor(kColumnDividerX + 10, y);
  if (layout.hasWeatherText) {
    display.print(layout.weatherText.c_str());
  }
  if (layout.hasWeatherIcon) {
    drawWeatherIcon(layout.weatherIconKind, kColumnDividerX + 215, y - 14);
  }

  display.setFont(&FreeSans12pt7b);
  y += 40;
  for (const auto& line : layout.weatherDetailLines) {
    display.setCursor(kColumnDividerX + 10, y);
    display.print(line.c_str());
    y += 22;
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

    drawHeader(layout);
    drawDepartureRows(layout);
    drawWeather(layout);
    drawElectricity(layout);
  } while (display.nextPage());

  display.hibernate();
}
