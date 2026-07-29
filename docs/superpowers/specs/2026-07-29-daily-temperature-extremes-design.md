# Daily Temperature Extremes Design

## Goal

Replace the web dashboard's wind measurement with Watford Junction's local-day
minimum and maximum air temperatures.

## Scope

The weather panel no longer displays wind speed or direction. It adds one
replacement measurement:

- label: `Today`;
- visible value: `Min <value>°C · Max <value>°C`;
- assistive text: `Today, minimum temperature <value> degrees Celsius, maximum
  temperature <value> degrees Celsius`.

This is an explicit, limited exception to the current-weather-only scope. It
uses two daily temperature aggregates only; it adds no daily forecast list,
chart, future-day data, or other weather feature.

## Provider and Data Flow

The existing Open-Meteo request keeps its current-weather fields and the
six-hour rain-probability request. It additionally requests the daily
variables `temperature_2m_min` and `temperature_2m_max`, with
`forecast_days=1` and the existing `Europe/London` timezone.

The adapter reads the first daily value for each variable, which represents
Watford Junction's local calendar day. Both values must be finite numbers. If
either value is absent or invalid, both normalized values are `null`; valid
current weather and rain chance remain available.

## Public API

The version 1 weather object gains these additive fields:

```ts
temperatureMinTodayC: number | null;
temperatureMaxTodayC: number | null;
```

They describe the local calendar day's forecast minimum and maximum air
temperatures at two metres above ground. They are not a rolling 24-hour range.

`windSpeedKph` and `windDirectionDegrees` remain in the version 1 API and
provider response to avoid breaking existing and future ESP32 clients, but the
web dashboard no longer renders them. All existing status, cache, ETag, CORS,
pressure, and rain-chance behavior remains unchanged.

## Presentation and Accessibility

The `Today` row replaces the existing Wind row in the weather definition list.
It uses the existing typography and layout with no CSS, card, or structural
change. When either daily temperature is unavailable, the row remains present
and renders `Unavailable` with the expanded text `Today temperatures
unavailable`.

## Verification

Tests will verify that:

- the Open-Meteo request asks for exactly the two daily temperature variables,
  one forecast day, the existing six rain-probability hours, and no daily list
  is exposed;
- the adapter normalizes the first valid daily minimum and maximum values;
- absent, incomplete, non-numeric, or non-finite daily values become two
  `null` fields without making the weather panel unavailable;
- live and unavailable version 1 dashboard responses include the new fields;
- the web dashboard shows the accessible daily temperature range and no Wind
  row; and
- existing unit, browser, build, production, and API smoke checks pass.
