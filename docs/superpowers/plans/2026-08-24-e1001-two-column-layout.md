# E1001 Two-Column Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the E1001 firmware's screen into two columns — up to 8 departure rows on the left, weather detail and Octopus Agile pricing (top/bottom split) on the right — and change the header title from the live/stale sentence to "Watford to Euston" with a short status word alongside it.

**Architecture:** Extends the existing `dashboard_parser`/`layout` pure-logic modules (host-tested) with the new fields and row shapes, then updates the device-only `render.cpp` to draw the two-column layout. Depends on the backend `electricity` panel from `docs/superpowers/plans/2026-08-24-agile-electricity-panel.md` already being deployed, since this firmware assumes `doc["electricity"]` is always present in the API response.

**Tech Stack:** Same as the existing E1001 firmware — PlatformIO, Arduino framework, ArduinoJson, Seeed_GxEPD2, Unity (`native` env tests).

## Global Constraints

- `kMaxRows` changes from `6` to `8`.
- Departure rows show the short `operatorCode` (e.g. "LM", "LO"), not the
  full operator name, and coach count abbreviated as e.g. "8coa" instead
  of "8 coaches" — there is not enough width in the narrower left column.
- The header's status text shortens from full sentences ("Live data",
  "Some data is stale or unavailable", "Live data is unavailable") to
  single words ("Live", "Partial", "Unavailable"), to fit alongside the
  new "Watford to Euston" title.
- Weather detail lines (feels-like, humidity, precipitation, 6-hour rain
  chance, pressure) are omitted individually when their source field is
  absent — never rendered as blank or zero.
- Electricity pricing shows at most 6 slots (3 hours), each as start time
  and price in pence to one decimal place (e.g. "14:00  20.5p").
- All new pure-logic behavior (parsing, layout) gets `native`-env unit
  tests, per this firmware's existing testing approach. The two-column
  drawing in `render.cpp` is device-only, verified by building for
  `xiao_esp32s3` and, since the device is connected, by flashing and
  visually confirming the physical panel.

---

### Task 1: Parse `operatorCode` and extended weather fields

**Files:**
- Modify: `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`
- Modify: `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`
- Modify: `firmware/e1001/test/test_dashboard_parser/test_main.cpp`

**Interfaces:**
- Produces (used by Task 3): `ParsedDeparture.operatorCode` (`std::string`,
  always populated, matching the existing `operatorName` non-nullable
  pattern); `WeatherPanel` gains `hasApparentTemperatureC`/
  `apparentTemperatureC`, `hasRelativeHumidityPercent`/
  `relativeHumidityPercent`, `hasPrecipitationMm`/`precipitationMm`,
  `hasRainChanceNext6HoursPercent`/`rainChanceNext6HoursPercent`,
  `hasPressureMslHpa`/`pressureMslHpa` (each following the existing
  `hasTemperatureC`/`temperatureC` nullable pattern).

- [ ] **Step 1: Write the failing tests**

Add to `firmware/e1001/test/test_dashboard_parser/test_main.cpp`, above `int main`:

