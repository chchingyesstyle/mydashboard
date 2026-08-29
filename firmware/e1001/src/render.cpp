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
#include <U8g2_for_Adafruit_GFX.h>

#ifndef U8G2_USE_LARGE_FONTS
#define U8G2_USE_LARGE_FONTS
#endif
#include "../lib/news_font/u8g2_font_unifont_h_chinese4.h"

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
U8G2_FOR_ADAFRUIT_GFX u8g2;

size_t utf8CodePointLength(const std::string& text, size_t offset) {
  const unsigned char first = static_cast<unsigned char>(text[offset]);
  if (first < 0x80) return 1;
  if ((first & 0xE0) == 0xC0 && offset + 1 < text.size() &&
      (static_cast<unsigned char>(text[offset + 1]) & 0xC0) == 0x80) {
    return 2;
  }
  if ((first & 0xF0) == 0xE0 && offset + 2 < text.size() &&
      (static_cast<unsigned char>(text[offset + 1]) & 0xC0) == 0x80 &&
      (static_cast<unsigned char>(text[offset + 2]) & 0xC0) == 0x80) {
    return 3;
  }
  if ((first & 0xF8) == 0xF0 && offset + 3 < text.size() &&
      (static_cast<unsigned char>(text[offset + 1]) & 0xC0) == 0x80 &&
      (static_cast<unsigned char>(text[offset + 2]) & 0xC0) == 0x80 &&
      (static_cast<unsigned char>(text[offset + 3]) & 0xC0) == 0x80) {
    return 4;
  }
  return 1;
}

std::string fitUtf8Line(const std::string& text, int maxWidth) {
  if (u8g2.getUTF8Width(text.c_str()) <= maxWidth) return text;

  const std::string suffix = "...";
  std::string result;
  size_t offset = 0;
  while (offset < text.size()) {
    const size_t length = utf8CodePointLength(text, offset);
    const std::string codePoint = text.substr(offset, length);
    const std::string candidate = result + codePoint + suffix;
    if (u8g2.getUTF8Width(candidate.c_str()) > maxWidth) break;
    result += codePoint;
    offset += length;
  }
  if (result.empty()) return suffix;
  return result + suffix;
}

std::vector<std::string> wrapUtf8(const std::string& text, int maxWidth,
                                  int maxLines) {
  std::vector<std::string> lines;
  if (maxLines <= 0 || text.empty()) return lines;

  std::string current;
  size_t offset = 0;
  while (offset < text.size()) {
    const size_t length = utf8CodePointLength(text, offset);
    const std::string codePoint = text.substr(offset, length);
    offset += length;

    if (codePoint == "\n") {
      lines.push_back(current);
      current.clear();
      continue;
    }
    const std::string candidate = current + codePoint;
    if (current.empty() || u8g2.getUTF8Width(candidate.c_str()) <= maxWidth) {
      current = candidate;
    } else {
      lines.push_back(current);
      current = codePoint;
    }
  }
  if (!current.empty() || lines.empty()) lines.push_back(current);

  if (static_cast<int>(lines.size()) > maxLines) {
    lines.resize(maxLines);
    lines.back() = fitUtf8Line(lines.back(), maxWidth);
  }
  return lines;
}

