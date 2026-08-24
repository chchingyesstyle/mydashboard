# reTerminal E1001 Firmware Dashboard Design

Supersedes `docs/superpowers/specs/2026-08-24-e1001-sensecraft-dashboard-design.md`.
That spec used Seeed's no-code SenseCraft HMI platform; this one replaces it
with custom Arduino firmware for full parity with the web dashboard.

## Purpose

Display the Watford Junction to Euston live dashboard on a battery-powered
Seeed Studio reTerminal E1001 (XIAO ESP32-S3, 7.5" monochrome ePaper),
running custom firmware that consumes the existing public
`GET https://dashboard.cchk.uk/api/v1/dashboard` endpoint unmodified.

## Scope

The first release includes:

- Custom Arduino firmware built with PlatformIO
- Weather (temperature, condition) and a dynamic list of direct departures
  for the default `WFJ-EUS` route, fetched from the existing public API
- Full parity with the web dashboard's status handling: null-value fallback
  text, cancelled/delayed visual distinction, and a live/stale/unavailable
  banner
- A 5-minute deep-sleep wake cycle with ETag-based conditional requests
- Wi-Fi credentials in a local, gitignored secrets file
- Host-run unit tests (PlatformIO `native` environment) for the JSON
  parsing and layout logic

The first release does not include:

- The `EUS-WFJ` return direction
- Full weather detail beyond temperature and condition
- Any change to `src/`, the API contract, or the Cloudflare Worker — this
  feature consumes the existing public API unmodified
- Captive-portal Wi-Fi setup (credentials are hardcoded, not configured via
  a setup portal)
- Hardware-dependent test coverage (Wi-Fi, HTTPS, ePaper drawing, deep
  sleep) — these are verified manually on the physical device

## Toolchain and Project Structure

PlatformIO, targeting the XIAO ESP32-S3 board, using the Seeed_GFX and
GxEPD2 libraries for the ePaper display and ArduinoJson for parsing.
PlatformIO's `native` build environment lets the parsing and layout logic
run as host-side unit tests, with no device required.

```
firmware/e1001/
├── platformio.ini                 # env:xiao_esp32s3 (device) + env:native (tests)
├── src/
│   ├── main.cpp                   # setup/loop: wake, fetch, render, sleep
│   ├── dashboard_client.h/.cpp    # WiFi + HTTPS fetch, ETag handling (device-only)
│   ├── dashboard_parser.h/.cpp    # JSON -> internal model (pure logic, tested)
│   ├── layout.h/.cpp              # internal model -> draw instructions (pure logic, tested)
│   ├── render.h/.cpp              # draw instructions -> GxEPD2/Seeed_GFX calls (device-only)
│   └── secrets.h                  # WIFI_SSID / WIFI_PASSWORD, gitignored
└── test/                          # PlatformIO native unit tests
```

`secrets.h` is added to `.gitignore`; a `secrets.h.example` placeholder with
empty values is committed so the structure is discoverable.

## Wake / Fetch / Render / Sleep Cycle

1. Deep-sleep RTC timer wakes the device every **5 minutes**.
2. Connect to Wi-Fi using the credentials in `secrets.h`.
3. `GET /api/v1/dashboard` with `If-None-Match: <last ETag>`. The ETag is
   held in RTC memory, which survives deep sleep but not a full power loss.
4. **304 Not Modified**: nothing changed. Skip parsing and skip the ePaper
   redraw entirely, to save battery and avoid unnecessary ePaper wear.
5. **200 OK**: parse the response, compute the layout, do a full-refresh
   redraw, and store the new ETag.
6. **Wi-Fi or HTTP failure**: leave the existing screen content unchanged
   rather than blanking it, matching the web client's "Connection lost —
   showing the last updated data" behavior.
7. Return to deep sleep.

5 minutes is a deliberate trade-off: Seeed's advertised 3-month battery life
assumes a 6-hour refresh interval, so this cadence will draw meaningfully
more power than the rated benchmark. Actual battery life at 5 minutes is
not yet measured and should be checked against real usage after the first
build.

## Rendering and Parity with the Web Dashboard

- **Dynamic rows**: a `maxRows` constant, initially `6`, caps how many rows
  are drawn; the layout renders `min(returned services, maxRows)` — no
  blank placeholder rows when fewer services are returned. `maxRows` is
  tuned during implementation once real font rendering on the 800x480
  panel is measured.
- **Null-value fallback text**: `platform: null` renders as "Platform TBC";
  `coachCount: null` omits the coach-count text rather than showing "0".
- **Cancelled/delayed distinction**: using the panel's 4 grayscale levels,
  a cancelled row renders as an inverted (black-background, white-text)
  band; a delayed row renders its expected time in bold.
- **Status banner**: a persistent header line reflecting `payload.status`
  ("Live data" / "Some data is stale or unavailable" / "Live data is
  unavailable"), plus each panel's stale age when `stale: true` — matching
  the web dashboard's status text.
- **Weather**: compact, showing `weather.temperatureC` and
  `weather.condition` only.

## Testing

Host-run unit tests (PlatformIO `native` environment, no hardware) cover:

- `dashboard_parser`: JSON response to internal model, using fixture
  payloads mirroring the API contract — live, stale, partial, and
  unavailable panels; null `platform`/`coachCount`; cancelled services with
  a reason.
- `layout`: internal model plus screen dimensions to draw instructions —
  row count capping, fallback text substitution, and which rows receive
  the cancelled/delayed treatment.

Not covered by automated tests, verified manually on the physical device:
Wi-Fi connection, HTTPS fetch and ETag handling, actual GxEPD2/Seeed_GFX
draw calls, and deep-sleep timing/battery behavior.
