# Watford Junction to London Euston Live Dashboard Design

## Purpose

Build a public, always-on dashboard at `https://dashboard.cchk.uk` for commuters travelling from Watford Junction to London Euston. The dashboard shows every direct service, including London Overground, alongside current weather conditions at Watford Junction.

The first release targets browsers on landscape tablets, monitors, and phones. Its backend API must also be suitable for a future Seeed Studio reTerminal E1001 client without requiring an API redesign.

## Scope

The first release includes:

- Live direct departures from Watford Junction (`WFJ`) to London Euston (`EUS`)
- All direct operators, including London Overground
- Scheduled and expected departure time, platform, operator, status, and disruption reason
- Current Watford Junction weather only, with no hourly or daily forecast
- Responsive landscape, tablet, and phone layouts
- Automatic refresh, stale-data handling, manual refresh, and fullscreen support
- A versioned, public JSON endpoint for browser and future ESP32 clients
- Cloudflare Worker deployment at `dashboard.cchk.uk`
- Source hosted in `https://github.com/chchingyesstyle/mydashboard`

The first release does not include:

- Return services from Euston to Watford Junction
- Indirect journeys or journey planning
- Fares, ticket purchasing, accounts, or user settings
- Native ESP32 firmware
- Hourly or daily weather forecasts

## Architecture

Use a Vite and TypeScript frontend served by a Cloudflare Worker. The Worker owns a versioned `/api/v1/dashboard` endpoint and the static frontend build.

The browser and future device clients consume the same normalized API contract. Provider-specific behavior is isolated behind rail and weather adapters, so replacing the temporary Huxley rail source with the official Darwin Rail Data Marketplace API does not change the client contract.

The Worker contains no user authentication. The dashboard and its normalized API are public. Provider credentials are stored only as Cloudflare Worker secrets and are never returned to clients or committed to Git.

## Data Sources

### Rail

The initial rail provider is the Huxley 2 Community Edition JSON proxy:

`https://national-rail-api.davwheat.dev/departures/WFJ/to/EUS/10`

The Worker filters the response defensively to services whose destination list contains `EUS`, includes every direct operator, and sorts services by scheduled departure.

When the official Rail Data Marketplace subscription is approved, the rail adapter will be replaced with the LDBWS Public JSON API using the `DARWIN_API_KEY` Cloudflare secret. The normalized response contract remains unchanged.

### Weather

Use Open-Meteo for current conditions at Watford Junction. The request uses fixed station coordinates and requests:

- Temperature
- Apparent temperature
- Relative humidity
- Precipitation
- Weather code
- Wind speed and direction

No weather forecast series is requested or displayed.

## API Contract

`GET /api/v1/dashboard` returns JSON shaped as follows:

```json
{
  "version": 1,
  "generatedAt": "2026-07-28T12:00:00.000Z",
  "status": "live",
  "route": {
    "origin": { "name": "Watford Junction", "crs": "WFJ" },
    "destination": { "name": "London Euston", "crs": "EUS" }
  },
  "departures": {
    "status": "live",
    "updatedAt": "2026-07-28T12:00:00.000Z",
    "stale": false,
    "services": [
      {
        "id": "provider-stable-id",
        "scheduledDeparture": "2026-07-28T12:12:00+01:00",
        "expectedDeparture": "2026-07-28T12:12:00+01:00",
        "expectedDisplay": "On time",
        "platform": "9",
        "operator": "London Northwestern Railway",
        "operatorCode": "LM",
        "status": "on_time",
        "isCancelled": false,
        "reason": null
      }
    ],
    "error": null
  },
  "weather": {
    "status": "live",
    "updatedAt": "2026-07-28T12:00:00.000Z",
    "stale": false,
    "temperatureC": 21.4,
    "apparentTemperatureC": 20.8,
    "relativeHumidityPercent": 63,
    "precipitationMm": 0,
    "weatherCode": 2,
    "condition": "Partly cloudy",
    "windSpeedKph": 12.1,
    "windDirectionDegrees": 240,
    "error": null
  }
}
```

Valid top-level status values are `live`, `partial`, and `unavailable`. Panel status values are `live`, `stale`, and `unavailable`. Train status values are `on_time`, `delayed`, `cancelled`, and `unknown`.

The API returns `ETag`, `Cache-Control`, and `Access-Control-Allow-Origin: *` headers. Clients may send `If-None-Match` and receive `304 Not Modified`. This allows a future battery-powered ESP32 client to avoid downloading and parsing unchanged payloads.

## Refresh and Failure Handling

