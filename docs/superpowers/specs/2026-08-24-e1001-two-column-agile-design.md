# E1001 Two-Column Layout and Octopus Agile Pricing Design

## Purpose

Redesign the reTerminal E1001 firmware's screen into two columns — departures
on the left, weather and Octopus Agile electricity pricing on the right —
and add a new Electricity panel to the public dashboard API to source the
pricing data. Also replace the header's live/stale text as the primary
title with the route name.

## Scope

The first release includes:

- A new `electricity` panel on `GET /api/v1/dashboard`, sourced from
  Octopus Energy's public Agile standard-unit-rates endpoint for tariff
  `E-1R-AGILE-24-10-01-A` (Eastern England region, product
  `AGILE-24-10-01`)
- E1001 firmware: extended weather parsing (feels-like, humidity,
  precipitation, 6-hour rain chance, pressure — fields the API already
  returns but the firmware did not previously parse)
- E1001 firmware: new Electricity panel parsing
- E1001 firmware: two-column screen layout — left column shows up to 8
  departure rows, right column shows weather (top half) and the next three
  hours of Agile pricing in six half-hour slots (bottom half)
- E1001 firmware: header title changed from the live/stale status text to
  "Watford to Euston", with a small live/stale indicator retained
  alongside it

The first release does not include:

- Any change to the web dashboard's browser UI — `src/app/render.ts` and
  its layout are unchanged; `dashboard.cchk.uk` stays train+weather only
- Any change to the top-level `DashboardStatus` roll-up logic — it remains
  based on departures and weather only; `electricity.status` is reported
  independently and does not affect it
- Support for any Octopus tariff other than `E-1R-AGILE-24-10-01-A`
- Historical or past electricity price display — only current and future
  slots

## Backend: Electricity Panel

New file `src/worker/providers/agile.ts` fetches:

```
GET https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-A/standard-unit-rates/
```

No authentication is required for this endpoint. The provider filters
returned slots to those with `valid_to > now` (so the currently active
half-hour slot is included, not just future ones), sorts ascending by
`valid_from`, and returns the next 24 half-hour slots (12 hours — more
than the E1001 currently needs, to avoid revisiting this provider if a
future client wants a longer window).

New types in `src/shared/contracts.ts`:

```ts
export interface ElectricityPriceSlot {
  validFrom: string; // ISO 8601
  validTo: string;
  pricePencePerKwh: number;
}

export interface ElectricityPanel {
  status: PanelStatus;
  updatedAt: string | null;
  stale: boolean;
  prices: ElectricityPriceSlot[];
  error: string | null;
}
```

Added to `DashboardPayload` as `electricity: ElectricityPanel`. This is
additive; `version` remains `1`.

Cached independently in `src/worker/dashboard.ts` via the existing
`loadWithFallback` mechanism, following the same pattern as rail and
weather: refreshed upstream at most every 30 minutes (matching Octopus's
half-hour slot granularity), with a longer stale-fallback window (3 hours)
before the panel becomes `unavailable`. A failure in the electricity
provider must not prevent departures or weather from rendering, and vice
versa.

The top-level `status` field (`live`/`partial`/`unavailable`) continues to
be computed from departures and weather only, unchanged from its current
behavior. `electricity.status` is surfaced independently in its own panel
and does not feed into that computation.

## Firmware: Extended Weather Parsing

`dashboard_parser`'s `WeatherPanel` struct is extended with fields already
present in the API contract but not previously parsed by the firmware:
`apparentTemperatureC`, `relativeHumidityPercent`, `precipitationMm`,
`rainChanceNext6HoursPercent`, and `pressureMslHpa` (each with a
corresponding `hasX` boolean, following the existing null-handling pattern
for `temperatureC`/`condition`).

## Firmware: Electricity Panel Parsing

New types added to `dashboard_parser`:

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

Added as a field on `DashboardModel`. Parsing follows the same pattern as
`parseDeparturesPanel`/`parseWeatherPanel`: malformed or missing slot
fields cause that slot to be skipped (not the whole panel), matching the
lenient-per-item handling already used for departures.

## Firmware: Two-Column Layout

Screen (800x480) splits into a full-width header strip, then two columns:

- **Header** (full width, top): "Watford to Euston" as the primary title
  (left-aligned). A short status word — "Live", "Partial", or
  "Unavailable" (replacing the longer existing banner sentences, which no
  longer fit alongside the title) — is right-aligned in the same header
  strip.
- **Left column** (0–480px): up to 8 departure rows (raised from the
  current 6; `kMaxRows` becomes `8`). Each row is more compact than
  before to fit the narrower width and increased count:
  - Line 1: scheduled time (largest text) and status/expected text
    (`expectedDisplay`) inline.
  - Line 2 (smaller text): platform (`Platform TBC` fallback unchanged),
    the departure's `operatorCode` (not the full operator name — there is
    not enough width) and, if present, the coach count abbreviated as
    "Ncoa" (e.g. "8coa").
  - Cancelled/delayed visual emphasis (inverted band / bold time) is
    unchanged from the current design.
- **Right column** (480–800px), split top/bottom:
  - **Top half** (weather): current temperature and condition, then
    feels-like, humidity, precipitation, 6-hour rain chance, and
    pressure, one per line.
  - **Bottom half** (Electricity, next 3 hours): a small heading, then
    the first six slots from the electricity panel's `prices` array
    (six half-hour slots = 3 hours), each shown as start time and price
    in pence (e.g. "14:00  12.3p").

`layout.h`/`layout.cpp`'s `LayoutResult` gains fields for the extended
weather text lines and a list of electricity slot rows (time + price
strings), alongside the existing departure rows and banner text.

## Testing

Extends the existing PlatformIO `native` unit test suite:

- `dashboard_parser` tests cover the newly parsed weather fields and the
  new electricity panel parsing (including a malformed slot being
  skipped rather than failing the whole panel).
- `layout` tests cover the 8-row cap (raised from 6), the operator-code
  and abbreviated-coach-count row text, the extended weather text lines,
  and the electricity slot row formatting (capped at 6 slots).

The Cloudflare Worker side follows this project's existing TDD pattern for
providers (see `tests/worker/rail.test.ts` and `tests/worker/weather.test.ts`
for the pattern to mirror): a new `tests/worker/agile.test.ts` covers
normalization, filtering to future slots, and malformed-response handling;
`tests/worker/dashboard.test.ts` gains coverage for independent electricity
caching and fallback, matching the coverage rail and weather already have.

Device-only rendering changes (the two-column draw calls) are verified by
building for the device target and, since the device is available in this
session, by flashing and visually confirming the physical panel — not by
automated tests, consistent with the rest of this firmware's testing
approach.
