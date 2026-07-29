# Watford Junction–London Euston dashboard

Public live dashboard for direct trains in both directions between Watford
Junction (`WFJ`) and London Euston (`EUS`), with weather at the selected
departure station:

<https://dashboard.cchk.uk>

The dashboard includes every direct operator returned by the rail provider,
including London Overground. Use **To Euston** or **To Watford** in the header
to change direction. A reload always returns to Watford-to-Euston; the separate
light/dark theme preference remains saved. Weather includes current conditions,
today's minimum and maximum temperatures, next-six-hour rain chance, and mean
sea-level pressure for the departure station. On landscape and tablet screens,
departures and weather appear side by side; on phones, weather moves above
departures without horizontal scrolling.

## Local development

Install the locked dependencies and start Vite:

```bash
npm install
npm run dev
```

Vite prints the local URL. The development Worker serves both the frontend and
`GET /api/v1/dashboard`.

Run the complete verification gate before publishing or deploying:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
git status --short
```

The Playwright suite starts a production preview automatically. If its Chromium
binary is not installed on a new machine, install it once with:

```bash
npx playwright install chromium
```

## Data sources and attribution

- Rail departures come from the subscribed
  [National Rail Darwin Live Departure Board](https://www.nationalrail.co.uk/developers/darwin-data-feeds/)
  JSON API. The Worker requests every direct departure in the selected
  direction for the next 120 minutes and keeps provider-specific fields inside
  `src/worker/providers/rail.ts`. Darwin refreshes at most every 30 seconds per
  route.
- Available coach counts come from Realtime Trains and are cached for five
  minutes per route. RTT failures never remove Darwin departures.
- Weather comes from [Open-Meteo](https://open-meteo.com/). The request uses
  fixed coordinates for the selected origin and is cached for 10 minutes.

Rail data is provided by National Rail. Weather data is provided by Open-Meteo.
The same attribution appears in the dashboard footer.

## Public API

The browser and future device clients use:

```text
GET https://dashboard.cchk.uk/api/v1/dashboard
GET https://dashboard.cchk.uk/api/v1/dashboard?route=WFJ-EUS
GET https://dashboard.cchk.uk/api/v1/dashboard?route=EUS-WFJ
```

The request without a `route` query defaults to `WFJ-EUS`. Empty, repeated, or
unsupported route values return `400 Bad Request`.

The versioned response has stable, provider-neutral fields, ISO 8601
timestamps, compact status enums, CORS support, and independent `departures`
and `weather` panels. It is suitable for a future Seeed Studio reTerminal E1001
ESP32 client without scraping HTML.

`weather.pressureMslHpa` is the current mean sea-level pressure in
hectopascals. It is numeric when supplied by Open-Meteo and `null` when that
single measurement is unavailable. This additive field does not change the
response `version`, which remains `1`.

Responses include an `ETag`. A device should retain it and use a conditional
request on its next poll:

```http
GET /api/v1/dashboard HTTP/1.1
Host: dashboard.cchk.uk
If-None-Match: "<previous ETag>"
```

An unchanged response returns `304 Not Modified` with no JSON body. The device
can then keep its existing parsed payload and avoid an unnecessary download and
ePaper refresh.

## Cloudflare deployment

The Vite build is served by a Cloudflare Worker configured in `wrangler.jsonc`.
That configuration owns the custom domain `dashboard.cchk.uk` and routes
`/api/*` through the Worker before static assets.

Make a Cloudflare API token available to Wrangler in the current shell without
writing it to source or configuration. Store the Darwin Consumer key as an
encrypted Worker secret:

```bash
npx wrangler secret put DARWIN_API_KEY
```

Enter only the Consumer key at Wrangler's prompt. Store the Realtime Trains
refresh token separately:

```bash
npx wrangler secret put RTT_API_TOKEN
```

The Worker sends the Darwin key to the
subscribed gateway only in the `x-apikey` header. Do not put the key in
`wrangler.jsonc`, browser code, the public API response, logs, or Git. The
separate Darwin Consumer secret is not used. The Worker exchanges
`RTT_API_TOKEN` for a short-lived access token and never exposes either RTT
token publicly.

Then deploy:

```bash
npm run deploy
```

Wrangler builds the saved source and deploys the Worker named
`watford-euston-dashboard` to the configured custom domain. Verify the page,
both route variants, and the default `/api/v1/dashboard` after every
deployment.

Run the checked production API smoke after deployment:

```bash
npm run smoke:production
```

It uses a raw HTTP client to capture the ETag from a `200` response, sends only
`If-None-Match` on the next request, and exits nonzero unless production returns
an empty `304` with the same ETag and CORS header.
