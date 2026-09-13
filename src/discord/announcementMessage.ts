import type { Client } from "discord.js";
import type { MovieNightEvent } from "../domain/types";

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
