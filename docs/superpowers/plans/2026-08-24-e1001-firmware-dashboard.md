# reTerminal E1001 Firmware Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Arduino/PlatformIO firmware for a Seeed reTerminal E1001 that polls the existing public `GET https://dashboard.cchk.uk/api/v1/dashboard` endpoint and renders departures and weather to its 7.5" monochrome ePaper display, with full parity for null-value fallback text, cancelled/delayed distinction, and a live/stale/unavailable status banner.

**Architecture:** Two host-testable pure-logic modules (`dashboard_parser`: JSON → internal model, `layout`: internal model → draw instructions) live in `lib/`, testable under PlatformIO's `native` environment with zero hardware. Two device-only modules (`dashboard_client`: WiFi + HTTPS fetch with ETag, `render`: GxEPD2 drawing) live in `src/` alongside `main.cpp`, which wires everything together in a wake → fetch → parse → layout → render → deep-sleep cycle.

**Tech Stack:** PlatformIO, Arduino framework, ESP32-S3 (Seeed XIAO ESP32S3), ArduinoJson v7, Seeed_GxEPD2 (Seeed's GxEPD2 fork), Adafruit GFX Library, Unity test framework (via PlatformIO's `native` platform).

## Global Constraints

- Project root for this feature: `firmware/e1001/` inside this repo (not a separate repo).
- PlatformIO device environment: `board = seeed_xiao_esp32s3`, `platform = espressif32`, `framework = arduino`, `board_build.psram = enabled`.
- Libraries: `https://github.com/Seeed-Projects/Seeed_GxEPD2.git`, `adafruit/Adafruit GFX Library@^1.11.9`, `bblanchon/ArduinoJson@^7.0.4`.
- Display driver class: `GxEPD2_750_GDEY075T7` (800×480, UC8179 controller, GDEY075T7 panel).
- ePaper SPI pins: SCK=7, MOSI=9, CS=10, DC=11, RES=12, BUSY=13.
- API endpoint: `https://dashboard.cchk.uk/api/v1/dashboard` (default route `WFJ-EUS`, no query parameter needed).
- Deep-sleep wake interval: 5 minutes.
- `kMaxRows` initial value: `6` (may be tuned later once real font rendering is seen on-device; not part of this plan's scope to tune).
- Weather fields used: `temperatureC` and `condition` only.
- Wi-Fi credentials: hardcoded in `firmware/e1001/src/secrets.h`, which is gitignored; `firmware/e1001/src/secrets.h.example` is committed with placeholder values.
- Only `dashboard_parser` and `layout` get automated unit tests (PlatformIO `native` env, Unity). `dashboard_client`, `render`, and `main.cpp` are device-only and are verified by building for the device target (and, where the device is connected, flashing and reading serial output) — not by automated tests.

---

### Task 1: Scaffold the PlatformIO project and prove the native test harness works

**Files:**
- Create: `firmware/e1001/platformio.ini`
- Create: `firmware/e1001/.gitignore`
- Create: `firmware/e1001/test/test_sanity/test_main.cpp`

**Interfaces:**
- Produces: a working `pio test -e native` command that later tasks' real tests plug into.

- [ ] **Step 1: Confirm PlatformIO CLI is available, installing it if not**

Run: `pio --version`

If that fails with "command not found", install it:

Run: `pip install -U platformio`

Then re-run `pio --version` and confirm it prints a version number before continuing.

- [ ] **Step 2: Create the directory structure**

Run:
```bash
mkdir -p "D:/project/train_seeed/firmware/e1001/lib/dashboard_parser"
mkdir -p "D:/project/train_seeed/firmware/e1001/lib/layout"
mkdir -p "D:/project/train_seeed/firmware/e1001/src"
mkdir -p "D:/project/train_seeed/firmware/e1001/test/test_sanity"
mkdir -p "D:/project/train_seeed/firmware/e1001/test/test_dashboard_parser"
mkdir -p "D:/project/train_seeed/firmware/e1001/test/test_layout"
```

- [ ] **Step 3: Create `firmware/e1001/platformio.ini`**

```ini
[env:xiao_esp32s3]
platform = espressif32
board = seeed_xiao_esp32s3
framework = arduino
board_build.psram = enabled
monitor_speed = 115200
upload_speed = 921600
lib_deps =
    https://github.com/Seeed-Projects/Seeed_GxEPD2.git
    adafruit/Adafruit GFX Library@^1.11.9
    bblanchon/ArduinoJson@^7.0.4

[env:native]
platform = native
test_framework = unity
build_src_filter = -<*>
lib_deps =
    bblanchon/ArduinoJson@^7.0.4
```

- [ ] **Step 4: Create `firmware/e1001/.gitignore`**

```
.pio/
src/secrets.h
```

- [ ] **Step 5: Write a trivial sanity test**

Create `firmware/e1001/test/test_sanity/test_main.cpp`:

```cpp
#include <unity.h>

void test_arithmetic_sanity_check() {
  TEST_ASSERT_EQUAL(4, 2 + 2);
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_arithmetic_sanity_check);
  return UNITY_END();
}
```

- [ ] **Step 6: Run the native test environment and confirm it passes**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_sanity`
Expected: output ends with `1 Tests 0 Failures 0 Ignored` and `PASSED`.

- [ ] **Step 7: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/platformio.ini firmware/e1001/.gitignore firmware/e1001/test/test_sanity/test_main.cpp
git commit -m "chore: scaffold E1001 firmware PlatformIO project"
```

---

### Task 2: `dashboard_parser` — parse the departures panel

**Files:**
- Create: `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`
- Create: `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`
- Create: `firmware/e1001/test/test_dashboard_parser/test_main.cpp`

**Interfaces:**
- Produces (used by Task 3, Task 4, and `main.cpp` in Task 8):
  - `enum class PanelStatus { Live, Stale, Unavailable };`
  - `enum class DashboardStatus { Live, Partial, Unavailable };`
  - `struct ParsedDeparture` with fields: `std::string scheduledDeparture; std::string expectedDisplay; bool hasPlatform; std::string platform; std::string operatorName; bool hasCoachCount; int coachCount; bool isCancelled;`
  - `struct DeparturesPanel` with fields: `PanelStatus status; bool stale; bool hasUpdatedAt; std::string updatedAt; std::vector<ParsedDeparture> services;`
  - `struct WeatherPanel` (defined here, populated in Task 3) with fields: `PanelStatus status; bool stale; bool hasUpdatedAt; std::string updatedAt; bool hasTemperatureC; double temperatureC; bool hasCondition; std::string condition;`
  - `struct DashboardModel` with fields: `DashboardStatus status; DeparturesPanel departures; WeatherPanel weather;`
  - `struct ParseResult` with fields: `bool ok; std::string error; DashboardModel model;`
  - `ParseResult parseDashboard(const std::string& json);`

- [ ] **Step 1: Write the failing test for a full live departure**

Create `firmware/e1001/test/test_dashboard_parser/test_main.cpp`:

```cpp
#include <unity.h>
#include "dashboard_parser.h"

void test_parses_live_departure_with_all_fields() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "abc123",
          "scheduledDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDeparture": "2026-08-24T08:47:00+01:00",
          "expectedDisplay": "On time",
          "platform": "9",
          "platformStatus": "live",
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": null,
          "coachCount": 8,
          "status": "on_time",
          "isCancelled": false,
          "reason": null
        }
      ],
      "error": null
    },
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.departures.status == PanelStatus::Live);
  TEST_ASSERT_FALSE(result.model.departures.stale);
  TEST_ASSERT_TRUE(result.model.departures.hasUpdatedAt);
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:00:00.000Z", result.model.departures.updatedAt.c_str());
  TEST_ASSERT_EQUAL(1, (int)result.model.departures.services.size());

  const ParsedDeparture& departure = result.model.departures.services[0];
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:47:00+01:00", departure.scheduledDeparture.c_str());
  TEST_ASSERT_EQUAL_STRING("On time", departure.expectedDisplay.c_str());
  TEST_ASSERT_TRUE(departure.hasPlatform);
  TEST_ASSERT_EQUAL_STRING("9", departure.platform.c_str());
  TEST_ASSERT_EQUAL_STRING("London Northwestern Railway", departure.operatorName.c_str());
  TEST_ASSERT_TRUE(departure.hasCoachCount);
  TEST_ASSERT_EQUAL(8, departure.coachCount);
  TEST_ASSERT_FALSE(departure.isCancelled);
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  return UNITY_END();
}
```

- [ ] **Step 2: Create the header so the test can at least compile-fail meaningfully**

Create `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`:

```cpp
#pragma once

#include <string>
#include <vector>

enum class PanelStatus { Live, Stale, Unavailable };
enum class DashboardStatus { Live, Partial, Unavailable };

struct ParsedDeparture {
  std::string scheduledDeparture;
  std::string expectedDisplay;
  bool hasPlatform;
  std::string platform;
  std::string operatorName;
  bool hasCoachCount;
  int coachCount;
  bool isCancelled;
};

struct DeparturesPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  std::vector<ParsedDeparture> services;
};

struct WeatherPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  bool hasTemperatureC;
  double temperatureC;
  bool hasCondition;
  std::string condition;
};

struct DashboardModel {
  DashboardStatus status;
  DeparturesPanel departures;
  WeatherPanel weather;
};

struct ParseResult {
  bool ok;
  std::string error;
  DashboardModel model;
};

ParseResult parseDashboard(const std::string& json);
```

- [ ] **Step 3: Run the test and confirm it fails to link (no implementation yet)**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_dashboard_parser`
Expected: build/link error referencing an undefined reference to `parseDashboard`.

- [ ] **Step 4: Implement `parseDashboard` for the departures panel**

Create `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`:

```cpp
#include "dashboard_parser.h"

#include <ArduinoJson.h>

namespace {

PanelStatus parsePanelStatus(const char* value) {
  if (value == nullptr) return PanelStatus::Unavailable;
  std::string s(value);
  if (s == "live") return PanelStatus::Live;
  if (s == "stale") return PanelStatus::Stale;
  return PanelStatus::Unavailable;
}

DashboardStatus parseDashboardStatus(const char* value) {
  if (value == nullptr) return DashboardStatus::Unavailable;
  std::string s(value);
  if (s == "live") return DashboardStatus::Live;
  if (s == "partial") return DashboardStatus::Partial;
  return DashboardStatus::Unavailable;
}

void parseDeparturesPanel(JsonObject departuresJson, DeparturesPanel& departures) {
  departures.status = parsePanelStatus(departuresJson["status"] | "");
  departures.stale = departuresJson["stale"] | false;

  if (departuresJson["updatedAt"].is<const char*>()) {
    departures.hasUpdatedAt = true;
    departures.updatedAt = departuresJson["updatedAt"].as<const char*>();
  } else {
    departures.hasUpdatedAt = false;
  }

  for (JsonObject service : departuresJson["services"].as<JsonArray>()) {
    ParsedDeparture departure;
    departure.scheduledDeparture = std::string(service["scheduledDeparture"] | "");
    departure.expectedDisplay = std::string(service["expectedDisplay"] | "");
    departure.operatorName = std::string(service["operator"] | "");
    departure.isCancelled = service["isCancelled"] | false;

    if (service["platform"].is<const char*>()) {
      departure.hasPlatform = true;
      departure.platform = service["platform"].as<const char*>();
    } else {
      departure.hasPlatform = false;
    }

    if (service["coachCount"].is<int>()) {
      departure.hasCoachCount = true;
      departure.coachCount = service["coachCount"].as<int>();
    } else {
      departure.hasCoachCount = false;
    }

    departures.services.push_back(departure);
  }
}

}  // namespace

ParseResult parseDashboard(const std::string& json) {
  ParseResult result;
  result.ok = false;

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, json);
  if (error) {
    result.error = "JSON parse error";
    return result;
  }

  if (!doc["status"].is<const char*>() ||
      !doc["departures"].is<JsonObject>() ||
      !doc["weather"].is<JsonObject>()) {
    result.error = "Missing required top-level fields";
    return result;
  }

  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);

  result.ok = true;
  result.model = model;
  return result;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_dashboard_parser`
Expected: `1 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 6: Add and pass a test for null platform, null coachCount, and a cancelled service**

