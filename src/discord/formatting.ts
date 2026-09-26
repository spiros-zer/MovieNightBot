import type { MovieNightEvent, MovieProposal } from "../domain/types";
import type { VotingClosedPayload } from "../services/movieNightService";

/** Discord's native timestamp markup — renders in each viewer's own local time/format. */
export function discordTimestamp(date: Date, style: "F" | "f" | "D" | "d" | "R" | "T" | "t" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/** A channel's display name, falling back to a generic label for channel types without one (e.g. DMs). */
export function channelDisplayName(channel: { id: string; name?: unknown }): string {
  return typeof channel.name === "string" ? channel.name : "the event channel";
}

/** Escapes characters that would let a movie title break out of `[text](url)` markdown-link syntax. */
function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[[\]]/g, "\\$&");
}

/**
 * A bolded movie title, as a clickable link to its source page (IMDb/Netflix/etc.) when one is
 * known — so people can click through for the description, cast, etc. Only renders as a link
 * inside embeds; Discord doesn't support masked links in plain message content.
 */
export function movieLink(title: string, sourceUrl: string | null): string {
  if (!sourceUrl || sourceUrl.includes(")")) return `**${title}**`;
  return `[**${escapeMarkdownLinkText(title)}**](${sourceUrl})`;
}

export interface EmbedData {
  title: string;
  description: string;
  fields: { name: string; value: string; inline?: boolean }[];
  imageUrl?: string;
  /** Makes the embed's own title clickable, taking viewers straight to the winning movie's page. */
  url?: string;
}

export function buildAnnouncementEmbedData(payload: VotingClosedPayload): EmbedData {
  const { proposals, winner, counts, tiedCount } = payload;

  if (!winner) {
    return {
      title: "🎬 No movie was chosen",
      description: "Nobody proposed a movie for this movie night, so there's nothing to announce.",
      fields: [],
    };
  }

  const ranked = [...proposals].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const maxVotes = counts.get(winner.id) ?? 0;

  const resultLines = ranked.map((p) => {
    const votes = counts.get(p.id) ?? 0;
    const marker = p.id === winner.id ? "🏆 " : "";
    return `${marker}${movieLink(p.title, p.sourceUrl)} — ${votes} vote${votes === 1 ? "" : "s"}`;
  });

  const description =
    tiedCount > 1
      ? `It was a tie between ${tiedCount} movies, so the winner was settled by random raffle draw:\n\n${resultLines.join("\n")}`
      : resultLines.join("\n");

  return {
    title: `🎬 Movie night winner: ${winner.title}`,
    description,
    fields: [{ name: "Winner", value: `${movieLink(winner.title, winner.sourceUrl)} — ${maxVotes} vote${maxVotes === 1 ? "" : "s"}` }],
    ...(winner.posterUrl ? { imageUrl: winner.posterUrl } : {}),
    ...(winner.sourceUrl ? { url: winner.sourceUrl } : {}),
  };
}

/** A single proposed movie, rendered as its own small embed (title + vote count, poster as thumbnail, clickable if linked). */
export interface MovieRowEmbed {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
}

export interface MovieNightMessageData {
  header: EmbedData;
  movieEmbeds: MovieRowEmbed[];
}

/**
 * Keycap number emoji, in order — what the bot reacts with on each proposal and what it reads
 * back off a vote reaction. Also caps how many proposals can be voted on by reaction (and,
 * relatedly, how many get their own embed row: Discord allows at most 10 embeds per message,
 * one of which is the header).
 */
export const NUMBER_EMOJIS = Array.from({ length: 9 }, (_, i) => `${i + 1}️⃣`);
export const MAX_MOVIE_ROW_EMBEDS = NUMBER_EMOJIS.length;

/** The proposal index a vote-reaction emoji corresponds to, or null if it isn't one the bot manages. */
export function numberEmojiIndex(emoji: string): number | null {
  const index = NUMBER_EMOJIS.indexOf(emoji);
  return index === -1 ? null : index;
}

/**
 * Renders the single live status embed set for a movie night: a header (who scheduled it, when,
 * open/closed, voting deadline) followed by one small embed per proposed movie with its own
 * poster thumbnail and vote count. This is sent once and then edited in place as proposals and
 * votes come in, rather than posting a new message each time.
 *
 * Each proposal's number (and reaction) is assigned by proposal order and stays fixed for the
 * event's lifetime, even though rows are displayed sorted by vote count — otherwise a movie's
 * number would shift under an already-placed reaction as votes came in.
 */
export function buildMovieNightMessageData(
  event: MovieNightEvent,
  proposals: MovieProposal[],
  counts: Map<string, number>,
): MovieNightMessageData {
  const isOpen = event.status === "open";
  const numbered = proposals.slice(0, MAX_MOVIE_ROW_EMBEDS);
  const overflow = proposals.slice(MAX_MOVIE_ROW_EMBEDS);
  const numberByProposalId = new Map(numbered.map((p, i) => [p.id, i]));
  const ranked = [...numbered].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));

  const headerLines = [
    `Event: ${discordTimestamp(event.eventTime)}`,
    `Status: **${isOpen ? "open" : "closed"}**`,
    `Voting closes: ${isOpen ? `${discordTimestamp(event.votingCloseTime)} (${discordTimestamp(event.votingCloseTime, "R")})` : "closed"}`,
  ];

  if (proposals.length === 0) {
    headerLines.push("", "_No movies proposed yet._");
  } else {
    if (isOpen) headerLines.push("", "_React with a movie's number below to vote — pressing another number moves your vote._");
    if (overflow.length > 0) {
      const overflowList = overflow.map((p) => movieLink(p.title, p.sourceUrl)).join(", ");
      headerLines.push("", `_+${overflow.length} more: ${overflowList}_`);
    }
  }

  const header: EmbedData = {
    title: "🎬 Movie Night",
    description: headerLines.join("\n"),
    fields: [{ name: "Scheduled by", value: `<@${event.creatorId}>`, inline: true }],
  };

  const movieEmbeds: MovieRowEmbed[] = ranked.map((p) => {
    const votes = counts.get(p.id) ?? 0;
    const isWinner = p.id === event.winningProposalId;
    const numberEmoji = NUMBER_EMOJIS[numberByProposalId.get(p.id)!];
    return {
      title: `${numberEmoji} ${isWinner ? "🏆 " : ""}${p.title}`,
      description: `${votes} vote${votes === 1 ? "" : "s"}`,
      ...(p.sourceUrl ? { url: p.sourceUrl } : {}),
      ...(p.posterUrl ? { imageUrl: p.posterUrl } : {}),
    };
  });

  return { header, movieEmbeds };
}
