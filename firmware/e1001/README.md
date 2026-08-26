# Watford–Euston dashboard for the Seeed reTerminal E1001

Battery-powered firmware for a Seeed Studio reTerminal E1001 (XIAO
ESP32-S3, 7.5" monochrome ePaper) that polls this project's existing public
`GET https://dashboard.cchk.uk/api/v1/dashboard` API and renders it to a
two-column screen: departures on the left, weather and Octopus Agile
electricity pricing on the right. See the design specs for the full
rationale:

- `../../docs/superpowers/specs/2026-08-24-e1001-firmware-dashboard-design.md`
- `../../docs/superpowers/specs/2026-08-24-e1001-two-column-agile-design.md`

This directory is a self-contained PlatformIO/C++ project. It is not part of
the web app's `npm test`/`npm run build`/`npm run deploy` pipeline.

## Project layout

- `lib/dashboard_parser/` — JSON response to internal model. Pure logic,
  unit-tested.
- `lib/layout/` — internal model to draw instructions (rows, weather lines,
  electricity slots, battery percentage). Pure logic, unit-tested.
- `src/dashboard_client.cpp` — WiFi connection and HTTPS fetch with ETag.
  Device-only.
- `src/render.cpp` — draws the layout to the ePaper display via
  Seeed_GxEPD2. Device-only.
- `src/battery.cpp` — reads the battery voltage via ADC. Device-only.
- `src/main.cpp` — wake / fetch / render / deep-sleep cycle.
- `test/` — PlatformIO `native`-environment unit tests (no hardware needed).

## Setup

Install PlatformIO if it isn't already:

```bash
pip install -U platformio
```

The `native` test environment also needs a host C/C++ compiler (GCC or
Clang) on `PATH` — on Windows, a MinGW-w64 toolchain works
(e.g. `winget install BrechtSanders.WinLibs.POSIX.UCRT`).

Copy the Wi-Fi credentials template and fill in a real 2.4GHz network (the
E1001 does not support 5GHz):

```bash
cp src/secrets.h.example src/secrets.h
```

Edit `src/secrets.h` with your `WIFI_SSID`/`WIFI_PASSWORD`. This file is
gitignored and must never be committed.

## Testing

```bash
pio test -e native
```

Runs the pure-logic unit tests (parsing and layout) on your machine, no
device required.

## Building and flashing

```bash
pio run -e xiao_esp32s3
pio run -e xiao_esp32s3 -t upload --upload-port COM3
```

Adjust the port to match your machine (check Device Manager on Windows —
the E1001 enumerates as a `USB-SERIAL CH340` device once its driver is
installed). Watch the wake cycle over serial with:

```bash
pio device monitor -p COM3 -b 115200
```

Expect `E1001 waking up` followed by `Rendered updated dashboard` (or `304
Not Modified, skipping redraw` if nothing changed since the last poll).

## Hardware notes

- **Refresh cadence:** wakes from deep sleep every 5 minutes to poll the
  API. This is far more frequent than the ~6-hour interval Seeed's 3-month
  battery-life rating assumes, so expect meaningfully shorter battery life
  in practice.
- **Manual refresh:** press the **right white button** (GPIO4) to wake and
  refresh immediately, bypassing the 5-minute timer.
- **Mode override:** press the **left white button** (GPIO5) to wake and
  refresh showing the *opposite* of whatever the time-based route mode
  would pick, for that one screen only — the next wake (timer or either
  button) re-derives the mode from the clock, so it reverts automatically.
  Both buttons wake the device via `esp_sleep_enable_ext1_wakeup()`;
  `esp_sleep_get_ext1_wakeup_status()` tells `main.cpp` which one fired.
  The **green button** (GPIO3) is deliberately not used for either of
  these — it's an ESP32-S3 boot-strapping pin (it straps the JTAG signal
  source), and Seeed's own documentation warns that using it as a wake
  source can interfere with future USB firmware uploads. GPIO5 isn't a
  strapping pin, so it doesn't carry that risk.
- **Battery percentage:** read via GPIO21 (enable) / GPIO1 (ADC, 12dB
  attenuation, 2x divider compensation) and mapped to a percentage using
  Seeed's published reTerminal E1001 discharge curve. Shown at the top
  right of the header.
- **Debug logging:** goes to `Serial0` (UART0, wired to the onboard CH340),
  not `Serial` — the XIAO ESP32-S3's board default routes `Serial` to
  native USB CDC, which this board doesn't expose.
- **TLS:** the `cchk.uk` Cloudflare zone must keep `min_tls_version` at
  `1.2` — this device's ESP32 TLS stack cannot negotiate TLS 1.3.
- **Time-based route:** the device syncs NTP time on every wake (before
  fetching) to pick which board to request — `WFJ-EUS` (Watford Junction ->
  Euston) from 6am-9am local time, otherwise `WFJ-ALL`, an unfiltered
  Watford Junction departures board. Selection logic lives in
  `lib/route_selector`. Outside the commute window, each departure row
  also shows its destination and operator code (e.g. "to London Euston
  LM") since the destination is no longer implied by the route.

## Known limitations

- The reverse commute route (`EUS-WFJ`) isn't fetched by this device —
  only `WFJ-EUS` (6am-9am) and `WFJ-ALL` (otherwise).
- No captive-portal Wi-Fi setup — credentials are hardcoded in
  `src/secrets.h` and require reflashing (or editing and rebuilding) to
  change networks.