Add to `firmware/e1001/test/test_dashboard_parser/test_main.cpp`, above `int main`:

```cpp
void test_handles_null_platform_null_coach_count_and_cancelled_service() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "partial",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "services": [
        {
          "id": "def456",
          "scheduledDeparture": "2026-08-24T09:17:00+01:00",
          "expectedDeparture": null,
          "expectedDisplay": "Cancelled",
          "platform": null,
          "platformStatus": null,
          "operator": "London Northwestern Railway",
          "operatorCode": "LM",
          "finalDestination": null,
          "coachCount": null,
          "status": "cancelled",
          "isCancelled": true,
          "reason": "This service has been cancelled because of a shortage of train crew"
        }
      ],
      "error": null
    },
    "weather": {
      "status": "unavailable",
      "updatedAt": null,
      "stale": false,
      "temperatureC": null,
      "condition": null,
      "error": "Current weather is temporarily unavailable."
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL(1, (int)result.model.departures.services.size());

  const ParsedDeparture& departure = result.model.departures.services[0];
  TEST_ASSERT_FALSE(departure.hasPlatform);
  TEST_ASSERT_FALSE(departure.hasCoachCount);
  TEST_ASSERT_TRUE(departure.isCancelled);
  TEST_ASSERT_EQUAL_STRING("Cancelled", departure.expectedDisplay.c_str());
}
```