```cpp
void test_parses_operator_code_and_extended_weather_fields() {
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
      "apparentTemperatureC": 11.1,
      "relativeHumidityPercent": 63,
      "precipitationMm": 0,
      "rainChanceNext6HoursPercent": 20,
      "pressureMslHpa": 1016.4,
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_EQUAL_STRING("LM", result.model.departures.services[0].operatorCode.c_str());

  const WeatherPanel& weather = result.model.weather;
  TEST_ASSERT_TRUE(weather.hasApparentTemperatureC);
  TEST_ASSERT_EQUAL_FLOAT(11.1, weather.apparentTemperatureC);
  TEST_ASSERT_TRUE(weather.hasRelativeHumidityPercent);
  TEST_ASSERT_EQUAL_FLOAT(63, weather.relativeHumidityPercent);
  TEST_ASSERT_TRUE(weather.hasPrecipitationMm);
  TEST_ASSERT_EQUAL_FLOAT(0, weather.precipitationMm);
  TEST_ASSERT_TRUE(weather.hasRainChanceNext6HoursPercent);
  TEST_ASSERT_EQUAL_FLOAT(20, weather.rainChanceNext6HoursPercent);
  TEST_ASSERT_TRUE(weather.hasPressureMslHpa);
  TEST_ASSERT_EQUAL_FLOAT(1016.4, weather.pressureMslHpa);
}

void test_extended_weather_fields_absent_when_null() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "partial",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "temperatureC": 12.4,
      "condition": "Partly cloudy",
      "apparentTemperatureC": 11.1,
      "relativeHumidityPercent": 63,
      "precipitationMm": 0,
      "rainChanceNext6HoursPercent": null,
      "pressureMslHpa": null,
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_FALSE(result.model.weather.hasRainChanceNext6HoursPercent);
  TEST_ASSERT_FALSE(result.model.weather.hasPressureMslHpa);
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
  RUN_TEST(test_parses_operator_code_and_extended_weather_fields);
  RUN_TEST(test_extended_weather_fields_absent_when_null);
  return UNITY_END();
}
```

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `cd firmware/e1001 && pio test -e native -f test_dashboard_parser`
Expected: the 2 new tests fail (`operatorCode` doesn't exist on `ParsedDeparture` yet — this is a compile error, so the whole test binary fails to build).

- [ ] **Step 3: Add `operatorCode` to `ParsedDeparture` and the extended fields to `WeatherPanel`**

In `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`, change:

```cpp
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
```

to:

```cpp
struct ParsedDeparture {
  std::string scheduledDeparture;
  std::string expectedDisplay;
  bool hasPlatform;
  std::string platform;
  std::string operatorName;
  std::string operatorCode;
  bool hasCoachCount;
  int coachCount;
  bool isCancelled;
};
```

and change:

```cpp
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
```

to:

```cpp
struct WeatherPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  bool hasTemperatureC;
  double temperatureC;
  bool hasCondition;
  std::string condition;
  bool hasApparentTemperatureC;
  double apparentTemperatureC;
  bool hasRelativeHumidityPercent;
  double relativeHumidityPercent;
  bool hasPrecipitationMm;
  double precipitationMm;
  bool hasRainChanceNext6HoursPercent;
  double rainChanceNext6HoursPercent;
  bool hasPressureMslHpa;
  double pressureMslHpa;
};
```

- [ ] **Step 4: Populate the new fields in `dashboard_parser.cpp`**

In `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`, change:

```cpp
    departure.operatorName = std::string(service["operator"] | "");
    departure.isCancelled = service["isCancelled"] | false;
```

to:

```cpp
    departure.operatorName = std::string(service["operator"] | "");
    departure.operatorCode = std::string(service["operatorCode"] | "");
    departure.isCancelled = service["isCancelled"] | false;
```

and change the end of `parseWeatherPanel` from:

```cpp
  if (weatherJson["condition"].is<const char*>()) {
    weather.hasCondition = true;
    weather.condition = weatherJson["condition"].as<const char*>();
  } else {
    weather.hasCondition = false;
  }
}
```

to:

```cpp
  if (weatherJson["condition"].is<const char*>()) {
    weather.hasCondition = true;
    weather.condition = weatherJson["condition"].as<const char*>();
  } else {
    weather.hasCondition = false;
  }

  if (weatherJson["apparentTemperatureC"].is<double>()) {
    weather.hasApparentTemperatureC = true;
    weather.apparentTemperatureC = weatherJson["apparentTemperatureC"].as<double>();
  } else {
    weather.hasApparentTemperatureC = false;
  }

  if (weatherJson["relativeHumidityPercent"].is<double>()) {
    weather.hasRelativeHumidityPercent = true;
    weather.relativeHumidityPercent = weatherJson["relativeHumidityPercent"].as<double>();
  } else {
    weather.hasRelativeHumidityPercent = false;
  }

  if (weatherJson["precipitationMm"].is<double>()) {
    weather.hasPrecipitationMm = true;
    weather.precipitationMm = weatherJson["precipitationMm"].as<double>();
  } else {
    weather.hasPrecipitationMm = false;
  }

  if (weatherJson["rainChanceNext6HoursPercent"].is<double>()) {
    weather.hasRainChanceNext6HoursPercent = true;
    weather.rainChanceNext6HoursPercent = weatherJson["rainChanceNext6HoursPercent"].as<double>();
  } else {
    weather.hasRainChanceNext6HoursPercent = false;
  }

  if (weatherJson["pressureMslHpa"].is<double>()) {
    weather.hasPressureMslHpa = true;
    weather.pressureMslHpa = weatherJson["pressureMslHpa"].as<double>();
  } else {
    weather.hasPressureMslHpa = false;
  }
}
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `cd firmware/e1001 && pio test -e native -f test_dashboard_parser`
Expected: `6 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 6: Commit**

```bash
git add firmware/e1001/lib/dashboard_parser firmware/e1001/test/test_dashboard_parser
git commit -m "feat: parse operator code and extended weather fields on E1001"
```

---

### Task 2: Parse the Electricity panel

**Files:**
- Modify: `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`
- Modify: `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`
- Modify: `firmware/e1001/test/test_dashboard_parser/test_main.cpp`

**Interfaces:**
- Produces (used by Task 3):
  - `struct ElectricityPriceSlot { std::string validFrom; std::string validTo; double pricePencePerKwh; };`
  - `struct ElectricityPanel { PanelStatus status; bool stale; bool hasUpdatedAt; std::string updatedAt; std::vector<ElectricityPriceSlot> prices; };`
  - `DashboardModel.electricity` (`ElectricityPanel`)
- `parseDashboard` now requires `doc["electricity"]` to be present (matching `departures`/`weather`), since the backend always includes it.

- [ ] **Step 1: Write the failing test**

Add to `firmware/e1001/test/test_dashboard_parser/test_main.cpp`, above `int main`:

```cpp
void test_parses_electricity_panel_skipping_malformed_slots() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null},
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [
        {"validFrom": "2026-08-24T08:00:00Z", "validTo": "2026-08-24T08:30:00Z", "pricePencePerKwh": 20.5},
        {"validFrom": "2026-08-24T08:30:00Z", "validTo": "2026-08-24T09:00:00Z", "pricePencePerKwh": null}
      ],
      "error": null
    }
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_TRUE(result.ok);
  TEST_ASSERT_TRUE(result.model.electricity.status == PanelStatus::Live);
  TEST_ASSERT_EQUAL(1, (int)result.model.electricity.prices.size());
  TEST_ASSERT_EQUAL_STRING("2026-08-24T08:00:00Z", result.model.electricity.prices[0].validFrom.c_str());
  TEST_ASSERT_EQUAL_FLOAT(20.5, result.model.electricity.prices[0].pricePencePerKwh);
}

void test_rejects_dashboard_missing_electricity_panel() {
  const std::string json = R"({
    "version": 1,
    "generatedAt": "2026-08-24T08:00:00.000Z",
    "status": "live",
    "route": {"origin": {"name": "Watford Junction", "crs": "WFJ"}, "destination": {"name": "London Euston", "crs": "EUS"}},
    "departures": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "services": [], "error": null},
    "weather": {"status": "live", "updatedAt": "2026-08-24T08:00:00.000Z", "stale": false, "temperatureC": 12.4, "condition": "Partly cloudy", "error": null}
  })";

  ParseResult result = parseDashboard(json);

  TEST_ASSERT_FALSE(result.ok);
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
  RUN_TEST(test_parses_operator_code_and_extended_weather_fields);
  RUN_TEST(test_extended_weather_fields_absent_when_null);
  RUN_TEST(test_parses_electricity_panel_skipping_malformed_slots);
  RUN_TEST(test_rejects_dashboard_missing_electricity_panel);
  return UNITY_END();
}
```

- [ ] **Step 2: Run the tests to verify the two new ones fail**

Run: `cd firmware/e1001 && pio test -e native -f test_dashboard_parser`
Expected: compile failure (`DashboardModel` has no member `electricity`).

- [ ] **Step 3: Add the electricity types**

In `firmware/e1001/lib/dashboard_parser/dashboard_parser.h`, add after the `WeatherPanel` struct:

```cpp
struct ElectricityPriceSlot {
  std::string validFrom;
  std::string validTo;
  double pricePencePerKwh;
};

struct ElectricityPanel {
  PanelStatus status;
  bool stale;
  bool hasUpdatedAt;
  std::string updatedAt;
  std::vector<ElectricityPriceSlot> prices;
};
```

Change:

```cpp
struct DashboardModel {
  DashboardStatus status;
  DeparturesPanel departures;
  WeatherPanel weather;
};
```

to:

```cpp
struct DashboardModel {
  DashboardStatus status;
  DeparturesPanel departures;
  WeatherPanel weather;
  ElectricityPanel electricity;
};
```

- [ ] **Step 4: Implement `parseElectricityPanel` and wire it into `parseDashboard`**

In `firmware/e1001/lib/dashboard_parser/dashboard_parser.cpp`, add to the anonymous namespace, after `parseWeatherPanel`:

```cpp
void parseElectricityPanel(JsonObject electricityJson, ElectricityPanel& electricity) {
  electricity.status = parsePanelStatus(electricityJson["status"] | "");
  electricity.stale = electricityJson["stale"] | false;

  if (electricityJson["updatedAt"].is<const char*>()) {
    electricity.hasUpdatedAt = true;
    electricity.updatedAt = electricityJson["updatedAt"].as<const char*>();
  } else {
    electricity.hasUpdatedAt = false;
  }

  for (JsonObject slot : electricityJson["prices"].as<JsonArray>()) {
    std::string validFrom = std::string(slot["validFrom"] | "");
    std::string validTo = std::string(slot["validTo"] | "");
    if (validFrom.empty() || validTo.empty() || !slot["pricePencePerKwh"].is<double>()) {
      continue;
    }
    ElectricityPriceSlot priceSlot;
    priceSlot.validFrom = validFrom;
    priceSlot.validTo = validTo;
    priceSlot.pricePencePerKwh = slot["pricePencePerKwh"].as<double>();
    electricity.prices.push_back(priceSlot);
  }
}
```

Change the top-level required-fields check in `parseDashboard` from:

```cpp
  if (!doc["status"].is<const char*>() ||
      !doc["departures"].is<JsonObject>() ||
      !doc["weather"].is<JsonObject>()) {
    result.error = "Missing required top-level fields";
    return result;
  }
```

to:

```cpp
  if (!doc["status"].is<const char*>() ||
      !doc["departures"].is<JsonObject>() ||
      !doc["weather"].is<JsonObject>() ||
      !doc["electricity"].is<JsonObject>()) {
    result.error = "Missing required top-level fields";
    return result;
  }
```

and change:

```cpp
  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);
  parseWeatherPanel(doc["weather"].as<JsonObject>(), model.weather);

  result.ok = true;
```

to:

```cpp
  DashboardModel model;
  model.status = parseDashboardStatus(doc["status"].as<const char*>());
  parseDeparturesPanel(doc["departures"].as<JsonObject>(), model.departures);
  parseWeatherPanel(doc["weather"].as<JsonObject>(), model.weather);
  parseElectricityPanel(doc["electricity"].as<JsonObject>(), model.electricity);

  result.ok = true;
```

- [ ] **Step 5: Update the earlier tests that don't include an `electricity` field**

Every existing test JSON fixture in `firmware/e1001/test/test_dashboard_parser/test_main.cpp` written before this task (there are 6: the ones run by Steps in Task 1 of this plan and the original Tasks 2/3 from the previous firmware plan) is now missing the required `"electricity"` field and will start failing `parseDashboard`'s stricter validation. Add this object to each of those JSON string literals, immediately after the `"weather": { ... }` block's closing `}` and before the outer closing `}`:

```json
    ,
    "electricity": {
      "status": "live",
      "updatedAt": "2026-08-24T08:00:00.000Z",
      "stale": false,
      "prices": [],
      "error": null
    }
```

(Adjust the leading comma/formatting to fit each literal's existing style — the key requirement is that every `parseDashboard(json)` call in this file has a syntactically valid `"electricity"` object at the top level from this point on.)

- [ ] **Step 6: Run the full parser test suite**

Run: `cd firmware/e1001 && pio test -e native -f test_dashboard_parser`
Expected: `8 Tests 0 Failures 0 Ignored`, `PASSED` (all 6 pre-existing tests plus the 2 new ones).

- [ ] **Step 7: Commit**

```bash
git add firmware/e1001/lib/dashboard_parser firmware/e1001/test/test_dashboard_parser
git commit -m "feat: parse E1001 electricity panel"
```

---

### Task 3: Two-column layout computation

**Files:**
- Modify: `firmware/e1001/lib/layout/layout.h`
- Modify: `firmware/e1001/lib/layout/layout.cpp`
- Modify: `firmware/e1001/test/test_layout/test_main.cpp`

**Interfaces:**
- Consumes: `ParsedDeparture.operatorCode`, `WeatherPanel`'s extended
  fields, `ElectricityPanel`/`ElectricityPriceSlot` from Tasks 1–2.
- Produces (used by Task 4):
  - `kMaxRows` is now `8`.
  - `DepartureRow.operatorText` now holds the operator **code**, and
    `DepartureRow.coachText` is formatted as e.g. `"8coa"`.
  - `LayoutResult` gains `std::vector<std::string> weatherDetailLines;`
    and `struct ElectricityRow { std::string time; std::string priceText; }; std::vector<ElectricityRow> electricityRows;`.
  - `statusBannerText` now holds a short word ("Live"/"Partial"/
    "Unavailable") instead of a full sentence.

- [ ] **Step 1: Replace `test_layout/test_main.cpp` with the updated suite**

This rewrites the existing test file: the `makeDeparture` helper now sets
`operatorCode`, existing assertions move from `operatorName`/"8 coaches"
to `operatorCode`/"8coa", the banner-text test expects short words, and
new tests cover weather detail lines and electricity rows.

Replace the full contents of `firmware/e1001/test/test_layout/test_main.cpp` with:

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
  departure.operatorCode = "LM";
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
  TEST_ASSERT_EQUAL_STRING("LM", layout.rows[0].operatorText.c_str());
  TEST_ASSERT_TRUE(layout.rows[0].hasCoachText);
  TEST_ASSERT_EQUAL_STRING("8coa", layout.rows[0].coachText.c_str());
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

void test_max_rows_constant_is_eight() {
  TEST_ASSERT_EQUAL(8, kMaxRows);
}

void test_status_banner_text_for_each_dashboard_status() {
  DashboardModel liveModel;
  liveModel.status = DashboardStatus::Live;
  TEST_ASSERT_EQUAL_STRING("Live", computeLayout(liveModel, kMaxRows).statusBannerText.c_str());

  DashboardModel partialModel;
  partialModel.status = DashboardStatus::Partial;
  TEST_ASSERT_EQUAL_STRING("Partial", computeLayout(partialModel, kMaxRows).statusBannerText.c_str());

  DashboardModel unavailableModel;
  unavailableModel.status = DashboardStatus::Unavailable;
  TEST_ASSERT_EQUAL_STRING("Unavailable", computeLayout(unavailableModel, kMaxRows).statusBannerText.c_str());
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

void test_weather_detail_lines_include_only_present_fields() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  model.weather.hasApparentTemperatureC = true;
  model.weather.apparentTemperatureC = 11.1;
  model.weather.hasRelativeHumidityPercent = true;
  model.weather.relativeHumidityPercent = 63;
  model.weather.hasPrecipitationMm = false;
  model.weather.hasRainChanceNext6HoursPercent = true;
  model.weather.rainChanceNext6HoursPercent = 20;
  model.weather.hasPressureMslHpa = false;

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(3, (int)layout.weatherDetailLines.size());
  TEST_ASSERT_EQUAL_STRING("Feels like 11C", layout.weatherDetailLines[0].c_str());
  TEST_ASSERT_EQUAL_STRING("Humidity 63%", layout.weatherDetailLines[1].c_str());
  TEST_ASSERT_EQUAL_STRING("Rain (6h) 20%", layout.weatherDetailLines[2].c_str());
}

void test_electricity_rows_capped_at_six_slots() {
  DashboardModel model;
  model.status = DashboardStatus::Live;
  const char* starts[] = {
    "2026-08-24T08:00:00Z", "2026-08-24T08:30:00Z", "2026-08-24T09:00:00Z",
    "2026-08-24T09:30:00Z", "2026-08-24T10:00:00Z", "2026-08-24T10:30:00Z",
    "2026-08-24T11:00:00Z"
  };
  for (int i = 0; i < 7; i++) {
    ElectricityPriceSlot slot;
    slot.validFrom = starts[i];
    slot.validTo = starts[i];
    slot.pricePencePerKwh = 20.0 + i;
    model.electricity.prices.push_back(slot);
  }

  LayoutResult layout = computeLayout(model, kMaxRows);

  TEST_ASSERT_EQUAL(6, (int)layout.electricityRows.size());
  TEST_ASSERT_EQUAL_STRING("08:00", layout.electricityRows[0].time.c_str());
  TEST_ASSERT_EQUAL_STRING("20.0p", layout.electricityRows[0].priceText.c_str());
  TEST_ASSERT_EQUAL_STRING("10:30", layout.electricityRows[5].time.c_str());
  TEST_ASSERT_EQUAL_STRING("25.0p", layout.electricityRows[5].priceText.c_str());
}

int main(int argc, char **argv) {
  UNITY_BEGIN();
  RUN_TEST(test_extracts_time_of_day_and_platform_text);
  RUN_TEST(test_null_platform_and_coach_count_produce_fallback_text);
  RUN_TEST(test_delayed_departure_gets_delayed_emphasis);
  RUN_TEST(test_row_count_is_capped_at_max_rows);
  RUN_TEST(test_max_rows_constant_is_eight);
  RUN_TEST(test_status_banner_text_for_each_dashboard_status);
  RUN_TEST(test_weather_text_formatting_and_missing_weather);
  RUN_TEST(test_weather_detail_lines_include_only_present_fields);
  RUN_TEST(test_electricity_rows_capped_at_six_slots);
  return UNITY_END();
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd firmware/e1001 && pio test -e native -f test_layout`
Expected: compile failure (`operatorCode` field access on `ParsedDeparture` inside `layout.h`'s consumer works fine since Task 1 added it, but `weatherDetailLines`/`electricityRows`/`ElectricityRow` don't exist on `LayoutResult` yet, and `kMaxRows` is still `6`).

- [ ] **Step 3: Update `layout.h`**

Replace the full contents of `firmware/e1001/lib/layout/layout.h` with:

```cpp
#pragma once

#include <string>
#include <vector>

#include "dashboard_parser.h"

constexpr int kMaxRows = 8;

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

struct ElectricityRow {
  std::string time;
  std::string priceText;
};

struct LayoutResult {
  std::string statusBannerText;
  bool hasWeatherText;
  std::string weatherText;
  std::vector<std::string> weatherDetailLines;
  std::vector<DepartureRow> rows;
  std::vector<ElectricityRow> electricityRows;
};

LayoutResult computeLayout(const DashboardModel& model, int maxRows);
```

- [ ] **Step 4: Update `layout.cpp`**

Replace the full contents of `firmware/e1001/lib/layout/layout.cpp` with:

```cpp
#include "layout.h"

#include <cstdio>

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

std::string bannerTextFor(DashboardStatus status) {
  switch (status) {
    case DashboardStatus::Live: return "Live";
    case DashboardStatus::Partial: return "Partial";
    case DashboardStatus::Unavailable: return "Unavailable";
  }
  return "";
}

std::string formatWholeNumber(double value) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%d", static_cast<int>(value));
  return std::string(buffer);
}

std::string formatPrice(double pricePencePerKwh) {
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%.1fp", pricePencePerKwh);
  return std::string(buffer);
}

void appendWeatherDetailLines(const WeatherPanel& weather, std::vector<std::string>& lines) {
  if (weather.hasApparentTemperatureC) {
    lines.push_back("Feels like " + formatWholeNumber(weather.apparentTemperatureC) + "C");
  }
  if (weather.hasRelativeHumidityPercent) {
    lines.push_back("Humidity " + formatWholeNumber(weather.relativeHumidityPercent) + "%");
  }
  if (weather.hasPrecipitationMm) {
    lines.push_back("Precip " + formatWholeNumber(weather.precipitationMm) + "mm");
  }
  if (weather.hasRainChanceNext6HoursPercent) {
    lines.push_back("Rain (6h) " + formatWholeNumber(weather.rainChanceNext6HoursPercent) + "%");
  }
  if (weather.hasPressureMslHpa) {
    lines.push_back("Pressure " + formatWholeNumber(weather.pressureMslHpa) + "hPa");
  }
}

}  // namespace

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
  appendWeatherDetailLines(model.weather, layout.weatherDetailLines);

  int rowCount = static_cast<int>(model.departures.services.size());
  int rowsToRender = rowCount < maxRows ? rowCount : maxRows;

  for (int i = 0; i < rowsToRender; i++) {
    const ParsedDeparture& departure = model.departures.services[i];
    DepartureRow row;
    row.time = extractTimeOfDay(departure.scheduledDeparture);
    row.statusText = departure.expectedDisplay;
    row.platformText = departure.hasPlatform ? ("Platform " + departure.platform) : "Platform TBC";
    row.operatorText = departure.operatorCode;
    row.hasCoachText = departure.hasCoachCount;
    if (row.hasCoachText) {
      row.coachText = std::to_string(departure.coachCount) + "coa";
    }
    row.emphasis = emphasisFor(departure);
    layout.rows.push_back(row);
  }

  int electricityCount = static_cast<int>(model.electricity.prices.size());
  int electricityRowsToRender = electricityCount < 6 ? electricityCount : 6;
  for (int i = 0; i < electricityRowsToRender; i++) {
    const ElectricityPriceSlot& slot = model.electricity.prices[i];
    ElectricityRow row;
    row.time = extractTimeOfDay(slot.validFrom);
    row.priceText = formatPrice(slot.pricePencePerKwh);
    layout.electricityRows.push_back(row);
  }

  return layout;
}
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `cd firmware/e1001 && pio test -e native -f test_layout`
Expected: `9 Tests 0 Failures 0 Ignored`, `PASSED`.

