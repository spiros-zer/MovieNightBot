import type { VotingClosedPayload } from "../services/movieNightService";

/** Discord's native timestamp markup — renders in each viewer's own local time/format. */
export function discordTimestamp(date: Date, style: "F" | "f" | "D" | "d" | "R" | "T" | "t" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

/** A channel's display name, falling back to a generic label for channel types without one (e.g. DMs). */
export function channelDisplayName(channel: { id: string; name?: unknown }): string {
  return typeof channel.name === "string" ? channel.name : "the event channel";
}

export interface EmbedData {
  title: string;
  description: string;
  fields: { name: string; value: string; inline?: boolean }[];
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
    return `${marker}**${p.title}** — ${votes} vote${votes === 1 ? "" : "s"}`;
  });

  const description =
    tiedCount > 1
      ? `It was a tie between ${tiedCount} movies, so the winner was settled by random raffle draw:\n\n${resultLines.join("\n")}`
      : resultLines.join("\n");

  return {
    title: `🎬 Movie night winner: ${winner.title}`,
    description,
    fields: [{ name: "Winner", value: `**${winner.title}** — ${maxVotes} vote${maxVotes === 1 ? "" : "s"}` }],
  };
}