Update `int main` to also run it:

```cpp
int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  RUN_TEST(test_handles_null_platform_null_coach_count_and_cancelled_service);
  return UNITY_END();
}
```

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_dashboard_parser`
Expected: `2 Tests 0 Failures 0 Ignored`, `PASSED` (the implementation from Step 4 already handles this case; if it fails, fix `parseDeparturesPanel` before proceeding).

- [ ] **Step 7: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/lib/dashboard_parser firmware/e1001/test/test_dashboard_parser
git commit -m "feat: parse E1001 departures panel from dashboard JSON"
```

---

### Task 3: `dashboard_parser` — parse weather panel and top-level dashboard status

**Files:**
- Modify: `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`
- Modify: `firmware/e1001/test/test_dashboard_parser/test_main.cpp`

**Interfaces:**
- Consumes: `WeatherPanel`, `DashboardStatus`, `parsePanelStatus`, `parseDashboardStatus` from Task 2.
- Produces: `parseDashboard` now fully populates `model.weather` and `model.status` for all panel/dashboard status values, used by Task 4 and Task 8.

- [ ] **Step 1: Write the failing test for weather parsing and dashboard status values**

Add to `firmware/e1001/test/test_dashboard_parser/test_main.cpp`, above `int main`:

```cpp
void test_parses_weather_panel_and_dashboard_status() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.status == DashboardStatus::Live);
  TEST_ASSERT_TRUE(result.model.weather.status == PanelStatus::Live);
  TEST_ASSERT_FALSE(result.model.weather.stale);
  TEST_ASSERT_TRUE(result.model.weather.hasTemperatureC);
  TEST_ASSERT_EQUAL_FLOAT(12.4, result.model.weather.temperatureC);
  TEST_ASSERT_TRUE(result.model.weather.hasCondition);
  TEST_ASSERT_EQUAL_STRING("Partly cloudy", result.model.weather.condition.c_str());
}

void test_parses_stale_and_unavailable_panel_statuses() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "unavailable",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "stale", "updatedAt": "2026-08-24T07:30:00.000Z", "stale": true, "services": [], "error": null},
    "weather": {"status": "unavailable", "updatedAt": null, "stale": false, "temperatureC": null, "condition": null, "error": "Current weather is temporarily unavailable."}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.status == DashboardStatus::Unavailable);
  TEST_ASSERT_TRUE(result.model.departures.status == PanelStatus::Stale);
  TEST_ASSERT_TRUE(result.model.departures.stale);
  TEST_ASSERT_TRUE(result.model.weather.status == PanelStatus::Unavailable);
  TEST_ASSERT_FALSE(result.model.weather.hasUpdatedAt);
  TEST_ASSERT_FALSE(result.model.weather.hasTemperatureC);
  TEST_ASSERT_FALSE(result.model.weather.hasCondition);
}
```

