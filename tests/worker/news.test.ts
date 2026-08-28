import { describe, expect, it, vi } from "vitest";
import {
  HONG_KONG_NEWS_SOURCE,
  UNITED_KINGDOM_NEWS_SOURCE,
  fetchNewsFeed
} from "../../src/worker/providers/news";
import { bbcNewsFixture } from "../fixtures/bbc-news";
import { rthkNewsFixture } from "../fixtures/rthk-news";

describe("RSS news provider", () => {
  it("normalizes RTHK Traditional Chinese headlines in editorial order", async () => {
    const feed = await fetchNewsFeed(
      (async () => new Response(rthkNewsFixture)) as typeof fetch,
      HONG_KONG_NEWS_SOURCE
    );

    expect(feed.source).toBe("RTHK News");
    expect(feed.topStories).toEqual([
      {
        title: "香港首條頭條 & 最新消息",
        publishedAt: "2026-08-28T10:00:00.000Z",
        url: "https://news.rthk.hk/rthk/ch/component/k2/1001-20260828.htm"
      },
      {
        title: "第二條繁體中文新聞",
        publishedAt: "2026-08-28T09:30:00.000Z",
        url: "https://news.rthk.hk/rthk/ch/component/k2/1002-20260828.htm"
      }
    ]);
    expect(feed.latestStories.map(({ title }) => title)).toEqual([
      "第三條即時新聞",
      "第四條即時新聞",
      "第五條即時新聞"
    ]);
  });

  it("normalizes BBC headlines", async () => {
    const feed = await fetchNewsFeed(
      (async () => new Response(bbcNewsFixture)) as typeof fetch,
      UNITED_KINGDOM_NEWS_SOURCE
    );

    expect(feed.source).toBe("BBC News");
    expect(feed.topStories).toHaveLength(2);
    expect(feed.latestStories).toHaveLength(3);
    expect(feed.latestStories[2]).toMatchObject({
      title: "Fifth UK headline",
      publishedAt: "2026-08-28T08:00:00.000Z"
    });
  });

  it("keeps available valid stories when a feed has fewer than five", async () => {
    const feed = await fetchNewsFeed(
      (async () => new Response(rthkNewsFixture.replace(
        /<item><title>第五條即時新聞<\/title>[\s\S]*?<\/item>/,
        ""
      ))) as typeof fetch,
      HONG_KONG_NEWS_SOURCE
    );

    expect(feed.topStories).toHaveLength(2);
    expect(feed.latestStories).toHaveLength(2);
  });

  it("rejects a feed with no valid stories", async () => {
    await expect(fetchNewsFeed(
      (async () => new Response("<rss><channel><item><title>Broken</title></item></channel></rss>")) as typeof fetch,
      HONG_KONG_NEWS_SOURCE
    )).rejects.toThrow("RSS news response was malformed");
  });

  it("rejects a failed response", async () => {
    await expect(fetchNewsFeed(
      (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
      UNITED_KINGDOM_NEWS_SOURCE
    )).rejects.toThrow("RSS news request failed");
  });

  it("aborts the RSS request after seven seconds", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let requestWasAborted = false;
    const fetcher = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        requestWasAborted = true;
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    })) as typeof fetch;

    const feed = fetchNewsFeed(fetcher, HONG_KONG_NEWS_SOURCE);
    controller.abort();

    await expect(feed).rejects.toThrow("The operation was aborted");
    expect(requestWasAborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(7000);
  });
});