- [ ] **Step 6: Run the full native suite to confirm no regressions**

Run: `cd firmware/e1001 && pio test -e native`
Expected: all tests across `test_sanity`, `test_dashboard_parser`, and `test_layout` PASS.

- [ ] **Step 7: Commit**

```bash
git add firmware/e1001/lib/layout firmware/e1001/test/test_layout
git commit -m "feat: compute E1001 two-column layout with electricity pricing"
```

---

### Task 4: Two-column ePaper rendering

**Files:**
- Modify: `firmware/e1001/src/render.cpp`

**Interfaces:**
- Consumes: the extended `LayoutResult` from Task 3.
- Device-only; not covered by `native` unit tests. Verified by building for
  `xiao_esp32s3` and, since the device is connected to this machine, by
  flashing and visually confirming the physical panel.

- [ ] **Step 1: Replace the drawing logic in `render.cpp`**

Replace the full contents of `firmware/e1001/src/render.cpp` with:

```cpp
#include "render.h"

#include <Fonts/FreeSans12pt7b.h>
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

  int16_t x1, y1;
  uint16_t textWidth, textHeight;
  display.getTextBounds(
      layout.statusBannerText.c_str(), 0, 0, &x1, &y1, &textWidth, &textHeight);
  display.setCursor(kScreenWidth - 10 - static_cast<int>(textWidth), 26);
  display.print(layout.statusBannerText.c_str());
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
    display.print(secondLine.c_str());

    y += rowHeight;
  }
  display.setTextColor(GxEPD_BLACK);
}

void drawWeather(const LayoutResult& layout) {
  int y = kHeaderHeight + 20;
  display.setFont(&FreeSans12pt7b);
  display.setCursor(kColumnDividerX + 10, y);
  if (layout.hasWeatherText) {
    display.print(layout.weatherText.c_str());
  }

  display.setFont(&FreeSans9pt7b);
  y += 24;
  for (const auto& line : layout.weatherDetailLines) {
    display.setCursor(kColumnDividerX + 10, y);
    display.print(line.c_str());
    y += 20;
  }
}

void drawElectricity(const LayoutResult& layout) {
  int y = kRightColumnMidY + 20;
  display.setFont(&FreeSans12pt7b);
  display.setCursor(kColumnDividerX + 10, y);
  display.print("Electricity (3h)");

  display.setFont(&FreeSans9pt7b);
  y += 22;
  for (const auto& row : layout.electricityRows) {
    display.setCursor(kColumnDividerX + 10, y);
    display.print(row.time.c_str());
    display.setCursor(kColumnDividerX + 90, y);
    display.print(row.priceText.c_str());
    y += 24;
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
```