Update `int main`:

```cpp
int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_parses_live_departure_with_all_fields);
  RUN_TEST(test_handles_null_platform_null_coach_count_and_cancelled_service);
  RUN_TEST(test_parses_weather_panel_and_dashboard_status);
  RUN_TEST(test_parses_stale_and_unavailable_panel_statuses);
  return UNITY_END();
}
```

- [ ] **Step 2: Run the test and confirm the two new tests fail**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_dashboard_parser`
Expected: the two new tests fail (weather fields all default-constructed/unset since `model.weather` is never populated yet).

- [ ] **Step 3: Implement weather panel parsing in `parseDashboard`**

In `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`, add a new function in the anonymous namespace, after `parseDeparturesPanel`:

```cpp
void parseWeatherPanel(JsonObject weatherJson, WeatherPanel& weather) {
  weather.status = parsePanelStatus(weatherJson["status"] | "");
  weather.stale = weatherJson["stale"] | false;

  if (weatherJson["updatedAt"].is<const char*>()) {
    weather.hasUpdatedAt = true;
    weather.updatedAt = weatherJson["updatedAt"].as<const char*>();
  } else {
    weather.hasUpdatedAt = false;
  }

  if (weatherJson["temperatureC"].is<double>()) {
    weather.hasTemperatureC = true;
    weather.temperatureC = weatherJson["temperatureC"].as<double>();
  } else {
    weather.hasTemperatureC = false;
  }

  if (weatherJson["condition"].is<const char*>()) {
    weather.hasCondition = true;
    weather.condition = weatherJson["condition"].as<const char*>();
  } else {
    weather.hasCondition = false;
  }
}
```

Then update `parseDashboard` to call it, replacing:

```cpp
  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);

  result.ok = true;
```

with:

```cpp
  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);
  parseWeatherPanel(doc["weather"].as<JsonObject>(), model.weather);

  result.ok = true;
```

- [ ] **Step 4: Run the test and confirm all four tests pass**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_dashboard_parser`
Expected: `4 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 5: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/lib/dashboard_parser firmware/e1001/test/test_dashboard_parser
git commit -m "feat: parse E1001 weather panel and dashboard status"
```

---

### Task 4: `layout` — departure rows, null fallback text, and emphasis

**Files:**
- Create: `firmware/e1001/lib/layout/layout.h`
- Create: `firmware/e1001/lib/layout/layout.cpp`
- Create: `firmware/e1001/test/test_layout/test_main.cpp`

**Interfaces:**
- Consumes: `DashboardModel`, `ParsedDeparture`, `DeparturesPanel`, `WeatherPanel`, `DashboardStatus` from Task 2/3.
- Produces (used by Task 5 and `render.cpp` in Task 7):
  - `constexpr int kMaxRows = 6;`
  - `enum class RowEmphasis { Normal, Delayed, Cancelled };`
  - `struct DepartureRow` with fields: `std::string time; std::string statusText; std::string platformText; std::string operatorText; bool hasCoachText; std::string coachText; RowEmphasis emphasis;`
  - `struct LayoutResult` with fields: `std::string statusBannerText; bool hasWeatherText; std::string weatherText; std::vector<DepartureRow> rows;` (`weatherText`/`statusBannerText` populated in Task 5)
  - `LayoutResult computeLayout(const DashboardModel& model, int maxRows);`

- [ ] **Step 1: Write the failing tests for row content and capping**

Create `firmware/e1001/test/test_layout/test_main.cpp`:

