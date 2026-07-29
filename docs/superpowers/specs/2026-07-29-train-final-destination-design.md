# Train Final Destination

## Goal

Help passengers identify Euston departures that call at Watford Junction by
showing each train's actual final destination, such as Tring, Milton Keynes
Central, Birmingham New Street, or Watford Junction.

## Scope

The public dashboard continues to show only services scheduled to call at the
selected route destination. The final destination is additional identifying
information; it does not change route filtering.

The web dashboard displays final destinations only for the `EUS-WFJ` route.
The `WFJ-EUS` layout remains unchanged because London Euston is already the
useful route destination and the dashboard should remain compact.

## Public API

Add the following provider-neutral field to every `Departure` in the
versioned `/api/v1/dashboard` response:

```ts
finalDestination: {
  name: string;
  crs: string;
} | null;
```

This is an additive, non-breaking extension to version 1. It is suitable for
both the TypeScript frontend and a future ESP32 client. The field describes
the train's final destination, not the dashboard route destination.

The Darwin adapter reads the service's destination collection and selects the
first entry containing non-empty `locationName` and `crs` strings. If Darwin
does not provide a valid destination, `finalDestination` is `null`; the
service remains visible.

No Darwin-specific property names enter the public contract.

## Web Presentation

For `EUS-WFJ`, append the destination to the existing operator metadata line:

```text
LNR & WMR · To Birmingham New Street · 8 coaches
```

Examples without coach information:

```text
London Overground · To Watford Junction
LNR & WMR · To Tring
```

If `finalDestination` is `null`, show the existing operator and coach text
without a destination placeholder. For `WFJ-EUS`, do not display the field
even when it is present in the API.

The existing metadata line may wrap naturally on narrow screens. Do not add a
new column, an expandable control, or a separate row, so the board retains its
current information density.

## Accessibility

For `EUS-WFJ`, include the final destination in each departure article's
accessible label when it is available. Visible text remains the accessible
source for the operator metadata line.

No interactive control is added. Keyboard behavior and focus order remain
unchanged.

## Error Handling

- Missing, empty, or malformed Darwin destination data maps to `null`.
- A missing final destination does not make the departures panel unavailable.
- Existing Darwin response, route, cache, and stale-data behavior remains
  unchanged.

## Testing

Automated tests will prove that:

- the Darwin adapter normalizes a final destination name and CRS;
- missing or malformed destination data maps to `null` without removing the
  service;
- the Euston-to-Watford board displays the real final destination with and
  without a coach count;
- the Watford-to-Euston board does not display final-destination metadata;
- the accessible departure label includes the destination only when displayed;
- large-screen and phone layouts retain their existing no-overflow guarantees;
- the full unit, type-check, build, and browser suites remain green.

After deployment, the production API and page will be checked for London
Overground terminating at Watford and LNR/WMR trains continuing beyond it.

## Unchanged Behavior

- Darwin remains the authoritative rail provider.
- RTT coach counts remain optional five-minute enrichment.
- Rail refresh timing, two-hour window, caching, ETag, and CORS remain
  unchanged.
- Weather behavior and presentation remain unchanged.