Note: this switches the departure time font from `FreeSansBold24pt7b` to
`FreeSansBold18pt7b` to fit 8 rows at roughly 55px each in the narrower
left column — `FreeSansBold24pt7b` is no longer used and its include can
be dropped, per the include list above.

- [ ] **Step 2: Build for the device target**

Run: `cd firmware/e1001 && pio run -e xiao_esp32s3`
Expected: `SUCCESS`. If `FreeSansBold18pt7b` isn't available from the
installed Adafruit GFX fonts, check
`.pio/libdeps/xiao_esp32s3/Adafruit GFX Library/Fonts/` for the exact
available font filename and adjust the include and usage accordingly.

- [ ] **Step 3: Confirm the native test suite is unaffected**

Run: `cd firmware/e1001 && pio test -e native`
Expected: unchanged — all tests still pass (native build excludes `src/`).

- [ ] **Step 4: Flash the connected device and verify**

Run: `cd firmware/e1001 && pio run -e xiao_esp32s3 -t upload --upload-port COM3`
Expected: `SUCCESS`.

Then check the serial monitor for a completed cycle (`pio device monitor -p COM3 -b 115200`, expecting `E1001 waking up` followed by `Rendered updated dashboard`), and visually confirm the physical panel shows: "Watford to Euston" with a short status word in the header, up to 8 departure rows on the left with operator codes and abbreviated coach counts, weather detail lines in the upper right, and up to 6 Agile price slots in the lower right — matching `docs/superpowers/specs/2026-08-24-e1001-two-column-agile-design.md`. This requires looking at the physical device, which this session cannot do on its own.

- [ ] **Step 5: Commit**

```bash
git add firmware/e1001/src/render.cpp
git commit -m "feat: render E1001 two-column layout with Agile pricing"
```
