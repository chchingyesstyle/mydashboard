# RTT Platform Fallback

## Goal

Fill platform gaps in Darwin departure data using the existing Realtime Trains
location response while clearly distinguishing planned platforms from live
platform information.

## Scope

The fallback applies to both dashboard directions:

- Watford Junction to London Euston (`WFJ-EUS`)
- London Euston to Watford Junction (`EUS-WFJ`)

Darwin remains authoritative for the departure list, train status, and any
platform it supplies. RTT remains optional enrichment and never controls
whether a service is visible.

## Platform Priority

For each matched departure, select the first available platform in this order:

1. Darwin platform
2. RTT actual platform
3. RTT planned platform
4. No platform

The web presentation is:

| Selected value | Visible text | Accessible text |
| --- | --- | --- |
| Darwin platform | `Platform 11` | `Platform 11` |
| RTT actual platform | `Platform 8` | `Platform 8` |
| RTT planned platform | `Planned 10` | `Planned platform 10` |
| No platform | `Platform TBC` | `Platform to be confirmed` |

RTT must never replace a non-null Darwin platform.

## Public API

Keep the versioned `/api/v1/dashboard` contract at version `1`. Add the
provider-neutral field below to every `Departure`:

```ts
platformStatus: "live" | "planned" | null;
```

The existing `platform: string | null` field remains unchanged.

- Darwin and RTT actual platforms use `"live"`.
- RTT planned platforms use `"planned"`.
- A missing platform uses `null`.

Provider names and provider-specific field names do not enter the public
contract. The enum remains compact and suitable for a future ESP32 client.

## RTT Adapter

Rename the coach-only RTT normalized record to a service-enrichment record:

```ts
interface RttServiceEnrichment {
  scheduledDeparture: string;
  operatorCode: string;
  coachCount: number | null;
  actualPlatform: string | null;
  plannedPlatform: string | null;
}
```

The existing `/rtt/location` request already contains all three enrichment
values. The adapter normalizes:

- `locationMetadata.numberOfVehicles`
- `locationMetadata.platform.actual`
- `locationMetadata.platform.planned`

A valid scheduled departure and operator code are required. Each optional
enrichment value is independently normalized to its value or `null`. A service
with a platform but no coach count remains useful and must not be discarded.

The RTT client continues to:

- request the selected origin with `filterTo` set to the selected destination;
- reuse its access token until shortly before `validUntil`;
- make one location request per route refresh;
- fail through its existing provider-specific error path for unusable
  top-level responses.

## Caching and Matching

Store the normalized RTT service enrichments in a route-specific cache:

```text
rtt-enrichment:WFJ-EUS
rtt-enrichment:EUS-WFJ
```

The cache remains fresh for five minutes and stale for five minutes. Renaming
the key prevents deployment from reading an incompatible coach-only cached
record.

Match RTT enrichments to Darwin departures using the existing London scheduled
departure time and operator-code key. The same matched record supplies both
coach count and platform fallback.

No additional RTT request is introduced.

## Failure and Missing Data

- If RTT is unavailable and no valid fallback cache exists, keep Darwin
  departures and Darwin platforms while leaving coach count and RTT platform
  enrichment unavailable.
- If a valid RTT fallback cache exists, retain the existing stale-cache
  behavior for up to five minutes.
- If an RTT record does not match a Darwin departure, ignore it.
- If RTT platform values are empty or malformed, treat them as `null`.
- If Darwin has a platform, keep it even when RTT disagrees.
- If only RTT planned data is present, expose it with
  `platformStatus: "planned"` and label it as planned in the web dashboard.

RTT failure does not make the departures panel stale or unavailable.

## Testing

Automated tests will prove that:

- RTT normalizes coach count, actual platform, and planned platform
  independently;
- a platform-only RTT record is retained;
- the priority is Darwin, RTT actual, RTT planned, then unavailable;
- RTT never replaces a Darwin platform;
- an unmatched RTT record is ignored;
- RTT failure leaves Darwin departures available;
- enrichments use one route-specific five-minute cache and introduce no extra
  location request;
- the public API exposes the correct `platformStatus`;
- the web dashboard renders `Platform`, `Planned`, and `Platform TBC` with the
  approved accessible text;
- the existing desktop and phone layouts retain their no-overflow guarantees;
- the full unit, type-check, build, and browser suites remain green.

After deployment, production checks will compare the dashboard with current
Darwin and RTT platform values and verify the page at `dashboard.cchk.uk`.

## Unchanged Behavior

- Darwin remains the sole departure-list provider.
- RTT coach counts remain optional and retain their five-minute refresh.
- Rail refresh timing, weather, route switching, final-destination display,
  ETag, and CORS behavior remain unchanged.
- No provider credential is exposed to browser code or public API responses.
