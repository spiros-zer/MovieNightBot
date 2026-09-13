import type { Client } from "discord.js";

/** Deletes a movie night's channel announcement message; throws if the channel/message can't be reached. */
export async function deleteAnnouncementMessage(client: Client, channelId: string, messageId: string): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (channel?.isTextBased()) {
    await channel.messages.delete(messageId);
  }
}
