import { EmbedBuilder, type Client } from "discord.js";
import type { MovieNightEvent } from "../domain/types";
import type { MovieNightService } from "../services/movieNightService";
import { buildMovieNightMessageData, type MovieNightMessageData } from "./formatting";
import { buildProposeButtonRow } from "./proposeInteraction";

const EMBED_COLOR = 0x5865f2;

/**
 * Deletes a cancelled movie night's pinned channel announcement message, if one was sent.
 * Logs and swallows any failure (missing message/channel, permissions) rather than throwing,
 * since this always runs as best-effort cleanup after the event is already cancelled.
 */
export async function deleteAnnouncementMessage(
  client: Client,
  event: Pick<MovieNightEvent, "id" | "channelId" | "announcementMessageId">,
): Promise<void> {
  if (!event.announcementMessageId) return;

  try {
    const channel = await client.channels.fetch(event.channelId);
    if (channel?.isTextBased()) {
      await channel.messages.delete(event.announcementMessageId);
    }
  } catch (error) {
    console.error(`Failed to delete announcement message for cancelled movie night ${event.id}:`, error);
  }
}

/** Converts the pure message data into real discord.js embeds, applying the shared brand color. */
export function buildMovieNightEmbeds(data: MovieNightMessageData): EmbedBuilder[] {
  const header = new EmbedBuilder()
    .setTitle(data.header.title)
    .setDescription(data.header.description)
    .addFields(data.header.fields)
    .setColor(EMBED_COLOR);

  const movieEmbeds = data.movieEmbeds.map((row) => {
    const embed = new EmbedBuilder().setTitle(row.title).setDescription(row.description).setColor(EMBED_COLOR);
    if (row.url) embed.setURL(row.url);
    if (row.imageUrl) embed.setThumbnail(row.imageUrl);
    return embed;
  });

  return [header, ...movieEmbeds];
}

/**
 * Re-renders and edits the movie night's single live status message in place — called after
 * every proposal, vote, and voting close so the channel always shows current standings without
 * a new message each time. Best-effort: logs and swallows any failure (message deleted,
 * missing permissions, etc.) since this always runs alongside an action that already succeeded.
 */
export async function refreshAnnouncementMessage(client: Client, service: MovieNightService, eventId: string): Promise<void> {
  const status = service.getStatus(eventId);
  if (!status || !status.event.announcementMessageId) return;

  try {
    const channel = await client.channels.fetch(status.event.channelId);
    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(status.event.announcementMessageId);
    const data = buildMovieNightMessageData(status.event, status.proposals, status.counts);
    await message.edit({
      embeds: buildMovieNightEmbeds(data),
      components: status.event.status === "open" ? [buildProposeButtonRow(status.event.id)] : [],
    });
  } catch (error) {
    console.error(`Failed to refresh announcement message for movie night ${eventId}:`, error);
  }
}
