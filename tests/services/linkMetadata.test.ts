import { describe, expect, it, vi } from "vitest";
import { fetchLinkMetadata, looksLikeUrl } from "../../src/services/linkMetadata";

/** Stands in for a real DNS lookup in tests that don't care about it, resolving any hostname to a public IP. */
async function publicDns(): Promise<{ address: string; family: number }[]> {
  return [{ address: "93.184.216.34", family: 4 }];
}

function htmlResponse(html: string, init?: { status?: number; contentType?: string }): Response {
  return new Response(html, {
    status: init?.status ?? 200,
    headers: { "content-type": init?.contentType ?? "text/html; charset=utf-8" },
  });
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

describe("looksLikeUrl", () => {
  it("accepts http(s) urls", () => {
    expect(looksLikeUrl("https://www.netflix.com/title/70143836")).toBe(true);
    expect(looksLikeUrl("http://example.com")).toBe(true);
  });

  it("rejects plain titles and non-http(s) schemes", () => {
    expect(looksLikeUrl("The Matrix")).toBe(false);
    expect(looksLikeUrl("ftp://example.com/movie")).toBe(false);
    expect(looksLikeUrl("javascript:alert(1)")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });
});

describe("fetchLinkMetadata", () => {
  it("reads the og:title and og:image tags from the page", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(`
        <html><head>
          <meta property="og:title" content="The Matrix (1999)" />
          <meta property="og:image" content="https://img.example.com/matrix.jpg" />
        </head></html>
      `),
    );

    const result = await fetchLinkMetadata("https://www.netflix.com/title/70143836", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result).toEqual({ title: "The Matrix (1999)", imageUrl: "https://img.example.com/matrix.jpg" });
  });

  it("handles content attribute appearing before the property attribute", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(`<meta content="Inception" property="og:title">`),
    );

    const result = await fetchLinkMetadata("https://example.com/inception", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("Inception");
  });

  it("falls back to twitter:title then <title> when og:title is missing", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(`<meta name="twitter:title" content="Dune: Part Two">`))
      .mockResolvedValueOnce(htmlResponse(`<title>Arrival (2016)</title>`));

    const first = await fetchLinkMetadata("https://example.com/dune", { fetchImpl, dnsLookupImpl: publicDns });
    expect(first?.title).toBe("Dune: Part Two");

    const second = await fetchLinkMetadata("https://example.com/arrival", { fetchImpl, dnsLookupImpl: publicDns });
    expect(second?.title).toBe("Arrival (2016)");
  });

  it("strips Netflix's 'Watch X | Netflix'-style site branding from the title", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(`<meta property="og:title" content="Watch Hypnotic | Netflix Official Site">`));
    const result = await fetchLinkMetadata("https://www.netflix.com/title/81225962", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("Hypnotic");
  });

  it("strips a trailing site suffix without a leading 'Watch'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(`<meta property="og:title" content="Secret Window | Netflix">`));
    const result = await fetchLinkMetadata("https://www.netflix.com/title/60034561", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("Secret Window");
  });

  it("leaves a plain title with no site suffix untouched", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(`<meta property="og:title" content="The Matrix (1999)">`));
    const result = await fetchLinkMetadata("https://letterboxd.com/film/the-matrix/", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("The Matrix (1999)");
  });

  it("decodes HTML entities in the title", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(`<meta property="og:title" content="Fast &amp; Furious: Tokyo Drift">`),
    );

    const result = await fetchLinkMetadata("https://example.com/fast", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("Fast & Furious: Tokyo Drift");
  });

  it("resolves a relative og:image against the page URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(`
        <meta property="og:title" content="Coco">
        <meta property="og:image" content="/images/coco.jpg">
      `),
    );

    const result = await fetchLinkMetadata("https://example.com/movies/coco", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.imageUrl).toBe("https://example.com/images/coco.jpg");
  });

  it("follows a bounded number of redirects and validates the final host", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://real.example.com/movie"))
      .mockResolvedValueOnce(htmlResponse(`<meta property="og:title" content="Redirected Movie">`));

    const result = await fetchLinkMetadata("https://short.link/abc", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result?.title).toBe("Redirected Movie");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses to follow a redirect into a private/internal host (SSRF guard)", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirectResponse("http://169.254.169.254/latest/meta-data/"));

    const result = await fetchLinkMetadata("https://short.link/abc", { fetchImpl, dnsLookupImpl: publicDns });
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null without fetching for a private/loopback/internal URL", async () => {
    const fetchImpl = vi.fn();

    expect(await fetchLinkMetadata("http://localhost:8080/x", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(await fetchLinkMetadata("http://127.0.0.1/x", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(await fetchLinkMetadata("http://192.168.1.5/x", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(await fetchLinkMetadata("http://10.0.0.1/x", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null without fetching for an IPv4-mapped IPv6 loopback literal (SSRF guard)", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchLinkMetadata("http://[::ffff:127.0.0.1]/x", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves (via DNS) to a private/loopback address, even though the URL itself looks public (DNS rebinding guard)", async () => {
    const fetchImpl = vi.fn();
    const rebindingDns = vi.fn().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await fetchLinkMetadata("https://attacker-controlled.example/x", { fetchImpl, dnsLookupImpl: rebindingDns });

    expect(result).toBeNull();
    expect(rebindingDns).toHaveBeenCalledWith("attacker-controlled.example");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a hostname where only one of several resolved addresses is private (DNS rebinding guard)", async () => {
    const fetchImpl = vi.fn();
    const multiHomedDns = vi.fn().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);

    const result = await fetchLinkMetadata("https://multi-homed.example/x", { fetchImpl, dnsLookupImpl: multiHomedDns });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the hostname can't be resolved at all", async () => {
    const fetchImpl = vi.fn();
    const failingDns = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

    const result = await fetchLinkMetadata("https://does-not-resolve.example/x", { fetchImpl, dnsLookupImpl: failingDns });

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null for a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("not found", { status: 404 }));
    expect(await fetchLinkMetadata("https://example.com/missing", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
  });

  it("returns null when no title tag can be found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("<html><body>nothing here</body></html>"));
    expect(await fetchLinkMetadata("https://example.com/blank", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
  });

  it("returns null when the response isn't HTML", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse("binary", { contentType: "video/mp4" }));
    expect(await fetchLinkMetadata("https://example.com/movie.mp4", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
  });

  it("returns null when the fetch throws (network error or timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await fetchLinkMetadata("https://example.com/slow", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
  });

  it("returns null for a non-http(s) or malformed URL", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchLinkMetadata("not a url", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(await fetchLinkMetadata("ftp://example.com/movie", { fetchImpl, dnsLookupImpl: publicDns })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
