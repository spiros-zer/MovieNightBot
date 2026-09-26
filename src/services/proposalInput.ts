import { fetchLinkMetadata, looksLikeUrl, type FetchLinkMetadataOptions } from "./linkMetadata";

export interface ResolvedProposalInput {
  title: string;
  posterUrl: string | null;
  sourceUrl: string | null;
}

/**
 * Turns what a user typed into the propose field into a title/poster/source triple. Plain text
 * passes through unchanged; a pasted URL (IMDb, Netflix, TMDB, ...) is resolved via its
 * link-preview metadata. If that lookup fails, the raw URL itself becomes the title so proposing
 * still succeeds — a dead/blocked link shouldn't stop someone from proposing the movie.
 */
export async function resolveProposalInput(
  rawInput: string,
  options: FetchLinkMetadataOptions = {},
): Promise<ResolvedProposalInput> {
  const input = rawInput.trim();
  if (!looksLikeUrl(input)) {
    return { title: input, posterUrl: null, sourceUrl: null };
  }

  const metadata = await fetchLinkMetadata(input, options);
  if (!metadata) {
    return { title: input, posterUrl: null, sourceUrl: input };
  }
  return { title: metadata.title, posterUrl: metadata.imageUrl, sourceUrl: input };
}
