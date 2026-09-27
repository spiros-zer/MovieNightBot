/**
 * Best-effort "link preview" lookup: reads the Open Graph / Twitter Card meta tags a movie's
 * page (Netflix, IMDb, TMDB, Disney+, JustWatch, ...) already exposes for link-sharing previews
 * — the same mechanism iMessage/WhatsApp/Discord's own unfurler use — so a pasted URL can resolve
 * to a real title and poster image without any provider-specific API or key.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

const USER_AGENT = "Mozilla/5.0 (compatible; MovieNightBot/1.0; +link-preview)";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 300_000;
const DEFAULT_MAX_REDIRECTS = 5;

export interface LinkMetadata {
  title: string;
  imageUrl: string | null;
}

export type DnsLookupImpl = (hostname: string) => Promise<{ address: string; family: number }[]>;

export interface FetchLinkMetadataOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Injectable for tests; defaults to a real DNS lookup so a rebinding domain can be caught. */
  dnsLookupImpl?: DnsLookupImpl;
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Rejects loopback/private/link-local/reserved hosts so a pasted URL can't make the bot probe its own network (SSRF). */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv4-mapped IPv6, hex-group form (e.g. "::ffff:7f00:1" — how the WHATWG URL parser and most
  // resolvers normalize "::ffff:127.0.0.1"): unpack the two 16-bit groups back into 4 octets.
  const v4MappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4MappedHex) {
    const hi = parseInt(v4MappedHex[1], 16);
    const lo = parseInt(v4MappedHex[2], 16);
    return isPrivateOrLoopbackHost(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
  }
  // IPv4-mapped/compatible IPv6, dotted-decimal form (e.g. "::ffff:127.0.0.1").
  const v4MappedDotted = host.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedDotted) return isPrivateOrLoopbackHost(v4MappedDotted[1]);

  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "::") return true;
  if (/^0\./.test(host)) return true; // 0.0.0.0/8 ("this network")
  if (/^127\./.test(host)) return true; // loopback
  if (/^10\./.test(host)) return true; // private
  if (/^192\.168\./.test(host)) return true; // private
  if (/^169\.254\./.test(host)) return true; // link-local (incl. cloud metadata endpoints)
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true; // private
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true; // 100.64.0.0/10 (shared/CGNAT)
  if (/^(22[4-9]|23\d)\./.test(host)) return true; // 224.0.0.0/4 multicast
  if (/^(24\d|25[0-5])\./.test(host)) return true; // 240.0.0.0/4 reserved + broadcast
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // unique-local IPv6 (fc00::/7)
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // link-local IPv6 (fe80::/10)
  return false;
}

function validateFetchableUrl(rawUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isPrivateOrLoopbackHost(url.hostname)) return null;
  return url;
}

/**
 * Resolves `hostname` and checks every address it comes back with — not just the URL's literal
 * hostname string — so a domain that *resolves* to a private/loopback IP (DNS rebinding) is
 * rejected too, not only a URL that's obviously private on its face. A lookup failure is treated
 * as unsafe: the fetch would fail anyway, and failing closed costs nothing.
 */
async function resolvesToPrivateHost(hostname: string, dnsLookupImpl: DnsLookupImpl): Promise<boolean> {
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bareHost)) return isPrivateOrLoopbackHost(bareHost);

  let records: { address: string }[];
  try {
    records = await dnsLookupImpl(bareHost);
  } catch {
    return true;
  }
  return records.length === 0 || records.some((record) => isPrivateOrLoopbackHost(record.address));
}

async function readLimitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const decoder = new TextDecoder();
  let result = "";
  let received = 0;
  try {
    while (received < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)));
}

function extractMetaContent(html: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escapedKey}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapedKey}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() || null : null;
}

/** Strips the "Watch " prefix and " | Site Name" suffix streaming sites (Netflix included) commonly wrap the real title in. */
function cleanTitle(rawTitle: string): string {
  const withoutSiteSuffix = rawTitle.split(" | ")[0].trim();
  return withoutSiteSuffix.replace(/^watch\s+/i, "").trim() || withoutSiteSuffix;
}

/**
 * Fetches `inputUrl` and reads its link-preview title/image, or null if the URL is unsafe to
 * fetch, unreachable, not HTML, or has no discoverable title. Never throws.
 */
export async function fetchLinkMetadata(inputUrl: string, options: FetchLinkMetadataOptions = {}): Promise<LinkMetadata | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsLookupImpl = options.dnsLookupImpl ?? ((hostname: string) => dnsLookup(hostname, { all: true }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    let currentUrl = inputUrl;
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const url = validateFetchableUrl(currentUrl);
      if (!url) return null;
      if (await resolvesToPrivateHost(url.hostname, dnsLookupImpl)) return null;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        });
      } catch {
        return null;
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        try {
          currentUrl = new URL(location, url).toString();
        } catch {
          return null;
        }
        continue;
      }

      if (!response.ok) return null;

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        return null;
      }

      const html = await readLimitedText(response);
      const title = extractMetaContent(html, "og:title") ?? extractMetaContent(html, "twitter:title") ?? extractTitleTag(html);
      if (!title) return null;

      const rawImage = extractMetaContent(html, "og:image") ?? extractMetaContent(html, "twitter:image");
      let imageUrl: string | null = null;
      if (rawImage) {
        try {
          imageUrl = new URL(rawImage, url).toString();
        } catch {
          imageUrl = null;
        }
      }

      return { title: cleanTitle(title), imageUrl };
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
