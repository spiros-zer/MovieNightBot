import type { Client, Message, MessageReaction, PartialMessage, PartialMessageReaction, PartialUser, User } from "discord.js";
import type { MovieNightService } from "../services/movieNightService";
import { numberEmojiIndex, NUMBER_EMOJIS } from "./formatting";
import { refreshAnnouncementMessage } from "./announcementMessage";

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | null> {
  if (!reaction.partial) return reaction;
  try {
    return await reaction.fetch();
  } catch {
    return null;
  }
}

/** Removes every other number-emoji reaction this user left on the message, enforcing one active vote reaction each. */
async function removeOtherNumberReactions(message: Message | PartialMessage, keepEmoji: string, userId: string): Promise<void> {
  const fullMessage = message.partial ? await message.fetch() : message;
  for (const cached of fullMessage.reactions.cache.values()) {
    const name = cached.emoji.name;
    if (!name || name === keepEmoji || !NUMBER_EMOJIS.includes(name)) continue;
    await cached.users.remove(userId).catch(() => {});
  }
}

/**
 * A user reacted with a number emoji on a movie night's status message — cast (or move) their
 * vote to the proposal at that position. Invalid reactions (wrong event state, no matching
 * proposal, voting closed) are reverted by removing the reaction rather than silently ignored, so
 * the message never shows a reaction that didn't actually count.
 */
export async function handleVoteReactionAdd(
  rawReaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
  service: MovieNightService,
): Promise<void> {
  if (user.id === client.user?.id) return;

  const reaction = await resolveReaction(rawReaction);
  const emoji = reaction?.emoji.name;
  const index = emoji ? numberEmojiIndex(emoji) : null;
  if (!reaction || index === null) return;

  const event = service.getEventByAnnouncementMessageId(reaction.message.id);
  if (!event) return;

  const revert = () => reaction.users.remove(user.id).catch(() => {});

  const proposal = service.listProposals(event.id)[index];
  if (!proposal) {
    await revert();
    return;
  }

  const result = service.castVote({ eventId: event.id, userId: user.id, proposalId: proposal.id });
  if (!result.ok) {
    await revert();
    return;
  }

  await removeOtherNumberReactions(reaction.message, emoji!, user.id);
  await refreshAnnouncementMessage(client, service, event.id);
}

/**
 * A user removed a number-emoji reaction — if it was still their active vote, retract it. Reused
 * mid-switch removals (from `removeOtherNumberReactions`) are no-ops here since the vote has
 * already moved to the new proposal by the time this fires.
 */
export async function handleVoteReactionRemove(
  rawReaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  client: Client,
  service: MovieNightService,
): Promise<void> {
  if (user.id === client.user?.id) return;

  const reaction = await resolveReaction(rawReaction);
  const emoji = reaction?.emoji.name;
  const index = emoji ? numberEmojiIndex(emoji) : null;
  if (!reaction || index === null) return;

  const event = service.getEventByAnnouncementMessageId(reaction.message.id);
  if (!event) return;

  const proposal = service.listProposals(event.id)[index];
  if (!proposal) return;

  const retracted = service.retractVote({ eventId: event.id, userId: user.id, proposalId: proposal.id });
  if (retracted) {
    await refreshAnnouncementMessage(client, service, event.id);
  }
}
