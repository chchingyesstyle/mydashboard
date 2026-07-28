# Darwin Rail, Air Pressure, and Stale-Status Accessibility Design

## Purpose

Replace the temporary Huxley rail source with the subscribed National Rail
Darwin Live Departure Board JSON API, add current mean sea-level pressure to
the weather panel and shared API, and prevent stale-age updates from repeatedly
interrupting screen-reader users.

The public dashboard remains at `https://dashboard.cchk.uk`. It continues to
show every direct service from Watford Junction (`WFJ`) to London Euston
(`EUS`), including London Overground, alongside current Watford Junction
weather. The public API remains suitable for the future reTerminal E1001
client.

## Scope

This change includes:

- Darwin-only rail data through the subscribed Rail Data Marketplace product
  named **Live Departure Board**
- Every direct `WFJ` to `EUS` service returned in the next 120 minutes
- Encrypted Cloudflare Worker storage for the Darwin Consumer key
- Current mean sea-level pressure from Open-Meteo, displayed in hectopascals
- Additive `pressureMslHpa` support in `/api/v1/dashboard`
- A one-time stale-state announcement with a non-live, visually updating age
- Provider, contract, runtime, browser, and production verification
- Updated operations and data-source documentation

This change does not include:

- A Huxley runtime fallback
- The Darwin Staff, Push Port, Timetable, Next Departures, Fastest Departures,
  Arrival Board, or service-details products
- Hourly or daily weather forecasts
- A breaking public API version
- ESP32 firmware
- New dashboard panels, routes, accounts, or settings

## Architecture and Data Flow

The existing provider boundary remains in
`src/worker/providers/rail.ts`. Huxley request and normalization logic is
replaced with Darwin-specific request and normalization logic. Darwin-specific
authentication and response fields remain inside that adapter.

The Worker passes the encrypted `DARWIN_API_KEY` binding into the dashboard
service and rail adapter. The adapter requests:

`https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepartureBoard/WFJ`

with these query parameters:

- `numRows=150`
- `filterCrs=EUS`
- `filterType=to`
- `timeOffset=0`
- `timeWindow=120`

The Consumer key is sent only as the `x-apikey` request header. The subscribed
gateway was validated successfully with this method. The separately supplied
Consumer secret is not required by this product and will not be copied into
Cloudflare.

The adapter defensively retains only services whose destination list contains
`EUS`, maps them into the existing `Departure` contract, preserves all
operators, and sorts them by scheduled departure. Existing Europe/London
midnight handling remains responsible for converting Darwin wall-clock values
into ISO 8601 timestamps.

The dashboard service keeps its independent provider orchestration. Darwin
continues to use the existing 30-second upstream refresh interval and
five-minute stale fallback. Open-Meteo continues to use the existing ten-minute
upstream refresh interval and 30-minute stale fallback.

## Darwin Normalization

The Darwin station-board response is accepted only when:

- the body is an object;
- `generatedAt` is a canonical, parseable ISO timestamp;
- `trainServices` is an array; and
- each retained direct service supplies a valid scheduled time, stable service
  ID, operator name, and operator code.

The normalized fields remain:

- `serviceID` → `id`
- `std` → `scheduledDeparture`
- `etd` → `expectedDisplay` and, when it is a clock time,
  `expectedDeparture`
- `platform` → `platform`
- `operator` → `operator`
- `operatorCode` → `operatorCode`
- `isCancelled` → `isCancelled`
- `delayReason` or `cancelReason` → `reason`

Status rules remain:

- cancelled services → `cancelled`
- `On time` → `on_time`
- a valid expected clock time → `delayed`
- every other display value → `unknown`

Cancelled and disrupted services remain visible. Provider failures do not leak
Darwin response bodies, authentication values, or provider-specific error
details into the public API.

## Weather Pressure

The Open-Meteo request adds only `pressure_msl` to its existing `current`
variable list. It does not request hourly or daily data.