```cpp
#include <unity.h>
#include "layout.h"

namespace {

ParsedDeparture makeDeparture(const std::string& scheduledDeparture,
                               const std::string& expectedDisplay,
                               bool hasPlatform,
                               const std::string& platform,
                               bool hasCoachCount,
                               int coachCount,
                               bool isCancelled) {
  ParsedDeparture departure;
  departure.scheduledDeparture = scheduledDeparture;
  departure.expectedDisplay = expectedDisplay;
  departure.hasPlatform = hasPlatform;
  departure.platform = platform;
  departure.operatorName = "London Northwestern Railway";
  departure.hasCoachCount = hasCoachCount;
  departure.coachCount = coachCount;
  departure.isCancelled = isCancelled;
  return departure;
}

}  // namespace

void test_extracts_time_of_day_and_platform_text() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T08:47:00+01:00", "On time", true, "9", true, 8, false));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(1, (int)layout.rows.size());
  TEST_ASSERT_EQUAL_STRING("08:47", layout.rows[0].time.c_str());
  TEST_ASSERT_EQUAL_STRING("On time", layout.rows[0].statusText.c_str());
  TEST_ASSERT_EQUAL_STRING("Platform 9", layout.rows[0].platformText.c_str());
  TEST_ASSERT_EQUAL_STRING("London Northwestern Railway", layout.rows[0].operatorText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].hasCoachText);
  TEST_ASSERT_EQUAL_STRING("8 coaches", layout.rows[0].coachText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Normal);
}

void test_null_platform_and_coach_count_produce_fallback_text() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T09:17:00+01:00", "Cancelled", false, "", false, 0, true));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(1, (int)layout.rows.size());
  TEST_ASSERT_EQUAL_STRING("Platform TBC", layout.rows[0].platformText.c_str());
  TEST_ASSERT_FALSE(layout.rows[0].hasCoachText);
  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Cancelled);
}

void test_delayed_departure_gets_delayed_emphasis() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.departures.services.push_back(
      makeDeparture("2026-08-24T09:02:00+01:00", "09:11", true, "4", true, 4, false));

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_TRUE(layout.rows[0].emphasis == RowEmphasis::Delayed);
}

void test_row_count_is_capped_at_max_rows() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  for (int i = 0; i < 10; i++) {
    model.departures.services.push_back(
        makeDeparture("2026-08-24T08:00:00+01:00", "On time", true, "1", false, 0, false));
  }

  LayoutResult layout = computeLayout(model, 6);

  TEST_ASSERT_EQUAL(6, (int)layout.rows.size());
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_extracts_time_of_day_and_platform_text);
  RUN_TEST(test_null_platform_and_coach_count_produce_fallback_text);
  RUN_TEST(test_delayed_departure_gets_delayed_emphasis);
  RUN_TEST(test_row_count_is_capped_at_max_rows);
  return UNITY_END();
}
```

- [ ] **Step 2: Create the header**

Create `firmware/e1001/lib/layout/layout.h`:

```cpp
#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"

constexpr int kMaxRows = 6;

enum class RowEmphasis { Normal, Delayed, Cancelled };

struct DepartureRow {
  std::string time;
  std::string statusText;
  std::string platformText;
  std::string operatorText;
  bool hasCoachText;
  std::string coachText;
  RowEmphasis emphasis;
};

struct LayoutResult {
  std::string statusBannerText;
  bool hasWeatherText;
  std::string weatherText;
  std::vector<DepartureRow> rows;
};

LayoutResult computeLayout(const DashboardModel& model, int maxRows);
```

- [ ] **Step 3: Run the test and confirm it fails to link**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_layout`
Expected: undefined reference to `computeLayout`.

- [ ] **Step 4: Implement `computeLayout` for departure rows**

Create `firmware/e1001/lib/layout/layout.cpp`:

```cpp
#include "layout.h"

namespace {

RowEmphasis emphasisFor(const ParsedDeparture& departure) {
  if (departure.isCancelled) return RowEmphasis::Cancelled;
  if (departure.expectedDisplay != "On time") return RowEmphasis::Delayed;
  return RowEmphasis::Normal;
}

std::string extractTimeOfDay(const std::string& isoTimestamp) {
  if (isoTimestamp.size() < 16) return isoTimestamp;
  return isoTimestamp.substr(11, 5);
}

}  // namespace

