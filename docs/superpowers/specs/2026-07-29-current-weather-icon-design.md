# Current Weather Icon Design

## Goal

Show a weather symbol that matches the dashboard's live Watford Junction
condition instead of always showing a cloud.

## Scope

- Select the weather summary icon from the existing public
  `weather.weatherCode` value.
- Use compact, line-based symbols for clear, partly cloudy, cloudy, fog,
  rain, snow, and thunderstorm conditions.
- Keep the current condition text visible beside the icon.
- Do not change the weather provider, API contract, weather measurements,
  train information, layout, or theme behaviour.

## Mapping

- Codes 0–1: sun.
- Code 2: partly cloudy.
- Code 3: cloud.
- Codes 45 and 48: fog.
- Codes 51–67 and 80–82: rain.
- Codes 71–77 and 85–86: snow.
- Codes 95–99: thunderstorm.
- Any unknown code: cloud.

## Accessibility

The icon remains decorative because the existing visible condition text is the
authoritative weather description. The visual mapping must not remove or
replace that text.

## Verification

- Add rendering coverage for clear sky, partly cloudy, rain, snow, and
  thunderstorm icon selection.
- Confirm the visible condition text remains present.
- Run unit tests, TypeScript checking, browser tests, and the production
  build.