The normalized weather value and public weather panel add:

```ts
pressureMslHpa: number | null;
```

For a valid finite value, the dashboard displays the rounded current pressure
with the unit `hPa`. If Open-Meteo unexpectedly omits only this field, pressure
is `null`, the UI displays an unavailable placeholder for that metric, and the
remaining current-weather values stay available.

This is an additive version-1 API change. Existing clients that ignore unknown
fields continue to work. Future ESP32 clients can consume the same numeric
field without parsing display text.

## Stale-Status Accessibility

The current stale status places a ticking age inside `role="status"`. Because
that role is a polite live region, changing the age can cause repeated
screen-reader announcements.

The replacement separates two responsibilities:

- A static live-region message announces that provider data became stale.
- The visual data age is outside the live region, remains available to
  assistive technology during normal navigation, and has live announcements
  disabled.

The one-second dashboard clock may check the visual age, but it changes the DOM
only when the formatted text changes. It does not rebuild dashboard controls or
replace the focused refresh button. This preserves truthful stale ages across
conditional `304` responses without producing continuous announcements.

## Failure Handling

Darwin `401`, timeouts, non-success responses, non-JSON bodies, and malformed
station boards are rail-provider failures. Existing cache behavior determines
the public result:

- an eligible last success becomes a stale departures panel;
- otherwise only departures become unavailable; and
- weather continues independently.

A missing `DARWIN_API_KEY` binding fails the rail request locally without
issuing an unauthenticated upstream call. It does not expose configuration
details publicly.

Pressure absence alone does not make the weather panel unavailable. Existing
validation remains strict for the weather fields already required by the
dashboard.

## Security and Deployment

No credential value is committed, printed, returned by the Worker, or placed in
browser code. Before deployment, the local `DARWIN_API_KEY` value is copied
into the encrypted Worker binding using Wrangler's secret command. The
`DARWIN_API_SECRET` value remains local and unused.

Deployment is built from a clean, committed `main` source state. The exact
commit is pushed to
`https://github.com/chchingyesstyle/mydashboard`, deployed to the existing
Cloudflare Worker, and verified at `dashboard.cchk.uk`.

National Rail and Open-Meteo attribution remains visible. Documentation is
updated so Darwin is the active rail source rather than a future migration.

## Testing and Success Criteria

Implementation follows RED/GREEN test-driven development.

Rail tests prove:

- the exact RDM endpoint, query parameters, seven-second timeout, and
  non-empty `x-apikey` header;
- no credential appears in the URL;
- direct `EUS` filtering retains London Overground and every other operator;
- on-time, delayed, cancelled, unknown, missing-platform, and midnight cases;
- canonical `generatedAt` validation;
- `401`, other non-success responses, malformed JSON, and malformed services
  become provider failures; and
- missing credentials do not issue an upstream request.

Weather and contract tests prove:

- `pressure_msl` is the only new Open-Meteo current variable;
- no hourly or daily series is requested;
- finite pressure is normalized into `pressureMslHpa`;
- missing pressure becomes `null` without losing other weather data; and
- the public version-1 payload includes the additive field.

Accessibility and runtime tests prove:

- a stale transition has a one-time status announcement;
- the ticking age is not a live region;
- identical formatted age text is not reassigned every second;
- visible stale ages still advance across conditional `304` responses; and
- focused controls retain identity and focus.

Before deployment, all unit tests, TypeScript typechecking, the production
build, and Playwright tests must pass. After deployment:

- the public dashboard and `/api/v1/dashboard` return successful responses;
- departures are supplied by the Darwin-normalized path and include direct
  operators returned for `WFJ` to `EUS`;
- live weather includes numeric `pressureMslHpa`;
- a matching `If-None-Match` returns an empty `304` with the same ETag and
  CORS headers;
- landscape and phone layouts have no overflow; and
- no credential is present in the public payload or committed source.
