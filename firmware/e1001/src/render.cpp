#include "render.h"

#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans18pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>
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

void drawWeather(const LayoutResult& layout) {
  int y = kHeaderHeight + 30;
  display.setFont(&FreeSans18pt7b);
  display.setCursor(kColumnDividerX + 10, y);
  if (layout.hasWeatherText) {
    display.print(layout.weatherText.c_str());
  }

  display.setFont(&FreeSans12pt7b);
  y += 30;
  for (const auto& line : layout.weatherDetailLines) {
    display.setCursor(kColumnDividerX + 10, y);
    display.print(line.c_str());
    y += 24;
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
