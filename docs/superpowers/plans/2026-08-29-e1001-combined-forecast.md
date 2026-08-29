# E1001 Combined Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two E1001 forecast screens with one readable screen that shows all 12 hourly and all 7 daily entries beside the unchanged right panel.

**Architecture:** Collapse the route selector to a single `Forecast` enum value and five-item cycle. Populate both forecast row vectors for that screen, then render a compact two-section left column while reusing the existing weather and electricity rendering on the right.

**Tech Stack:** PlatformIO, Arduino C++, Unity native tests, Seeed GxEPD2 / Adafruit GFX

**Spec:** `docs/superpowers/specs/2026-08-29-e1001-combined-forecast-design.md`

## Global Constraints

- Do not change the public `/api/v1/dashboard` contract or browser dashboard.
- Keep the right-hand current-weather, warning, and Agile electricity panel unchanged.
- Keep Forecast on `WFJ-ALL` and Commute on `WFJ-EUS`.
- Show all 12 hourly entries and all 7 daily entries inside the left 480 pixels.
- Preserve the existing two-minute commute and fifteen-minute off-peak sleep intervals exactly.

---

### Task 1: Five-screen route cycle

**Files:**
- Modify: `firmware/e1001/lib/route_selector/route_selector.h`
- Modify: `firmware/e1001/lib/route_selector/route_selector.cpp`
- Modify: `firmware/e1001/test/test_route_selector/test_main.cpp`
- Modify: `firmware/e1001/src/main.cpp`

**Interfaces:**
- Consumes: existing `Screen`, `kScreenCycle`, and route-selection functions.
- Produces: `Screen::Forecast`, a five-item `kScreenCycle`, and the title `Forecast`.

- [ ] **Step 1: Write failing route-selector tests**

  Change expectations so off-peak wakes select `Screen::Forecast`, the cycle is
  `Commute -> Forecast -> HongKongNews -> UkNews -> AllDepartures`, and five
  consecutive override presses return to the starting screen.

- [ ] **Step 2: Run the route-selector tests and verify RED**

  Run: `pio test -e native -f test_route_selector`

  Expected: compilation or assertion failure because `Screen::Forecast` and the
  five-item cycle do not exist.

- [ ] **Step 3: Implement the minimal route-selector change**

  Replace both forecast enum values and branches with `Screen::Forecast`, update
  the cycle and comments to five screens, update `screenName()`, and track the
  last rendered screen so any changed selection omits the stored ETag and
  redraws reliably. Commit the requested cycle index only after rendering
  succeeds so failed requests keep navigation aligned with the visible screen.

- [ ] **Step 4: Run the route-selector tests and verify GREEN**

  Run: `pio test -e native -f test_route_selector`

  Expected: all route-selector tests pass.

### Task 2: Combined forecast layout model

**Files:**
- Modify: `firmware/e1001/lib/layout/layout.h`
- Modify: `firmware/e1001/lib/layout/layout.cpp`
- Modify: `firmware/e1001/test/test_layout/test_main.cpp`

**Interfaces:**
- Consumes: `DashboardModel::weather.dailyForecast` and `hourlyForecast`.
- Produces: one `LayoutResult` for `Screen::Forecast` with both `dailyRows` and `hourlyRows` populated.

- [ ] **Step 1: Write a failing combined-layout test**

  Construct a model containing two daily and two hourly fixtures, call
  `computeLayout(..., Screen::Forecast)`, and assert the title is `Forecast`
  and both row vectors contain their independently derived formatted values.

- [ ] **Step 2: Run the layout tests and verify RED**

  Run: `pio test -e native -f test_layout`

  Expected: failure because the current layout only populates one forecast row
  vector per screen.

- [ ] **Step 3: Implement the minimal combined layout branch**

  Under `Screen::Forecast`, append all daily rows and all hourly rows using the
  existing formatting rules. Remove the forecast-only header helper if it is no
  longer used.

- [ ] **Step 4: Run the layout tests and verify GREEN**

  Run: `pio test -e native -f test_layout`

  Expected: all layout tests pass.

### Task 3: Combined E-paper renderer and documentation

**Files:**
- Modify: `firmware/e1001/src/render.cpp`
- Modify: `firmware/e1001/README.md`

**Interfaces:**
- Consumes: the combined `LayoutResult::hourlyRows` and `dailyRows`.
- Produces: one compact left-column forecast rendering; no API changes.

- [ ] **Step 1: Implement the approved bounded layout**

  Render a two-row, six-column hourly grid above seven compact daily rows. Keep
  all drawing x-coordinates below the existing `kColumnDividerX` and retain the
  existing `drawWeather()` and `drawElectricity()` calls.

- [ ] **Step 2: Update the firmware README**

  Document the five-screen cycle, combined Forecast contents, unchanged right
  panel, and off-peak default.

- [ ] **Step 3: Run complete verification**

  Run: `pio test -e native`

  Run: `pio run -e xiao_esp32s3`

  Expected: all native tests pass and the ESP32 firmware builds successfully.

- [ ] **Step 4: Commit**

  Stage only the combined-forecast source, tests, spec, plan, and README, then
  commit with `feat: combine E1001 forecast screens`.
