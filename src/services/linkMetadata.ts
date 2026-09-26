/**
 * Best-effort "link preview" lookup: reads the Open Graph / Twitter Card meta tags a movie's
 * page (Netflix, IMDb, TMDB, Disney+, JustWatch, ...) already exposes for link-sharing previews
 * — the same mechanism iMessage/WhatsApp/Discord's own unfurler use — so a pasted URL can resolve
 * to a real title and poster image without any provider-specific API or key.
 */

const USER_AGENT = "Mozilla/5.0 (compatible; MovieNightBot/1.0; +link-preview)";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 300_000;
const DEFAULT_MAX_REDIRECTS = 5;

export interface LinkMetadata {
  title: string;
  imageUrl: string | null;
}

export interface FetchLinkMetadataOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
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

/** Rejects loopback/private/link-local hosts so a pasted URL can't make the bot probe its own network (SSRF). */
function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "::") return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // unique-local IPv6 (fc00::/7)
  if (/^fe80:/.test(host)) return true; // link-local IPv6
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    let currentUrl = inputUrl;
    for (let redirects = 0; redirects <= maxRedirects; redirects++) {
      const url = validateFetchableUrl(currentUrl);
      if (!url) return null;

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
