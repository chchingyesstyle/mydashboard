# Two-Decimal Pressure Display Design

## Purpose

Display current mean sea-level pressure with exactly two decimal places on the
dashboard. For example, an API value of `1016.8` is displayed as
`1016.80 hPa`.

## Scope

This change affects only pressure presentation in the web dashboard:

- finite pressure values use exactly two decimal places;
- the visible unit remains `hPa`;
- assistive text uses the same two-decimal value followed by
  `hectopascals`; and
- unavailable pressure continues to display `Unavailable`.

The numeric `weather.pressureMslHpa` field in `/api/v1/dashboard` is unchanged.
The API version remains `1`, and no provider, cache, layout, weather-request,
rail, or future ESP32 behavior changes.

## Implementation

The existing pressure entry in `src/app/render.ts` formats
`panel.pressureMslHpa` with `toFixed(2)` for both visible and assistive text.
No formatter abstraction or configuration is added because pressure is the
only requested fixed two-decimal measurement.

## Verification

The render test first expects `1016.80 hPa` from a numeric `1016.8` payload and
must fail against the current whole-number display. The minimal renderer change
then makes that test pass while preserving the unavailable-pressure test.

Before publishing, unit tests, typechecking, the production build, Playwright,
and production smoke checks must pass. The committed `main` branch is pushed
to GitHub, deployed to the existing Cloudflare Worker, and visually verified at
`https://dashboard.cchk.uk`.
