# E1001 Combined Forecast Design

## Goal

Combine the reTerminal E1001's separate 7-day and next-12-hours weather
screens so both forecasts are visible together without an extra button press.

## Scope

- Replace `SevenDayWeather` and `TwelveHourWeather` with one `Forecast` screen.
- Keep all 12 hourly entries and all 7 daily entries.
- Keep the existing right-hand current-weather, warning, and Agile electricity
  panel unchanged.
- Keep forecast data sourced from the existing `/api/v1/dashboard` response;
  the Worker contract and browser dashboard do not change.

## Screen Cycle

The override button uses this five-screen order:

1. Commute
2. Forecast
3. Hong Kong News
4. UK News
5. All Departures

The time-based default remains Commute from 06:00 through 08:59 and becomes
Forecast at all other times. Forecast continues to fetch the `WFJ-ALL` route.
The firmware separately remembers the last successfully rendered screen. A
wake that selects a different screen omits the stored ETag so screens sharing
`WFJ-ALL` always receive a body to render; wakes that keep the same screen
continue using conditional requests. The requested cycle position is committed
only after a successful render; fetch and parse failures retain the visible
screen's position for the next override press.

## Left-column Layout

The 480-pixel-wide left column remains bounded by the existing global header
and the fixed divider at x=480.

- Upper section: 12 hourly forecast cards in a 6-column by 2-row grid. Each
  card shows time, weather icon, temperature, and rain chance.
- Lower section: 7 compact daily rows. Each row shows weekday/date, weather
  icon, rain chance, and rounded low/high temperatures.
- A horizontal divider and short `12 Hours` / `7 Days` section labels make the
  two time scales easy to scan.

Font sizes and icon sizes may be reduced within the left column, but every API
entry remains visible and text must not cross the x=480 divider.

## Right-column Behaviour

The current temperature and condition, weather icon, detail lines, optional
warning banner, and electricity price table retain their current positions and
rendering. The combined forecast must not consume any right-column space.

## Verification

- Native route-selector tests prove the five-screen cycle and off-peak default.
- Native route-selector tests prove screen changes and first render force a
  body fetch while an unchanged rendered screen retains conditional requests.
- Native route-selector tests prove failed redraws retain the visible screen's
  cycle position.
- Native layout tests prove one Forecast layout contains both hourly and daily
  rows while preserving status, battery, refresh, weather, and electricity data.
- The native firmware test suite and the ESP32 firmware build must pass.
