# E1001 Hong Kong and UK News Dashboards Design

## Purpose

Add two E1001 screens for current Hong Kong and UK news while retaining the
existing right-hand current-weather and Octopus Agile electricity panels. The
Hong Kong screen renders Traditional Chinese; the UK screen renders English.

## Scope

- Add two additive news panels to `GET /api/v1/dashboard`; the browser UI does
  not render them.
- The Cloudflare Worker fetches, normalizes, and caches public RSS feeds; the
  E1001 continues to make its single dashboard API request and never fetches
  RSS directly.
- Add `Hong Kong News` and `UK News` to the E1001 screen cycle after Forecast
  and before `All Departures`.
- Keep the existing automatic default screens: commute during 06:00–08:59
  local time, then the combined Forecast screen. News appears only through the
  override-button cycle.
- Keep the entire right column unchanged for both news screens: weather in its
  top half and electricity in its bottom half.

Out of scope:

- A browser news panel, an API key, a paid news service, a background
  Cloudflare cron trigger, article bodies, images, or reader-click popularity
  metrics.

## Sources and editorial ordering

- Hong Kong uses RTHK's official local-news RSS feed:
  `https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml`.
- UK uses BBC News's official headline RSS feed:
  `https://feeds.bbci.co.uk/news/rss.xml`.
- Each feed's first three valid entries are `topStories`: editorial headline
  order is the accepted definition of “popular”. The next six valid entries
  are `latestStories`; the two lists never overlap.
- The API stores and the E1001 displays only title, publication time, article
  URL, and source attribution. It does not retain or render descriptions or
  images. The UK screen visibly credits `BBC News` and keeps the article URLs
  in the API response.

## API contract and Worker behavior

`DashboardPayload` gains an additive `news` object while `version` remains
`1`:

```ts
interface NewsStory {
  title: string;
  publishedAt: string; // ISO 8601 UTC
  url: string;
}

interface NewsPanel {
  status: PanelStatus;
  updatedAt: string | null;
  stale: boolean;
  source: string;
  topStories: NewsStory[];    // at most 3
  latestStories: NewsStory[]; // at most 6
  error: string | null;
}

interface DashboardPayload {
  // existing fields
  news: {
    hongKong: NewsPanel;
    unitedKingdom: NewsPanel;
  };
}
```

A focused RSS provider parses RSS XML with a maintained XML parser dependency,
decodes headline text as UTF-8, converts valid publication timestamps to ISO
8601 UTC, and skips malformed entries. A feed with fewer than nine valid
entries returns the available entries rather than failing the whole panel. A
panel with no valid entry is unavailable.

`loadWithFallback` caches the two panels independently under
`news:hong-kong` and `news:united-kingdom`:

- freshness: 5 minutes;
- stale fallback: 60 minutes;
- refresh occurs only on an incoming dashboard request, never through a
  scheduled Worker;
- the existing public response `Cache-Control: max-age=15` stays unchanged.

News is independent of departures, weather, and electricity. A news failure
does not change top-level `DashboardStatus`; it produces a stale or unavailable
news panel only. `generatedAt` includes successful news update times so a new
headline produces a new ETag and an E1001 redraw on its next request.

## Firmware model, layout, and rendering

`dashboard_parser` gains matching news story and panel model types. Missing,
malformed, or non-string title, URL, and publication-time values are skipped
per story. `news` remains optional in the public additive contract: an absent
object becomes two unavailable panels in the new firmware, so existing clients
continue to accept the response during a staged Worker and firmware deploy.

`Screen` gains `HongKongNews` and `UkNews`. After the combined-forecast
extension, the five-screen fixed cycle is:

```text
Commute → Forecast → Hong Kong News → UK News → All Departures
```

Both news screens request the existing `WFJ-ALL` dashboard route so their
right-column weather remains Watford Junction weather. Their left column is
480px wide below the existing header and renders:

1. source name and news update time;
2. `Top Stories` with three larger, wrapped titles;
3. `Latest` with six smaller titles, wrapping to two lines when needed, and
   Europe/London publication times aligned to the right.

The Hong Kong screen uses Chinese section labels and the incoming Traditional
Chinese titles. The UK screen uses the English labels `Top Stories` and
`Latest`. If a panel is stale, its source/update line says `Stale`; if it is
unavailable, the left panel says that the region's news is unavailable while
the unchanged weather and electricity panels remain visible.

The current Adafruit FreeSans fonts cover only ASCII and cannot render news
headlines in Traditional Chinese. Add `U8g2_for_Adafruit_GFX`, which attaches
to the existing GxEPD2/Adafruit-GFX display without replacing the display
driver. The Hong Kong renderer uses the UTF-8 `u8g2_font_unifont_h_chinese4`
asset (7,199 glyphs including a Traditional Chinese common-character list,
about 318KB). Its upstream attribution and licence text are preserved with the
vendored font asset. Existing FreeSans rendering remains unchanged everywhere
else.

## Tests and verification

- Worker tests cover valid RSS normalization, UTF-8 Traditional Chinese text,
  malformed-item skipping, independent 5-minute/60-minute cache behavior,
  stale fallback, and no effect on top-level status.
- Worker dashboard tests cover the additive `news` contract and ETag change
  when news changes.
- E1001 parser tests cover valid panels, malformed stories, stale, and
  unavailable states. Route-selector and layout tests cover both extra screens,
  the five-screen cycle, title grouping, and unchanged right-column data.
- Device rendering is verified by building for `xiao_esp32s3`, flashing COM3,
  and visually checking a real Traditional Chinese RTHK headline plus the UK
  screen, weather, electricity, and a news-failure fallback.