The browser requests dashboard data every 30 seconds. Weather is refreshed upstream no more than once every 10 minutes. Rail data is refreshed upstream no more than once every 30 seconds.

Each provider is cached independently. The Worker keeps the last successful normalized value with its retrieval timestamp:

- Rail data remains eligible as stale fallback for 5 minutes.
- Weather data remains eligible as stale fallback for 30 minutes.

If a provider request fails and an eligible last-success value exists, the Worker returns that value with `status: "stale"`, `stale: true`, and its original `updatedAt`. If no eligible value exists, only that panel becomes unavailable. A failure in one provider must not prevent the other panel from rendering.

The frontend shows a visible data-age label for stale values and retries automatically. Manual refresh bypasses the browser timer but still respects Worker-side upstream rate protection.

## Interface Design

The physical scene is a commuter glancing at an always-on household tablet in mixed morning daylight and dim evening light. The interface therefore uses a dark, tinted charcoal field with high-contrast typography and restrained amber highlights rather than decorative cards or dense navigation.

The dashboard takes inspiration from the glanceable, modular character of `hkdashboard.com` without copying its brand, assets, or exact layout.

### Landscape

The live departure board uses approximately two-thirds of the width. Current weather uses the remaining third. The header shows the route, current Europe/London time, overall live or stale state, manual refresh, and fullscreen controls.

Departure rows show:

- Scheduled time as the strongest element
- Expected time or status
- Platform
- Operator
- Delay or cancellation reason when available

### Phone

Panels stack vertically. Current weather appears above departures, followed by the same departure information in a narrower row layout. Controls remain touch-friendly and the most important departure information stays visible without horizontal scrolling.

### Weather

The weather panel shows current temperature, condition, apparent temperature, humidity, precipitation, wind speed, and wind direction. It contains no forecast chart or forecast list.

### Accessibility and Status

Status is communicated with text and icons as well as color. Cancelled services remain visible and clearly labelled. Delayed, cancelled, stale, loading, empty, and unavailable states use direct language.

Controls have accessible names and visible focus states. Text and meaningful UI elements meet WCAG AA contrast. Reduced-motion preferences disable non-essential transitions.

National Rail and Open-Meteo attribution appears in the footer. National Rail attribution follows the applicable developer and brand guidance.

## Future reTerminal E1001 Support

The future device is an ESP32-S3 reTerminal E1001 with an 800×480 monochrome ePaper display. Native firmware is outside the first-release scope, but the shared API is designed for it:

- Compact JSON with stable names and enums
- No reliance on CSS, color, browser-only formatting, or HTML scraping
- Absolute ISO 8601 timestamps and explicit Europe/London route context
- Conditional requests through `ETag`
- Clear stale and unavailable states
- Payload content that can be rendered in four grayscale levels

Future firmware may poll less frequently than the browser to protect battery life and reduce ePaper refreshes. That client-specific interval does not alter the API.

## Testing

Implementation follows test-driven development.

Worker tests cover:

- Huxley response normalization
- Direct `WFJ` to `EUS` filtering
- Inclusion of London Overground and other direct operators
- On-time, delayed, cancelled, missing-platform, and unknown states
- Weather code and current-condition normalization
- Independent provider caching and freshness
- Stale fallback and expired fallback rejection
- Partial and unavailable responses
- ETag and CORS behavior
- Provider timeout and malformed response handling

Frontend tests cover:

- Loading, live, stale, partial, empty, and unavailable states
- Departure ordering and disruption text
- Current-weather rendering without forecast content
- Manual refresh behavior
- Accessible labels and status text

End-to-end verification covers:

- Responsive landscape and phone layouts
- Keyboard navigation and focus visibility
- Production API response at `/api/v1/dashboard`
- Production page load and automatic refresh at `https://dashboard.cchk.uk`

Before deployment, run the complete unit test, typecheck, production build, and end-to-end test commands. After deployment, run HTTP and browser smoke tests against the production hostname.

## Deployment

The application runs as a Cloudflare Worker with static assets. The Worker is configured for the custom route `dashboard.cchk.uk` in the Cloudflare account associated with the available `CLOUDFLARE_API_TOKEN`.

The initial release requires no rail secret because it uses the temporary community proxy. Once the official Darwin Consumer key arrives, store it as the `DARWIN_API_KEY` Worker secret and switch the rail adapter configuration to the official provider.

Changes are committed to the `main` branch and pushed to `https://github.com/chchingyesstyle/mydashboard` using the existing GitHub credential. No secret values appear in source, configuration committed to Git, build logs, or browser responses.
