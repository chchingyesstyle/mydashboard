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
      },
      {
        title: "第三條即時新聞",
        publishedAt: "2026-08-28T09:00:00.000Z",
        url: "https://news.rthk.hk/rthk/ch/component/k2/1003-20260828.htm"
      }
    ]);
    expect(feed.latestStories.map(({ title }) => title)).toEqual([
      "第四條即時新聞",
      "第五條即時新聞",
      "第六條即時新聞",
      "第七條即時新聞",
      "第八條即時新聞",
      "第九條即時新聞"
    ]);
  });

  it("normalizes BBC headlines", async () => {
    const feed = await fetchNewsFeed(
      (async () => new Response(bbcNewsFixture)) as typeof fetch,
      UNITED_KINGDOM_NEWS_SOURCE
    );

    expect(feed.source).toBe("BBC News");
    expect(feed.topStories).toHaveLength(3);
    expect(feed.latestStories).toHaveLength(6);
    expect(feed.latestStories[5]).toMatchObject({
      title: "Ninth UK headline",
      publishedAt: "2026-08-28T06:00:00.000Z"
    });
  });

  it("identifies itself and requests RSS from protected feeds", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestInit = init;
      return new Response(rthkNewsFixture);
    }) as typeof fetch;

    await fetchNewsFeed(fetcher, HONG_KONG_NEWS_SOURCE);

    const headers = new Headers(requestInit?.headers);
    expect(headers.get("accept")).toContain("application/rss+xml");
    expect(headers.get("user-agent")).toBe("watford-euston-dashboard/1.0");
  });

  it("upgrades an HTTP feed redirect before following it", async () => {
    const requestedUrls: string[] = [];
    const fetcher = (async (url: string | URL | Request) => {
      requestedUrls.push(url.toString());
      if (requestedUrls.length === 1) {
        return new Response(null, {
          status: 301,
          headers: {
            Location: "http://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml"
          }
        });
      }
      return new Response(rthkNewsFixture);
    }) as typeof fetch;

    await fetchNewsFeed(fetcher, HONG_KONG_NEWS_SOURCE);

    expect(requestedUrls).toEqual([
      HONG_KONG_NEWS_SOURCE.url,
      "https://rthk9.rthk.hk/rthk/news/rss/c_expressnews_clocal.xml"
    ]);
  });

  it("keeps available valid stories when a feed has fewer than nine", async () => {
    const shortFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item><title>第一條新聞</title><link>https://news.rthk.hk/story/1</link><pubDate>Fri, 28 Aug 2026 10:00:00 GMT</pubDate></item>
  <item><title>第二條新聞</title><link>https://news.rthk.hk/story/2</link><pubDate>Fri, 28 Aug 2026 09:30:00 GMT</pubDate></item>
  <item><title>第三條新聞</title><link>https://news.rthk.hk/story/3</link><pubDate>Fri, 28 Aug 2026 09:00:00 GMT</pubDate></item>
  <item><title>第四條新聞</title><link>https://news.rthk.hk/story/4</link><pubDate>Fri, 28 Aug 2026 08:30:00 GMT</pubDate></item>
</channel></rss>`;
    const feed = await fetchNewsFeed(
      (async () => new Response(shortFixture)) as typeof fetch,
      HONG_KONG_NEWS_SOURCE
    );

    expect(feed.topStories).toHaveLength(3);
    expect(feed.latestStories).toHaveLength(1);
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
