# RTT Coach Count Design

## Goal

Show the available number of coaches for each direct Watford Junction to London
Euston departure.

## Scope

- Keep Darwin as the authoritative provider for the departure list.
- Use Realtime Trains (RTT) only to enrich matching departures with a coach
  count.
- Add `coachCount: number | null` to each public departure object.
- Display a count beside the operator as `Operator · 10 coaches`.
- Keep the operator alone when RTT does not provide a count.
- Do not change train ordering, delay/cancellation status, weather, themes, or
  the public API version.

## RTT Integration

- Keep `RTT_API_TOKEN` in a Cloudflare Worker secret; never expose it to the
  browser or public API.
- Exchange the refresh token for an RTT access token on the Worker.
- Query `https://data.rtt.io/rtt/location` for `gb-nr:WFJ` filtered to
  `gb-nr:EUS`.
- Refresh the RTT coach-count map at most once per minute. This uses two RTT
  calls per refresh: access-token exchange and location query.
- Match an RTT service to a Darwin departure by its booked London local
  departure time and operator code.
- If the RTT token is absent, RTT rejects a call, or a service has no
  `numberOfVehicles`, set the applicable count to `null` without making
  the departures panel unavailable.

## Presentation and Accessibility

- Add ` · N coach` or ` · N coaches` immediately after the existing
  visible operator name.
- Screen readers receive the same natural text.
- Preserve the compact desktop and phone departure layout. The count may wrap
  with the operator rather than creating horizontal overflow.

## Verification

- Add provider tests for access-token exchange, RTT location normalisation,
  and absent vehicle counts.
- Add dashboard tests that merge RTT counts without affecting Darwin
  departures when RTT is unavailable.
- Add rendering coverage for singular, plural, and unavailable counts.
- Run unit tests, type-checking, browser tests, build, production smoke
  tests, and a production RTT-backed coach-count check.