LayoutResult computeLayout(const DashboardModel& model, int maxRows) {
  LayoutResult layout;
  layout.hasWeatherText = false;

  int rowCount = static_cast<int>(model.departures.services.size());
  int rowsToRender = rowCount < maxRows ? rowCount : maxRows;

  for (int i = 0; i < rowsToRender; i++) {
    const ParsedDeparture& departure = model.departures.services[i];
    DepartureRow row;
    row.time = extractTimeOfDay(departure.scheduledDeparture);
    row.statusText = departure.expectedDisplay;
    row.platformText = departure.hasPlatform ? ("Platform " + departure.platform) : "Platform TBC";
    row.operatorText = departure.operatorName;
    row.hasCoachText = departure.hasCoachCount;
    if (row.hasCoachText) {
      row.coachText = std::to_string(departure.coachCount) + " coaches";
    }
    row.emphasis = emphasisFor(departure);
    layout.rows.push_back(row);
  }

  return layout;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_layout`
Expected: `4 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 6: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/lib/layout firmware/e1001/test/test_layout
git commit -m "feat: compute E1001 departure row layout"
```

---

### Task 5: `layout` — status banner and weather text

**Files:**
- Modify: `firmware/e1001/lib/layout/layout.cpp`
- Modify: `firmware/e1001/test/test_layout/test_main.cpp`

**Interfaces:**
- Consumes: `DashboardStatus`, `WeatherPanel` from Task 2/3; `LayoutResult` fields `statusBannerText`/`hasWeatherText`/`weatherText` from Task 4.
- Produces: `computeLayout` now fully populates `statusBannerText` and `weatherText`, used by `render.cpp` in Task 7.

- [ ] **Step 1: Write the failing tests**

Add to `firmware/e1001/test/test_layout/test_main.cpp`, above `int main`:

```cpp
void test_status_banner_text_for_each_dashboard_status() {
  DashboardModel liveModel;
  liveModel.status = DashboardStatus::Live;
  TEST_ASSERT_EQUAL_STRING("Live data", computeLayout(liveModel, kMaxRows).statusBannerText.c_str());

  DashboardModel partialModel;
  partialModel.status = DashboardStatus::Partial;
  TEST_ASSERT_EQUAL_STRING("Some data is stale or unavailable",
                            computeLayout(partialModel, kMaxRows).statusBannerText.c_str());

  DashboardModel unavailableModel;
  unavailableModel.status = DashboardStatus::Unavailable;
  TEST_ASSERT_EQUAL_STRING("Live data is unavailable",
                            computeLayout(unavailableModel, kMaxRows).statusBannerText.c_str());
}

void test_weather_text_formatting_and_missing_weather() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasTemperatureC = true;
  model.weather.temperatureC = 12.4;
  model.weather.hasCondition = true;
  model.weather.condition = "Partly cloudy";

  LayoutResult layout = computeLayout(model, kMaxRows);
  TEST_ASSERT_TRUE(layout.hasWeatherText);
  TEST_ASSERT_EQUAL_STRING("12C, Partly cloudy", layout.weatherText.c_str());

  DashboardModel modelWithoutWeather;
  modelWithoutWeather.status = DashboardStatus::Partial;
  modelWithoutWeather.weather.hasTemperatureC = false;
  modelWithoutWeather.weather.hasCondition = false;

  LayoutResult layoutWithoutWeather = computeLayout(modelWithoutWeather, kMaxRows);
  TEST_ASSERT_FALSE(layoutWithoutWeather.hasWeatherText);
}
```

Update `int main`:

```cpp
int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_extracts_time_of_day_and_platform_text);
  RUN_TEST(test_null_platform_and_coach_count_produce_fallback_text);
  RUN_TEST(test_delayed_departure_gets_delayed_emphasis);
  RUN_TEST(test_row_count_is_capped_at_max_rows);
  RUN_TEST(test_status_banner_text_for_each_dashboard_status);
  RUN_TEST(test_weather_text_formatting_and_missing_weather);
  return UNITY_END();
}
```

- [ ] **Step 2: Run the test and confirm the two new tests fail**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_layout`
Expected: the two new tests fail (`statusBannerText` and `weatherText` are empty/unset).

- [ ] **Step 3: Implement banner and weather text in `computeLayout`**

In `firmware/e1001/lib/layout/layout.cpp`, add to the anonymous namespace, after `extractTimeOfDay`:

```cpp
std::string bannerTextFor(DashboardStatus status) {
  switch (status) {
    case DashboardStatus::Live: return "Live data";
    case DashboardStatus::Partial: return "Some data is stale or unavailable";
    case DashboardStatus::Unavailable: return "Live data is unavailable";
  }
  return "";
}
```

Then update the start of `computeLayout`, replacing:

```cpp
LayoutResult computeLayout(const DashboardModel& model, int maxRows) {
  LayoutResult layout;
  layout.hasWeatherText = false;
```

with:

```cpp
LayoutResult computeLayout(const DashboardModel& model, int maxRows) {
  LayoutResult layout;
  layout.statusBannerText = bannerTextFor(model.status);

  if (model.weather.hasTemperatureC && model.weather.hasCondition) {
    layout.hasWeatherText = true;
    layout.weatherText = std::to_string(static_cast<int>(model.weather.temperatureC)) +
                          "C, " + model.weather.condition;
  } else {
    layout.hasWeatherText = false;
  }
```

