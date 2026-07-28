# Six-Hour Rain Chance Design

## Goal

Add one glanceable rain-probability value for Watford Junction: the highest
hourly probability of precipitation during the next six forecast hours.

This is the user-requested exception to the dashboard's current-conditions-only
weather scope. It does not add an hourly list, daily forecast, chart, or coach
count.

## Definition

Open-Meteo returns six upcoming hourly `precipitation_probability` values. The
dashboard reports the maximum of those values.

For example, `[10, 20, 35, 60, 45, 30]` becomes `60%`.

The value represents the highest chance of precipitation in any one of the next
six forecast hours. It is not the probability that rain will occur at least once
across the whole six-hour period.

## Provider and Data Flow

The existing Open-Meteo request continues to request all current-weather fields.
It additionally requests:

- hourly variable `precipitation_probability`;
- `forecast_hours=6`; and
- the existing `Europe/London` timezone.

The weather adapter validates that the hourly probability series contains six
finite numeric values from 0 through 100. It returns the maximum as
`rainChanceNext6HoursPercent`. If the series is absent, incomplete, or invalid,
the adapter returns `null` for this field while preserving otherwise valid
current weather.

No provider-specific field names or hourly arrays leave the weather adapter.
The existing weather cache and refresh timing remain unchanged.

## Public API

The version 1 weather object gains this additive field:

```ts
rainChanceNext6HoursPercent: number | null;
```

The value is a percentage from 0 through 100, or `null` when unavailable. The
API continues to use version `1`; existing status values, timestamps, caching,
`ETag`, and CORS behavior are unchanged. A single numeric value keeps the
response compact for a future ESP32 client.

When the entire weather provider is unavailable, the unavailable weather object
also contains `rainChanceNext6HoursPercent: null`.

## Web Presentation

The existing weather measurements list adds one row:

- label: `Rain chance, next 6 hours`;
- visible value: `<value>%`, for example `60%`;
- assistive text: `<value> percent`.

If the value is `null`, the row remains present and displays `Unavailable`.
The current weather heading, layout, visual hierarchy, and all existing
measurements remain unchanged. No forecast chart or per-hour values are shown.

## Error Handling

Missing or malformed rain-probability data does not make the whole weather panel
unavailable. It affects only the rain-chance value. Existing validation and
failure behavior for required current-weather fields remain unchanged.

## Verification

Tests will verify that:

- the Open-Meteo request asks for six hourly precipitation probabilities;
- the adapter selects the maximum of six valid values;
- an absent, incomplete, out-of-range, or non-numeric series produces `null`;
- the version 1 API includes the numeric or `null` field;
- the web dashboard renders the percentage and accessible expanded text;
- a `null` value renders `Unavailable` without hiding current weather; and
- existing weather, layout, API, and end-to-end tests continue to pass.

Production verification will confirm that `https://dashboard.cchk.uk` and
`https://dashboard.cchk.uk/api/v1/dashboard` expose the new value after
deployment.
