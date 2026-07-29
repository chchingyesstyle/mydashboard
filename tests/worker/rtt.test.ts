import { describe, expect, it, vi } from "vitest";
import { ROUTES } from "../../src/shared/contracts";
import {
  createRttClient,
  normalizeRttCoachCounts
} from "../../src/worker/providers/rtt";
import {
  rttAccessTokenFixture,
  rttLocationFixture
} from "../fixtures/rtt";

const NOW = new Date("2026-07-29T12:00:00.000Z");

describe("Realtime Trains coach-count provider", () => {
  it("normalizes only valid available passenger vehicle counts", () => {
    expect(normalizeRttCoachCounts(rttLocationFixture)).toEqual([{
      scheduledDeparture: "2026-07-29T12:32:00",
      operatorCode: "LM",
      coachCount: 10
    }]);
  });

  it("uses one access token for both route location requests", async () => {
    const requests: Request[] = [];
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify(
        request.url.endsWith("/api/get_access_token")
          ? rttAccessTokenFixture
          : rttLocationFixture
      ));
    }) as typeof fetch;
    const client = createRttClient(fetcher, "refresh-token");

    await client.fetchCoachCounts(ROUTES["WFJ-EUS"], NOW);
    await client.fetchCoachCounts(ROUTES["EUS-WFJ"], NOW);

    expect(requests.filter(({ url }) =>
      url.endsWith("/api/get_access_token"))).toHaveLength(1);
    const locations = requests.filter(({ url }) => url.includes("/rtt/location"));
    expect(locations.map(({ url }) => {
      const parsed = new URL(url);
      return [parsed.searchParams.get("code"), parsed.searchParams.get("filterTo")];
    })).toEqual([
      ["gb-nr:WFJ", "gb-nr:EUS"],
      ["gb-nr:EUS", "gb-nr:WFJ"]
    ]);
    expect(requests[0].headers.get("authorization")).toBe(
      "Bearer refresh-token"
    );
    expect(locations.every(({ headers }) =>
      headers.get("authorization") === "Bearer access-token"
    )).toBe(true);
    expect(requests.map(({ url }) => url).join("\n")).not.toContain(
      "refresh-token"
    );
    expect(requests.map(({ url }) => url).join("\n")).not.toContain(
      "access-token"
    );
  });

  it("exchanges the access token again inside the expiry margin", async () => {
    let tokenRequests = 0;
    const fetcher = (async (input: string | URL | Request) => {
      if (input.toString().endsWith("/api/get_access_token")) {
        tokenRequests += 1;
        return new Response(JSON.stringify({
          token: "access-token",
          validUntil: "2026-07-29T13:00:00.000Z"
        }));
      }
      return new Response(JSON.stringify(rttLocationFixture));
    }) as typeof fetch;
    const client = createRttClient(fetcher, "refresh-token");

    await client.fetchCoachCounts(ROUTES["WFJ-EUS"], NOW);
    await client.fetchCoachCounts(
      ROUTES["EUS-WFJ"],
      new Date("2026-07-29T12:59:31.000Z")
    );

    expect(tokenRequests).toBe(2);
  });

  it.each([
    [{ token: "access-token" }, "RTT access-token response was malformed"],
    [
      { token: "access-token", validUntil: "not-a-date" },
      "RTT access-token response was malformed"
    ],
    [
      { token: "access-token", validUntil: "2026-07-29T11:59:59.000Z" },
      "RTT access-token response was malformed"
    ]
  ])("rejects an unusable access-token payload", async (payload, message) => {
    const client = createRttClient(
      (async () => new Response(JSON.stringify(payload))) as typeof fetch,
      "refresh-token"
    );

    await expect(client.fetchCoachCounts(
      ROUTES["WFJ-EUS"],
      NOW
    )).rejects.toThrow(message);
  });

  it.each([
    ["an empty refresh token", "", 200, {}, "RTT API token is not configured"],
    [
      "a failed access-token response",
      "refresh-token",
      503,
      {},
      "RTT access-token request failed"
    ],
    [
      "a failed location response",
      "refresh-token",
      503,
      rttAccessTokenFixture,
      "RTT location request failed"
    ],
    [
      "a rate-limited location response",
      "refresh-token",
      429,
      rttAccessTokenFixture,
      "RTT location request failed"
    ]
  ])("rejects %s", async (
    _case,
    refreshToken,
    failureStatus,
    tokenPayload,
    expectedError
  ) => {
    let call = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1 && expectedError !== "RTT API token is not configured") {
        if (expectedError === "RTT access-token request failed") {
          return new Response("unavailable", { status: failureStatus });
        }
        return new Response(JSON.stringify(tokenPayload));
      }
      return new Response("unavailable", { status: failureStatus });
    });
    const client = createRttClient(fetcher, refreshToken);

    await expect(client.fetchCoachCounts(
      ROUTES["WFJ-EUS"],
      NOW
    )).rejects.toThrow(expectedError);
    if (refreshToken === "") {
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("rejects a malformed location response", async () => {
    let call = 0;
    const client = createRttClient((async () => {
      call += 1;
      return new Response(JSON.stringify(
        call === 1 ? rttAccessTokenFixture : { services: "invalid" }
      ));
    }) as typeof fetch, "refresh-token");

    await expect(client.fetchCoachCounts(
      ROUTES["WFJ-EUS"],
      NOW
    )).rejects.toThrow("RTT location response was malformed");
  });

  it("applies a seven-second timeout to token and location requests", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const client = createRttClient((async (input: string | URL | Request) =>
      new Response(JSON.stringify(
        input.toString().endsWith("/api/get_access_token")
          ? rttAccessTokenFixture
          : rttLocationFixture
      ))) as typeof fetch, "refresh-token");

    await client.fetchCoachCounts(ROUTES["WFJ-EUS"], NOW);

    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 7000);
    expect(timeout).toHaveBeenNthCalledWith(2, 7000);
  });
});
