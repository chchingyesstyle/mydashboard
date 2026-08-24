#include "render.h"

#include <Fonts/FreeSans12pt7b.h>
#include <Fonts/FreeSans9pt7b.h>
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

GxEPD2_BW<GxEPD2_750_GDEY075T7, GxEPD2_750_GDEY075T7::HEIGHT> display(
    GxEPD2_750_GDEY075T7(kEpdCsPin, kEpdDcPin, kEpdResPin, kEpdBusyPin));
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

    display.setFont(&FreeSans12pt7b);
    display.setCursor(10, 30);
    display.print(layout.statusBannerText.c_str());

    if (layout.hasWeatherText) {
      display.setCursor(560, 30);
      display.print(layout.weatherText.c_str());
    }

    int y = 70;
    const int rowHeight = 68;
    for (const auto& row : layout.rows) {
      if (row.emphasis == RowEmphasis::Cancelled) {
        display.fillRect(0, y - 20, 800, rowHeight, GxEPD_BLACK);
        display.setTextColor(GxEPD_WHITE);
      } else {
        display.setTextColor(GxEPD_BLACK);
      }

      display.setFont(&FreeSansBold24pt7b);
      display.setCursor(10, y + 20);
      display.print(row.time.c_str());

      display.setFont(&FreeSans12pt7b);
      display.setCursor(160, y + 20);
      display.print(row.statusText.c_str());

      display.setFont(&FreeSans9pt7b);
      display.setCursor(10, y + 45);
      std::string secondLine = row.platformText + "  " + row.operatorText;
      if (row.hasCoachText) {
        secondLine += "  " + row.coachText;
      }
      display.print(secondLine.c_str());

      y += rowHeight;
    }
  } while (display.nextPage());

  display.hibernate();
}