void drawUtf8RightAligned(const std::string& text, int rightX, int baseline) {
  const int width = u8g2.getUTF8Width(text.c_str());
  u8g2.drawUTF8(rightX - width, baseline, text.c_str());
}

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
    if (row.emphasis == RowEmphasis::Delayed) {
      display.fillRect(0, y, 6, rowHeight, GxEPD_BLACK);
    }

    display.setFont(&FreeSansBold18pt7b);
    display.setCursor(6, y + 24);
    display.print(row.time.c_str());

    if (row.emphasis == RowEmphasis::Delayed) {
      display.setFont(&FreeSansBold9pt7b);
      int16_t x1, y1;
      uint16_t statusWidth, statusHeight;
      display.getTextBounds(row.statusText.c_str(), 0, 0, &x1, &y1, &statusWidth, &statusHeight);
      display.fillRect(104, y + 3, statusWidth + 12, 24, GxEPD_BLACK);
      display.setTextColor(GxEPD_WHITE);
      display.setCursor(110, y + 21);
      display.print(row.statusText.c_str());
      display.setTextColor(GxEPD_BLACK);
    } else {
      display.setFont(&FreeSans9pt7b);
      display.setCursor(110, y + 22);
      display.print(row.statusText.c_str());
    }

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
  constexpr int kWeatherX = kColumnDividerX + 10;
  constexpr int kMetricRightX = kColumnDividerX + 165;
  constexpr int kWarningTop = kRightColumnMidY - 48;

  display.setFont(&FreeSansBold24pt7b);
  display.setCursor(kWeatherX, kHeaderHeight + 50);
  if (layout.hasWeatherText) {
    display.print(layout.weatherText.c_str());
  }
  if (layout.hasWeatherIcon) {
    drawWeatherIcon(layout.weatherIconKind, kColumnDividerX + 215, kHeaderHeight + 42);
  }

  display.setFont(&FreeSans9pt7b);
  display.setCursor(kWeatherX, kHeaderHeight + 79);
  display.print(layout.weatherConditionText.c_str());

  const int metricOffsetY = layout.hasWeatherWarning ? 0 : 28;
  const int metricRows[] = {
      kHeaderHeight + 94 + metricOffsetY,
      kHeaderHeight + 116 + metricOffsetY,
  };
  for (int i = 0; i < 4; i++) {
    const std::string& line = layout.weatherDetailLines[i];
    if (line.empty()) continue;
    int x = i % 2 == 0 ? kWeatherX : kMetricRightX;
    display.setCursor(x, metricRows[i / 2]);
    display.print(line.c_str());
  }
  for (int i = 4; i < 6; i++) {
    const std::string& line = layout.weatherDetailLines[i];
    if (line.empty()) continue;
    display.setCursor(kWeatherX, kHeaderHeight + 138 + metricOffsetY + (i - 4) * 20);
    display.print(line.c_str());
  }

  if (layout.hasWeatherWarning) {
    display.fillRect(kColumnDividerX + 1, kWarningTop, kScreenWidth - kColumnDividerX - 1,
                     kRightColumnMidY - kWarningTop, GxEPD_BLACK);
    display.setTextColor(GxEPD_WHITE);
    display.setFont(&FreeSansBold9pt7b);
    display.setCursor(kWeatherX, kWarningTop + 16);
    display.print("WEATHER WARNING");
    display.setFont(&FreeSans9pt7b);
    display.setCursor(kWeatherX, kWarningTop + 35);
    display.print(layout.weatherWarningText.c_str());
    display.setTextColor(GxEPD_BLACK);
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

// Both time scales fit in the left column (0..kColumnDividerX), leaving the
// right column's weather and electricity panel untouched.
void drawForecastRows(const LayoutResult& layout) {
  constexpr int kHourlyLabelBaseline = 52;
  constexpr int kHourlyGridTop = 58;
  constexpr int kHourlyColumnWidth = kColumnDividerX / 6;
  constexpr int kHourlyRowHeight = 78;
  constexpr int kHourlyGridBottom = kHourlyGridTop + kHourlyRowHeight * 2;

  display.setFont(&FreeSansBold9pt7b);
  display.setCursor(8, kHourlyLabelBaseline);
  display.print("Next 12 Hours");
  display.drawFastHLine(0, kHourlyGridTop - 1, kColumnDividerX, GxEPD_BLACK);
  u8g2.setFont(u8g2_font_6x12_tr);
  u8g2.setFontMode(1);
  u8g2.setFontDirection(0);
  u8g2.setForegroundColor(GxEPD_BLACK);

  const size_t hourlyCount = layout.hourlyRows.size() < 12
                                 ? layout.hourlyRows.size()
                                 : 12;
  for (size_t i = 0; i < hourlyCount; i++) {
    const auto& row = layout.hourlyRows[i];
    const int column = static_cast<int>(i % 6);
    const int gridRow = static_cast<int>(i / 6);
    const int x = column * kHourlyColumnWidth;
    const int y = kHourlyGridTop + gridRow * kHourlyRowHeight;

    display.setFont(&FreeSansBold9pt7b);
    display.setCursor(x + 10, y + 17);
    display.print(row.timeText.c_str());

    drawWeatherIcon(row.icon, x + kHourlyColumnWidth / 2, y + 40, 0.28);

    u8g2.drawUTF8(x + 8, y + 70, row.tempText.c_str());
    const int rainWidth = u8g2.getUTF8Width(row.rainChanceText.c_str());
    u8g2.drawUTF8(x + kHourlyColumnWidth - 8 - rainWidth,
                  y + 70, row.rainChanceText.c_str());
  }

  for (int column = 1; column < 6; column++) {
    display.drawFastVLine(column * kHourlyColumnWidth, kHourlyGridTop,
                          kHourlyGridBottom - kHourlyGridTop, GxEPD_BLACK);
  }
  display.drawFastHLine(0, kHourlyGridTop + kHourlyRowHeight,
                        kColumnDividerX, GxEPD_BLACK);

  constexpr int kDailyHeadingBaseline = kHourlyGridBottom + 19;
  constexpr int kDailyRowsTop = kHourlyGridBottom + 26;
  constexpr int kDailyRowHeight = 34;
  constexpr int kDailyIconCenterX = 135;
  constexpr int kDailyRainX = 185;
  constexpr int kDailyTemperatureX = 330;

  display.drawFastHLine(0, kHourlyGridBottom, kColumnDividerX, GxEPD_BLACK);
  display.setFont(&FreeSansBold9pt7b);
  display.setCursor(8, kDailyHeadingBaseline);
  display.print("7 Days");
  display.setFont(&FreeSans9pt7b);
  display.setCursor(kDailyRainX, kDailyHeadingBaseline);
  display.print("Rain");
  display.setCursor(kDailyTemperatureX, kDailyHeadingBaseline);
  display.print("Low / High");

  const size_t dailyCount = layout.dailyRows.size() < 7
                                ? layout.dailyRows.size()
                                : 7;
  for (size_t i = 0; i < dailyCount; i++) {
    const auto& row = layout.dailyRows[i];
    const int y = kDailyRowsTop + static_cast<int>(i) * kDailyRowHeight;
    const int midY = y + kDailyRowHeight / 2;

    display.setFont(&FreeSansBold9pt7b);
    display.setCursor(8, midY + 5);
    display.print(row.dateText.c_str());
    drawWeatherIcon(row.icon, kDailyIconCenterX, midY, 0.28);
    display.setFont(&FreeSans9pt7b);
    display.setCursor(kDailyRainX, midY + 5);
    display.print(row.rainChanceText.c_str());
    display.setFont(&FreeSansBold9pt7b);
    display.setCursor(kDailyTemperatureX, midY + 5);
    display.print(row.tempRangeText.c_str());

    if (i + 1 < dailyCount) {
      display.drawFastHLine(0, y + kDailyRowHeight,
                            kColumnDividerX, GxEPD_BLACK);
    }
  }
}

void drawNewsRows(const LayoutResult& layout) {
  constexpr int kNewsX = 10;
  constexpr int kNewsRight = kColumnDividerX - 10;
  constexpr int kNewsWidth = kNewsRight - kNewsX;
  constexpr int kTopLineHeight = 18;
  constexpr int kTopRowGap = 3;
  constexpr int kLatestLineHeight = 17;
  constexpr int kLatestRowHeight = kLatestLineHeight * 2;

  u8g2.setFont(u8g2_font_unifont_h_chinese4);
  u8g2.setFontMode(1);
  u8g2.setFontDirection(0);
  u8g2.setForegroundColor(GxEPD_BLACK);

  std::string sourceLine = layout.newsSourceText;
  if (!layout.newsUpdateText.empty()) {
    sourceLine += "  " + layout.newsUpdateText;
  }
  sourceLine = fitUtf8Line(sourceLine, kNewsWidth);
  u8g2.drawUTF8(kNewsX, 57, sourceLine.c_str());
  display.drawFastHLine(kNewsX, 66, kNewsWidth, GxEPD_BLACK);

  if (layout.newsUnavailable) {
    u8g2.drawUTF8(kNewsX, 105, layout.newsUnavailableText.c_str());
    return;
  }

  u8g2.drawUTF8(kNewsX, 88, layout.newsTopHeading.c_str());
  int y = 111;
  for (const auto& row : layout.newsTopRows) {
    const std::vector<std::string> lines = wrapUtf8(row.title, kNewsWidth, 2);
    for (const auto& line : lines) {
      u8g2.drawUTF8(kNewsX, y, line.c_str());
      y += kTopLineHeight;
    }
    y += kTopRowGap;
  }
  if (layout.newsTopRows.empty()) {
    u8g2.drawUTF8(kNewsX, y, "No headlines available");
    y += kTopLineHeight + 5;
  }

  const int latestHeadingY = y + 5;
  display.drawFastHLine(kNewsX, latestHeadingY - 14, kNewsWidth, GxEPD_BLACK);
  u8g2.drawUTF8(kNewsX, latestHeadingY, layout.newsLatestHeading.c_str());
  y = latestHeadingY + 24;

  constexpr int kLatestTimeWidth = 45;
  const int latestTitleWidth = kNewsWidth - kLatestTimeWidth - 8;
  for (const auto& row : layout.newsLatestRows) {
    const std::vector<std::string> lines = wrapUtf8(row.title, latestTitleWidth, 2);
    int lineY = y;
    for (size_t lineIndex = 0; lineIndex < lines.size(); lineIndex++) {
      u8g2.drawUTF8(kNewsX, lineY, lines[lineIndex].c_str());
      if (lineIndex == 0 && !row.publishedTime.empty()) {
        drawUtf8RightAligned(row.publishedTime, kNewsRight, lineY);
      }
      lineY += kLatestLineHeight;
    }
    y += kLatestRowHeight;
  }
  if (layout.newsLatestRows.empty()) {
    u8g2.drawUTF8(kNewsX, y, "No recent headlines");
  }
}

}  // namespace

void initDisplay() {
  SPI.begin(kEpdSckPin, -1, kEpdMosiPin, kEpdCsPin);
  display.init(115200);
  display.setRotation(0);
  u8g2.begin(display);
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
      case Screen::Forecast:
        drawForecastRows(layout);
        break;
      case Screen::HongKongNews:
      case Screen::UkNews:
        drawNewsRows(layout);
        break;
    }
    drawWeather(layout);
    drawElectricity(layout);
  } while (display.nextPage());

  display.hibernate();
}
