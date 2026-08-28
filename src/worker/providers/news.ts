import { XMLParser } from "fast-xml-parser";

export interface NewsStory {
  title: string;
  publishedAt: string;
  url: string;
}

export interface NewsFeed {
  source: string;
  topStories: NewsStory[];
  latestStories: NewsStory[];
}

export interface NewsSource {
  source: string;
  url: string;
}

export const HONG_KONG_NEWS_SOURCE: NewsSource = {
  source: "RTHK News",
  url: "https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml"
};

export const UNITED_KINGDOM_NEWS_SOURCE: NewsSource = {
  source: "BBC News",
  url: "https://feeds.bbci.co.uk/news/rss.xml"
};

const parser = new XMLParser({
  processEntities: true,
  trimValues: true
});

function malformedResponse(): never {
  throw new Error("RSS news response was malformed");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function decodeHeadline(value: string): string {
  return value.replace(/&(amp|apos|gt|lt|quot);/g, (_entity, name: string) => ({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\""
  })[name]);
}

function entriesFrom(response: unknown): unknown[] {
  if (typeof response !== "object" || response === null) malformedResponse();

  const rss = (response as Record<string, unknown>).rss;
  if (typeof rss !== "object" || rss === null) malformedResponse();
  const channel = (rss as Record<string, unknown>).channel;
  if (typeof channel !== "object" || channel === null) malformedResponse();
  const items = (channel as Record<string, unknown>).item;
  if (items === undefined) return [];
  return Array.isArray(items) ? items : [items];
}

function storyFrom(entry: unknown): NewsStory | null {
  if (typeof entry !== "object" || entry === null) return null;
  const item = entry as Record<string, unknown>;
  const rawTitle = stringValue(item.title);
  const rawUrl = stringValue(item.link);
  const published = stringValue(item.pubDate);
  if (rawTitle === null || rawUrl === null || published === null) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const timestamp = Date.parse(published);
  if (Number.isNaN(timestamp)) return null;
  return {
    title: decodeHeadline(rawTitle),
    publishedAt: new Date(timestamp).toISOString(),
    url: url.toString()
  };
}

export async function fetchNewsFeed(
  fetcher: typeof fetch,
  source: NewsSource
): Promise<NewsFeed> {
  const response = await fetcher(source.url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error("RSS news request failed");

  let parsed: unknown;
  try {
    parsed = parser.parse(await response.text());
  } catch {
    malformedResponse();
  }

  const stories = entriesFrom(parsed)
    .map(storyFrom)
    .filter((story): story is NewsStory => story !== null)
    .slice(0, 5);
  if (stories.length === 0) malformedResponse();

  return {
    source: source.source,
    topStories: stories.slice(0, 2),
    latestStories: stories.slice(2, 5)
  };
}
