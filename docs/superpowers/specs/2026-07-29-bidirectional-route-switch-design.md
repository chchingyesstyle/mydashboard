# Bidirectional Watford–Euston Route Switch Design

## Goal

Extend the public dashboard so a commuter can switch between:

- Watford Junction (`WFJ`) to London Euston (`EUS`)
- London Euston (`EUS`) to Watford Junction (`WFJ`)

Both directions show every direct service, including London Overground. Weather
follows the departure station: Watford conditions for `WFJ-EUS` and Euston
conditions for `EUS-WFJ`.

## Approved Decisions

- Keep Watford to Euston as the default direction.
- Do not remember the selected direction across a reload or new visit.
- Add a visible two-button route selector to the dashboard header.
- Load only the selected direction rather than fetching both directions.
- Preserve the version 1 public response shape and use a route query on the
  existing endpoint.
- Preserve the current 30-second browser refresh, 30-second Darwin cache,
  5-minute RTT coach-count cache, and 10-minute weather cache.

## Specification Precedence

This design extends the original one-way dashboard specification and
supersedes only its statements that return services are out of scope and that
weather is always fixed to Watford Junction.

Implementation must update `AGENTS.md` and `PRODUCT.md` so their product scope
describes both directions and origin-station weather. Existing requirements
for pressure presentation, accessibility, themes, compact departure rows,
coach counts, deployment, and future ESP32 compatibility remain in force.

## Shared Route Configuration

Define the supported routes in one shared, provider-neutral configuration:

| Route ID | Origin | Destination | Weather location |
| --- | --- | --- | --- |
| `WFJ-EUS` | Watford Junction (`WFJ`) | London Euston (`EUS`) | Watford Junction, `51.6635`, `-0.3969` |
| `EUS-WFJ` | London Euston (`EUS`) | Watford Junction (`WFJ`) | London Euston, `51.5284`, `-0.1346` |

The configuration exposes station names, CRS codes, and weather coordinates.
Provider-specific URL details stay inside their adapters.

## Public API

Continue to use:

`GET /api/v1/dashboard`

Accepted query behavior:

- No `route` parameter selects `WFJ-EUS`.
- `?route=WFJ-EUS` selects Watford to Euston.
- `?route=EUS-WFJ` selects Euston to Watford.
- An empty, repeated, or unsupported `route` value returns `400 Bad Request`
  with CORS headers and no provider calls.

The JSON response remains `version: 1` and keeps its existing structure. The
existing top-level `route` object identifies the selected origin and
destination. No provider-specific fields enter the public contract.

`ETag`, conditional requests, CORS, cache-control headers, and current
live/stale/unavailable semantics apply independently to each route response.
Calling the endpoint without a query remains backward-compatible with the
browser and future ESP32 clients.

## Rail Data

Darwin remains authoritative for the departure list.

For each selected route, the rail adapter:

1. Calls `GetDepartureBoard/{origin CRS}`.
2. Sends the destination CRS as `filterCrs` with `filterType=to`.
3. Requests the existing row count and time window.
4. Defensively retains only services whose destination includes the selected
   destination CRS.
5. Includes all direct operators, cancelled services, and London Overground.
6. Preserves scheduled-time ordering and the normalized `Departure` contract.

Rail cache keys include the route ID. A cached Watford-to-Euston board must
never satisfy an Euston-to-Watford request.

## RTT Coach Counts

RTT remains optional enrichment and never controls departure availability.

The selected route determines the location query:

- `WFJ-EUS`: `code=gb-nr:WFJ`, `filterTo=gb-nr:EUS`
- `EUS-WFJ`: `code=gb-nr:EUS`, `filterTo=gb-nr:WFJ`

Coach counts continue to match Darwin services by booked Europe/London
departure time and operator code. Each direction has its own five-minute
coach-count cache.

To reduce usage against the RTT allowance, split access-token exchange from
the route location request. Cache the short-lived access token only inside the
Worker until shortly before the RTT `validUntil` value, and reuse it for both
directions. The long-lived refresh token remains in `RTT_API_TOKEN`. Neither
token may appear in browser code, logs, Git, or public responses.

