# Watford Junction to London Euston dashboard

Public live dashboard for direct trains from Watford Junction (`WFJ`) to
London Euston (`EUS`) and current weather at Watford Junction:

<https://dashboard.cchk.uk>

The dashboard includes every direct operator returned by the rail provider,
including London Overground. It shows current weather only—there are no hourly
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

- Rail departures temporarily come from the
  [Huxley 2 Community Edition](https://github.com/davwheat/uk-rail-api)
  proxy for National Rail data. The Worker requests direct `WFJ` to `EUS`
  departures and keeps provider-specific fields inside
  `src/worker/providers/rail.ts`.
- Current conditions come from
  [Open-Meteo](https://open-meteo.com/). The request uses fixed Watford
  Junction coordinates and does not request a forecast series.

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
writing it to source or configuration, then deploy:

```bash
npm run deploy
```

Wrangler builds the saved source and deploys the Worker named
`watford-euston-dashboard` to the configured custom domain. Verify both the page
and `/api/v1/dashboard` after every deployment.

## Darwin migration

Huxley is temporary. When the official National Rail Darwin Consumer key is
available, add it as an encrypted Worker secret:

```bash
npx wrangler secret put DARWIN_API_KEY
```

Enter the value only at Wrangler's prompt. Do not put it in `wrangler.jsonc`,
browser code, the public API response, or Git.

The migration boundary is the rail provider adapter:
`src/worker/providers/rail.ts`. Replace the Huxley request and normalization
there with the Darwin LDBWS Public JSON request, and pass the
`DARWIN_API_KEY` binding into that adapter at the Worker composition boundary.
Keep the adapter output as `Promise<Departure[]>` and preserve
`src/shared/contracts.ts`, `/api/v1/dashboard`, cache behavior, frontend code,
and ESP32 client behavior. Darwin-specific authentication and response fields
must not escape the adapter.