- [ ] **Step 4: Run the test and confirm all six tests pass**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native -f test_layout`
Expected: `6 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 5: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/lib/layout firmware/e1001/test/test_layout
git commit -m "feat: add E1001 status banner and weather text to layout"
```

---

### Task 6: `dashboard_client` — WiFi connection and HTTPS fetch with ETag

**Files:**
- Create: `firmware/e1001/src/secrets.h.example`
- Create: `firmware/e1001/src/dashboard_client.h`
- Create: `firmware/e1001/src/dashboard_client.cpp`

**Interfaces:**
- Produces (used by `main.cpp` in Task 8):
  - `enum class FetchStatus { NotModified, Updated, Failed };`
  - `struct FetchResult` with fields: `FetchStatus status; std::string body; std::string etag;`
  - `bool connectWiFi(uint32_t timeoutMs);`
  - `FetchResult fetchDashboard(const std::string& lastEtag);`
- This file is device-only (depends on `WiFi.h`, `WiFiClientSecure.h`, `HTTPClient.h`) and is not covered by `native` unit tests. It is verified by building for the `xiao_esp32s3` environment.

- [ ] **Step 1: Create the secrets template**

Create `firmware/e1001/src/secrets.h.example`:

```cpp
#pragma once

#define WIFI_SSID "your-2.4ghz-ssid"
#define WIFI_PASSWORD "your-wifi-password"
```

Then copy it to the real (gitignored) secrets file and fill in your actual Wi-Fi credentials:

Run: `cp "D:/project/train_seeed/firmware/e1001/src/secrets.h.example" "D:/project/train_seeed/firmware/e1001/src/secrets.h"`

Edit `firmware/e1001/src/secrets.h` and replace the placeholder `WIFI_SSID`/`WIFI_PASSWORD` values with your real 2.4GHz network credentials.

- [ ] **Step 2: Create the header**

Create `firmware/e1001/src/dashboard_client.h`:

```cpp
#pragma once

#include <cstdint>
#include <string>

enum class FetchStatus { NotModified, Updated, Failed };

struct FetchResult {
  FetchStatus status;
  std::string body;
  std::string etag;
};

bool connectWiFi(uint32_t timeoutMs);
FetchResult fetchDashboard(const std::string& lastEtag);
```

- [ ] **Step 3: Implement WiFi connection and the HTTPS fetch**

Create `firmware/e1001/src/dashboard_client.cpp`:

```cpp
#include "dashboard_client.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

namespace {
const char* kDashboardUrl = "https://dashboard.cchk.uk/api/v1/dashboard";
}  // namespace

bool connectWiFi(uint32_t timeoutMs) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > timeoutMs) {
      return false;
    }
    delay(200);
  }
  return true;
}

FetchResult fetchDashboard(const std::string& lastEtag) {
  FetchResult result;
  result.status = FetchStatus::Failed;

  // No certificate pinning: acceptable trade-off for a public, read-only
  // endpoint on a battery-powered device with no sensitive data exchanged.
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, kDashboardUrl)) {
    return result;
  }

  if (!lastEtag.empty()) {
    http.addHeader("If-None-Match", lastEtag.c_str());
  }

  int httpCode = http.GET();

  if (httpCode == 304) {
    result.status = FetchStatus::NotModified;
  } else if (httpCode == 200) {
    result.status = FetchStatus::Updated;
    result.body = std::string(http.getString().c_str());
    result.etag = std::string(http.header("ETag").c_str());
  }

  http.end();
  return result;
}
```

- [ ] **Step 4: Build for the device target and confirm it compiles**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio run -e xiao_esp32s3`
Expected: `SUCCESS` at the end of the build output. If it fails, read the compiler error and fix `dashboard_client.cpp`/`dashboard_client.h` before proceeding — do not skip this check, since this file has no automated test coverage.

- [ ] **Step 5: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/src/secrets.h.example firmware/e1001/src/dashboard_client.h firmware/e1001/src/dashboard_client.cpp
git commit -m "feat: add E1001 WiFi connection and dashboard HTTPS fetch"
```

Note: `firmware/e1001/src/secrets.h` itself is never committed (it's gitignored from Task 1).

---

### Task 7: `render` — draw the layout to the ePaper display

**Files:**
- Create: `firmware/e1001/src/render.h`
- Create: `firmware/e1001/src/render.cpp`

**Interfaces:**
- Consumes: `LayoutResult`, `DepartureRow`, `RowEmphasis` from Task 4/5.
- Produces (used by `main.cpp` in Task 8):
  - `void initDisplay();`
  - `void renderDashboard(const LayoutResult& layout);`
- Device-only (depends on `SPI.h`, `GxEPD2_BW.h`, GxEPD2 fonts); not covered by `native` unit tests. Verified by building for the `xiao_esp32s3` environment, and — if you want to see it actually render — by flashing to the connected device (COM3) and inspecting the physical panel, since this session cannot see the ePaper screen directly.

- [ ] **Step 1: Create the header**

Create `firmware/e1001/src/render.h`:

```cpp
#pragma once

#include "layout.h"

void initDisplay();
void renderDashboard(const LayoutResult& layout);
```

- [ ] **Step 2: Implement display initialization and drawing**

Create `firmware/e1001/src/render.cpp`:

```cpp
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
```

- [ ] **Step 3: Build for the device target and confirm it compiles**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio run -e xiao_esp32s3`
Expected: `SUCCESS`. If the `GxEPD2_750_GDEY075T7` class name or font headers don't match what `Seeed_GxEPD2` actually installs, the compiler error will name the missing symbol/header — check `.pio/libdeps/xiao_esp32s3/Seeed_GxEPD2/src/` for the exact available class name and font paths, and adjust `render.cpp` accordingly before proceeding.

