# Watford Calling Services Filter

## Goal

Show every train from London Euston that Darwin confirms is scheduled to call
at Watford Junction, including services whose final destination is beyond
Watford.

## Problem

The Worker requests the London Euston departure board with `filterCrs=WFJ` and
`filterType=to`. Darwin therefore returns services scheduled to call at Watford
Junction. The rail adapter then applies a second check requiring `WFJ` to appear
in each service's final-destination list.

That second check removes through services such as LNR/WMR trains to Tring,
Milton Keynes, Northampton, or Birmingham. It leaves mainly London Overground
services that terminate at Watford Junction.

## Design

The Darwin board-level filter is authoritative for whether a returned service
calls at the selected destination. The adapter will:

1. Continue requesting the selected origin board with the destination CRS in
   `filterCrs` and `filterType=to`.
2. Validate that the response's `filtercrs` matches the selected destination.
3. Normalize every train service in that filtered board without requiring the
   selected station to be the train's final destination.
4. Keep the public `/api/v1/dashboard` contract, two-hour window, sorting,
   caching, and frontend presentation unchanged.

This behavior applies to both route directions. For Watford Junction to London
Euston, Darwin's filtered board remains the source of truth in the same way.

## Error Handling

A Darwin response with a missing or mismatched `filtercrs` is malformed and
must fail through the existing provider error path. This prevents an
unfiltered or incorrectly filtered board from being exposed.

## Testing

Provider tests will prove that:

- an Euston departure whose final destination is beyond Watford remains visible
  when the board is filtered to `WFJ`;
- a board whose `filtercrs` does not match the requested destination is
  rejected;
- both route requests still send the correct origin and `filterCrs`;
- the existing full test, type-check, build, and browser suites remain green.

After deployment, the production reverse API will be checked for both London
Overground and through LNR/WMR services.
