# Watford Junction to London Euston dashboard

Public live dashboard for direct trains from Watford Junction (`WFJ`) to
London Euston (`EUS`) and current weather at Watford Junction:

<https://dashboard.cchk.uk>

The dashboard includes every direct operator returned by the rail provider,
including London Overground. It shows current weather only; there are no hourly
or daily forecasts. On landscape and tablet screens, departures and weather
appear side by side; on phones, current weather moves above departures and the
layout does not require horizontal scrolling. Refresh and fullscreen controls
remain available at each size.

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
  JSON API. The Worker requests every direct `WFJ` to `EUS` departure in the
  next 120 minutes and keeps provider-specific fields inside
  `src/worker/providers/rail.ts`.
- Current conditions come from
  [Open-Meteo](https://open-meteo.com/). The request uses fixed Watford
  Junction coordinates, includes current mean sea-level pressure, and does not
  request a forecast series.

Rail data is provided by National Rail. Weather data is provided by Open-Meteo.
The same attribution appears in the dashboard footer.

## Public API

The browser and future device clients use:

```text
GET https://dashboard.cchk.uk/api/v1/dashboard
```

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

Enter only the Consumer key at Wrangler's prompt. The Worker sends it to the
subscribed gateway only in the `x-apikey` header. Do not put the key in
`wrangler.jsonc`, browser code, the public API response, logs, or Git. The
separate Darwin Consumer secret is not used.

Then deploy:

```bash
npm run deploy
```

Wrangler builds the saved source and deploys the Worker named
`watford-euston-dashboard` to the configured custom domain. Verify both the page
and `/api/v1/dashboard` after every deployment.

Run the checked production API smoke after deployment:

```bash
npm run smoke:production
```

It uses a raw HTTP client to capture the ETag from a `200` response, sends only
`If-None-Match` on the next request, and exits nonzero unless production returns
an empty `304` with the same ETag and CORS header.
