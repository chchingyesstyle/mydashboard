import { describe, expect, it } from "vitest";
import { londonDayBoundsUtc, resolveLondonDeparture, toLondonIso } from "../../src/worker/time";

describe("resolveLondonDeparture", () => {
  it("uses British Summer Time for a summer service", () => {
    expect(resolveLondonDeparture("12:30", "2026-07-28T11:20:00.000Z"))
      .toBe("2026-07-28T12:30:00+01:00");
  });

  it("uses GMT for a winter service", () => {
    expect(resolveLondonDeparture("09:15", "2026-01-28T08:00:00.000Z"))
      .toBe("2026-01-28T09:15:00+00:00");
  });

  it("rolls a late-night summer service into the next London day", () => {
    expect(resolveLondonDeparture("00:10", "2026-07-28T22:55:00.000Z"))
      .toBe("2026-07-29T00:10:00+01:00");
  });

  it("keeps a delayed pre-midnight service on the previous London day", () => {
    expect(resolveLondonDeparture("23:55", "2026-07-28T23:10:00.000Z"))
      .toBe("2026-07-28T23:55:00+01:00");
  });
});

describe("toLondonIso", () => {
  it("converts a summer UTC instant to British Summer Time", () => {
    expect(toLondonIso("2026-07-28T12:00:00Z")).toBe("2026-07-28T13:00:00+01:00");
  });

  it("converts a winter UTC instant to GMT", () => {
    expect(toLondonIso("2026-01-28T09:15:00Z")).toBe("2026-01-28T09:15:00+00:00");
  });

  it("rolls a late-night summer instant into the next London day", () => {
    expect(toLondonIso("2026-07-28T23:30:00Z")).toBe("2026-07-29T00:30:00+01:00");
  });
});

describe("londonDayBoundsUtc", () => {
  it("returns BST-adjusted UTC bounds for a summer day", () => {
    expect(londonDayBoundsUtc(new Date("2026-07-28T12:00:31.000Z"))).toEqual({
      startUtc: "2026-07-27T23:00:00.000Z",
      endUtcExclusive: "2026-07-28T23:00:00.000Z"
    });
  });

  it("returns unadjusted UTC bounds for a winter day", () => {
    expect(londonDayBoundsUtc(new Date("2026-01-28T08:00:00.000Z"))).toEqual({
      startUtc: "2026-01-28T00:00:00.000Z",
      endUtcExclusive: "2026-01-29T00:00:00.000Z"
    });
  });
});
