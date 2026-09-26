import { describe, expect, it, vi } from "vitest";
import { resolveProposalInput } from "../../src/services/proposalInput";

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

describe("resolveProposalInput", () => {
  it("passes plain-text titles through unchanged", async () => {
    const fetchImpl = vi.fn();
    const result = await resolveProposalInput("The Matrix", { fetchImpl });
    expect(result).toEqual({ title: "The Matrix", posterUrl: null, sourceUrl: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("trims whitespace around a plain-text title", async () => {
    const result = await resolveProposalInput("  Inception  ", { fetchImpl: vi.fn() });
    expect(result.title).toBe("Inception");
  });

  it("resolves a movie link to its title and poster", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      htmlResponse(`
        <meta property="og:title" content="The Matrix (1999)">
        <meta property="og:image" content="https://img.example.com/matrix.jpg">
      `),
    );

    const result = await resolveProposalInput("https://www.netflix.com/title/70143836", { fetchImpl });
    expect(result).toEqual({
      title: "The Matrix (1999)",
      posterUrl: "https://img.example.com/matrix.jpg",
      sourceUrl: "https://www.netflix.com/title/70143836",
    });
  });

  it("falls back to the raw URL as the title when the link can't be resolved", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await resolveProposalInput("https://www.netflix.com/title/70143836", { fetchImpl });
    expect(result).toEqual({
      title: "https://www.netflix.com/title/70143836",
      posterUrl: null,
      sourceUrl: "https://www.netflix.com/title/70143836",
    });
  });
});