If token exchange, RTT, matching, or cache access fails, return `coachCount:
null` for affected departures without changing the departures panel status.
An RTT `429` follows the same graceful-degradation path.

## Weather

Open-Meteo continues to provide the existing weather fields and presentation.
Only the fixed request coordinates change with the route origin:

- Watford weather for `WFJ-EUS`
- Euston weather for `EUS-WFJ`

Weather cache keys include the origin CRS. The same existing current
conditions, today's minimum and maximum temperatures, six-hour rain chance,
and mean sea-level pressure behavior applies to both locations. The dashboard
does not use browser geolocation.

## Browser Interaction

Add a compact two-button route selector in the header:

- `To Euston`
- `To Watford`

The loaded direction has a clear selected style and `aria-pressed="true"`.
Buttons use the existing control vocabulary, visible keyboard focus, WCAG AA
contrast, and touch-friendly targets in light and dark modes. The full route
heading continues to state both station names.

Route state lives only for the current page session and starts as `WFJ-EUS`.
It is not stored in local storage and does not alter browser history. The theme
preference remains independent and continues to persist.

On a route selection:

1. keep the currently loaded dashboard visible;
2. disable both route buttons and expose a loading status such as
   `Loading Euston to Watford Junction…`;
3. request the selected route;
4. replace the route heading, departures, and weather together on success;
5. keep the previous route visible and show the existing connection warning
   pattern on failure.

The selected state changes only after the new route payload succeeds, avoiding
a heading that disagrees with visible data. Manual and 30-second automatic
refreshes request only the loaded direction.

The browser client tracks ETags and last successful payloads separately by
route. A `304` when returning to a previously loaded direction restores that
route's cached payload rather than leaving the opposite direction visible.

## Responsive Layout

The route selector belongs in the existing header and must not add navigation
or another dashboard panel.

- Landscape and tablet layouts keep the current departure/weather proportions.
- Phone layouts keep weather above departures.
- Short labels may wrap or stack within the header, but no horizontal page
  overflow is permitted.
- Switching routes adds no decorative animation; reduced-motion behavior
  remains unchanged.

## Failure Handling

- Unsupported API route: return `400` before calling any provider.
- Darwin failure: use only the selected route's eligible stale fallback or
  make that departure panel unavailable.
- Weather failure: use only the selected origin's eligible stale fallback or
  make that weather panel unavailable.
- RTT failure: omit coach counts while keeping Darwin departures.
- Route-switch request failure: retain the prior complete dashboard and show a
  connection warning.
- Repeated clicks while a route request is in flight: ignore them until the
  request settles.

No failure may combine the heading, departures, weather, or coach counts from
different directions.

## Verification

Implementation follows test-driven development.

Provider and service tests cover:

- Darwin request and defensive destination filtering for both directions;
- RTT location parameters and coach-count matching for both directions;
- reuse and expiry of the shared RTT access token;
- separate rail, RTT, and weather cache entries;
- Watford and Euston weather coordinates;
- RTT failure without departure failure;
- invalid route values without upstream requests.

API and frontend tests cover:

- the default route and both valid `route` queries;
- invalid, empty, and repeated route parameters returning `400` with CORS;
- per-route ETags and conditional responses;
- selected route control semantics and full route heading;
- successful switching in both directions;
- loading, repeated-click, failure-retention, manual-refresh, automatic-refresh,
  and per-route `304` behavior;
- keyboard focus, light/dark themes, reduced motion, and accessible status text.

Browser tests cover:

- the selector and full content switch on landscape and phone viewports;
- no horizontal overflow;
- every direct reverse service represented by the API fixture, including
  London Overground.

Before deployment, run all unit tests, type-checking, browser tests, the
production build, and diff checks. After deployment:

1. run the existing production smoke test;
2. query both route variants;
3. confirm their route objects and weather locations differ correctly;
4. confirm direct services and numeric/null coach counts are valid;
5. exercise the route switch on the production page;
6. push the verified commits to GitHub `main`.

## Out of Scope

- Indirect journeys or journey planning
- Fares or ticket purchasing
- Remembering the selected direction across reloads
- Browser geolocation
- ESP32 firmware
- Additional stations or arbitrary route selection
