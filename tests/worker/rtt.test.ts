import { describe, expect, it } from "vitest";
import {
  fetchCoachCounts,
  normalizeRttCoachCounts
} from "../../src/worker/providers/rtt";
import {
  rttAccessTokenFixture,
  rttLocationFixture
} from "../fixtures/rtt";

describe("Realtime Trains coach-count provider", () => {
  it("normalizes only valid available passenger vehicle counts", () => {
    expect(normalizeRttCoachCounts(rttLocationFixture)).toEqual([{
      scheduledDeparture: "2026-07-29T12:32:00",
      operatorCode: "LM",
      coachCount: 10
    }]);
  });

  it("requests a location line-up with exchanged bearer credentials", async () => {
    const requests: Request[] = [];
    const fetcher = (async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      const request = new Request(input, init);
      requests.push(request);
      return new Response(JSON.stringify(
        requests.length === 1 ? rttAccessTokenFixture : rttLocationFixture
      ));
    }) as typeof fetch;

    await expect(fetchCoachCounts(fetcher, "refresh-token")).resolves.toEqual([{
      scheduledDeparture: "2026-07-29T12:32:00",
      operatorCode: "LM",
      coachCount: 10
    }]);

    expect(requests).toHaveLength(2);
    expect(requests[0].url).toBe("https://data.rtt.io/api/get_access_token");
    expect(requests[0].headers.get("authorization")).toBe("Bearer refresh-token");
    expect(requests[1].headers.get("authorization")).toBe("Bearer access-token");
    const locationUrl = new URL(requests[1].url);
    expect(locationUrl.origin + locationUrl.pathname).toBe(
      "https://data.rtt.io/rtt/location"
    );
    expect(locationUrl.searchParams.get("code")).toBe("gb-nr:WFJ");
    expect(locationUrl.searchParams.get("filterTo")).toBe("gb-nr:EUS");
    expect(requests.map((request) => request.url).join("\n")).not.toContain("refresh-token");
    expect(requests.map((request) => request.url).join("\n")).not.toContain("access-token");
  });

  it.each([
    ["an empty refresh token", "", "RTT API token is not configured"],
    ["a failed access-token response", "refresh-token", "RTT access-token request failed"],
    ["a missing access token", "refresh-token", "RTT access-token response was malformed"],
    ["a failed location response", "refresh-token", "RTT location request failed"],
    ["a malformed location response", "refresh-token", "RTT location response was malformed"]
  ])("rejects %s", async (_case, refreshToken, expectedError) => {
    let call = 0;
    const fetcher = (async () => {
      call += 1;
      if (expectedError === "RTT access-token request failed") {
        return new Response("unavailable", { status: 503 });
      }
      if (expectedError === "RTT access-token response was malformed") {
        return new Response(JSON.stringify({}));
      }
      if (expectedError === "RTT location request failed") {
        return call === 1
          ? new Response(JSON.stringify(rttAccessTokenFixture))
          : new Response("unavailable", { status: 503 });
      }
      if (expectedError === "RTT location response was malformed") {
        return call === 1
          ? new Response(JSON.stringify(rttAccessTokenFixture))
          : new Response(JSON.stringify({ services: "invalid" }));
      }
      return new Response("unreachable");
    }) as typeof fetch;

    await expect(fetchCoachCounts(fetcher, refreshToken)).rejects.toThrow(expectedError);
  });
});
