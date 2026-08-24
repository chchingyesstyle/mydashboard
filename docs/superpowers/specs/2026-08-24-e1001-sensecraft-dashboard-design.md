# reTerminal E1001 SenseCraft HMI Dashboard Design

## Purpose

Display the Watford Junction to Euston live dashboard on a Seeed Studio
reTerminal E1001 ePaper device, using Seeed's SenseCraft HMI no-code platform
rather than custom ESP32 firmware. The device is battery-powered.

## Scope

The first release includes:

- A SenseCraft HMI dashboard bound directly to the existing public
  `GET https://dashboard.cchk.uk/api/v1/dashboard` endpoint (default route,
  `WFJ-EUS`)
- Compact current weather (temperature and condition)
- The next five direct departures, each showing scheduled time, status or
  expected time, platform, operator, and coach count
- A 15-minute device fetch interval

The first release does not include:

- Custom ESP32 firmware
- The `EUS-WFJ` return direction
- Full weather detail (feels-like, humidity, precipitation, min/max
  temperature, rain chance, pressure)
- Delay/cancellation reason text
- Any change to `src/`, the API contract, or the Cloudflare Worker — this
  feature consumes the existing public API unmodified

## Data Source and Field Bindings

Single SenseCraft HMI data source: `GET https://dashboard.cchk.uk/api/v1/dashboard`.

Bound fields:

- `weather.temperatureC`
- `weather.condition`
- For each of the five departure rows (index `0`–`4` into
  `departures.services`):
  - `.scheduledDeparture`
  - `.expectedDisplay` (the human-readable "On time" / "HH:MM" / raw
    cancelled text Darwin returns; the row does not separately bind
    `.status`)
  - `.platform`
  - `.operator`
  - `.coachCount`

SenseCraft HMI binds each field individually; it has no mechanism to loop
over a JSON array, so five departure rows means setting up five sets of the
same five field bindings by hand.

## Layout

800×480, monochrome. Priority order within each row follows this project's
existing glance-first principle (time, then status, then platform):

```
┌──────────────────────────────────────────────────────┐
│ Watford Junction → Euston      12°C, Partly cloudy    │
│ Updated 08:41                                          │
├──────────────────────────────────────────────────────┤
│ 08:47   On time        Platform 9   London Northwestern │
│                                       Railway · 8 coaches│
├──────────────────────────────────────────────────────┤
│ 09:02   Delayed 09:11  Platform 4   London Overground   │
│                                       · 4 coaches        │
├──────────────────────────────────────────────────────┤
│ 09:17   Cancelled      Platform TBC London Northwestern  │
│                                       Railway · —        │
├──────────────────────────────────────────────────────┤
│ (rows 4 and 5 follow the same pattern)                 │
└──────────────────────────────────────────────────────┘
```

Time is the largest/boldest element per row. Status sits beside it. Platform
and operator/coach count are smaller secondary text below.

## Refresh

The device data source is configured to fetch every 15 minutes. This is
slower than the browser's 30-second interval by design, matching this
project's existing guidance that device clients should poll less frequently
than the browser to protect battery life and reduce ePaper refreshes.

## Known Limitations

Accepted trade-offs of the no-code approach versus the web dashboard:

- **No conditional formatting.** A cancelled or delayed row is not styled
  differently from an on-time row; it only differs in its text content
  (e.g. "Cancelled" versus "On time").
- **No null-value fallback text.** When `platform` or `coachCount` is
  `null`, SenseCraft HMI is expected to render it blank or as `0` rather
  than the web dashboard's "Platform TBC" wording.
- **Fixed five rows.** If fewer than five services are returned, the unused
  rows show stale or blank content until the next refresh.
- **No stale or unavailable indication.** If the API returns
  `stale: true` or a panel is `unavailable`, the SenseCraft HMI panel does
  not visibly communicate this the way the web dashboard's status banner
  does.

## Deliverable

This design spec, plus a separate step-by-step guide for building the
dashboard in the SenseCraft HMI UI. No changes to this repository's
application code are required, since the feature consumes the existing
public API unmodified.