- [ ] **Step 4: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/src/render.h firmware/e1001/src/render.cpp
git commit -m "feat: render E1001 dashboard layout to the ePaper display"
```

---

### Task 8: `main.cpp` — wire the wake/fetch/render/sleep cycle together

**Files:**
- Create: `firmware/e1001/src/main.cpp`

**Interfaces:**
- Consumes: everything produced by Tasks 2–7 (`parseDashboard`, `computeLayout`/`kMaxRows`, `connectWiFi`/`fetchDashboard`/`FetchStatus`, `initDisplay`/`renderDashboard`).
- Device-only; not covered by `native` unit tests. Verified by building and, since the device is connected to this machine on COM3, by flashing and reading serial output.

- [ ] **Step 1: Implement `main.cpp`**

Create `firmware/e1001/src/main.cpp`:

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <cstring>

#include "dashboard_client.h"
#include "dashboard_parser.h"
#include "layout.h"
#include "render.h"

namespace {
constexpr uint64_t kSleepMicroseconds = 5ULL * 60 * 1000000;
RTC_DATA_ATTR char storedEtag[128] = "";

void goToSleep() {
  WiFi.disconnect(true);
  esp_sleep_enable_timer_wakeup(kSleepMicroseconds);
  esp_deep_sleep_start();
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("E1001 waking up");

  initDisplay();

  if (!connectWiFi(15000)) {
    Serial.println("WiFi connect failed, keeping existing screen");
    goToSleep();
    return;
  }

  FetchResult fetch = fetchDashboard(std::string(storedEtag));

  if (fetch.status == FetchStatus::NotModified) {
    Serial.println("304 Not Modified, skipping redraw");
  } else if (fetch.status == FetchStatus::Updated) {
    ParseResult parsed = parseDashboard(fetch.body);
    if (parsed.ok) {
      LayoutResult layout = computeLayout(parsed.model, kMaxRows);
      renderDashboard(layout);
      strncpy(storedEtag, fetch.etag.c_str(), sizeof(storedEtag) - 1);
      storedEtag[sizeof(storedEtag) - 1] = '\0';
      Serial.println("Rendered updated dashboard");
    } else {
      Serial.print("Parse failed, keeping existing screen: ");
      Serial.println(parsed.error.c_str());
    }
  } else {
    Serial.println("Fetch failed, keeping existing screen");
  }

  goToSleep();
}

void loop() {
  // Unreachable: setup() always ends in deep sleep, which resets execution
  // back to setup() on wake.
}
```

- [ ] **Step 2: Build for the device target and confirm it compiles**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio run -e xiao_esp32s3`
Expected: `SUCCESS`.

- [ ] **Step 3: Confirm the native test environment still passes (no regression from adding device-only code)**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio test -e native`
Expected: all `test_sanity`, `test_dashboard_parser`, and `test_layout` tests still pass (native env excludes `src/`, so `main.cpp` cannot break it — this step confirms that isolation is actually working).

- [ ] **Step 4: Commit**

```bash
cd "D:/project/train_seeed"
git add firmware/e1001/src/main.cpp
git commit -m "feat: wire E1001 wake/fetch/render/sleep cycle in main.cpp"
```

---

### Task 9: Flash to the connected device and verify via serial monitor

**Files:** none (verification-only task).

**Interfaces:** none — this task exercises the whole firmware built in Tasks 1–8 against the real device on COM3.

- [ ] **Step 1: Confirm the device is still connected**

Run (PowerShell): `Get-PnpDevice | Where-Object { $_.InstanceId -match 'VID_1A86' } | Select-Object FriendlyName, Status`
Expected: `USB-SERIAL CH340 (COM3)`, `Status: OK`. If it's not there, reconnect the E1001 via USB-C before continuing.

- [ ] **Step 2: Build and upload the firmware**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio run -e xiao_esp32s3 -t upload --upload-port COM3`
Expected: output ends with `SUCCESS` after writing the flash.

- [ ] **Step 3: Watch the serial monitor through one full wake cycle**

Run: `cd "D:/project/train_seeed/firmware/e1001" && pio device monitor -p COM3 -b 115200`
Expected: within a few seconds you see `E1001 waking up`, then either `Rendered updated dashboard`, `304 Not Modified, skipping redraw`, or a WiFi/fetch failure line. If it's a failure line, check `firmware/e1001/src/secrets.h` has the correct 2.4GHz Wi-Fi credentials (the E1001 does not support 5GHz networks) before treating this as a firmware bug.

- [ ] **Step 4: Visually confirm the physical panel**

With the monitor still running (or after unplugging serial and letting it run standalone), check the physical E1001 screen shows: the status banner, compact weather, and departure rows with time/status/platform/operator/coach-count text, matching the design in `docs/superpowers/specs/2026-08-24-e1001-firmware-dashboard-design.md`. This step requires the user to look at the physical screen and confirm it, since it can't be verified from this session.
