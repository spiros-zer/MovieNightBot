import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, Message, MessageReaction, User } from "discord.js";
import { createDatabase } from "../../src/db/database";
import { GuildConfigRepository } from "../../src/db/repositories/guildConfigRepository";
import { EventRepository } from "../../src/db/repositories/eventRepository";
import { ProposalRepository } from "../../src/db/repositories/proposalRepository";
import { VoteRepository } from "../../src/db/repositories/voteRepository";
import { MovieNightService } from "../../src/services/movieNightService";
import type { Scheduler } from "../../src/scheduler/scheduler";
import { handleVoteReactionAdd, handleVoteReactionRemove } from "../../src/discord/voteReaction";

class FakeScheduler implements Scheduler {
  jobs = new Map<string, { when: Date; callback: () => void }>();
  scheduleAt(id: string, when: Date, callback: () => void): void {
    this.jobs.set(id, { when, callback });
  }
  cancel(id: string): void {
    this.jobs.delete(id);
  }
  trigger(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`no job scheduled for ${id}`);
    this.jobs.delete(id);
    job.callback();
  }
}

/** A fake cached MessageReaction: just enough for `removeOtherNumberReactions` to iterate and remove. */
function fakeCachedReaction(emojiName: string) {
  return { emoji: { name: emojiName }, users: { remove: vi.fn().mockResolvedValue(undefined) } };
}

/** A fake Message carrying a mutable `reactions.cache` map, and an `edit` spy for refresh assertions. */
function fakeMessage(id: string, cached: ReturnType<typeof fakeCachedReaction>[] = []) {
  const cache = new Map(cached.map((c, i) => [`${i}`, c]));
  return {
    id,
    partial: false,
    reactions: { cache },
    edit: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
  };
}

/** A fake MessageReaction for a specific emoji on a given fake message, with its own removal spy. */
function fakeReaction(message: ReturnType<typeof fakeMessage>, emojiName: string) {
  return {
    partial: false,
    emoji: { name: emojiName },
    message,
    users: { remove: vi.fn().mockResolvedValue(undefined) },
  };
}

function fakeUser(id: string) {
  return { id };
}

function fakeClient(botId: string, channel: { isTextBased: () => boolean; messages: { fetch: ReturnType<typeof vi.fn> } }) {
  return {
    user: { id: botId },
    channels: { fetch: vi.fn().mockResolvedValue(channel) },
  };
}

const GUILD_ID = "guild-1";
const CHANNEL_ID = "channel-1";
const CREATOR_ID = "creator-1";
const BOT_ID = "bot-1";
const EVENT_TIME = new Date("2026-02-01T20:00:00.000Z");

let db: DatabaseSync;
let scheduler: FakeScheduler;
let service: MovieNightService;
let idCounter: number;

beforeEach(() => {
  db = createDatabase(":memory:");
  scheduler = new FakeScheduler();
  idCounter = 0;
  service = new MovieNightService({
    guildConfigRepo: new GuildConfigRepository(db),
    eventRepo: new EventRepository(db),
    proposalRepo: new ProposalRepository(db),
    voteRepo: new VoteRepository(db),
    scheduler,
    generateId: () => `id-${++idCounter}`,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
});

function openEventWithProposals(titles: string[]) {
  const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
  if (!eventResult.ok) throw new Error("expected success");
  const event = eventResult.value;
  service.setAnnouncementMessageId(event.id, "msg-1");

  const proposals = titles.map((title, i) => {
    const result = service.proposeMovie({ eventId: event.id, userId: `proposer-${i}`, title });
    if (!result.ok) throw new Error("expected success");
    return result.value;
  });
  return { event: service.getEvent(event.id)!, proposals };
}

/** Wires a fake message/channel/client trio for the given announcement message, for driving the handlers under test. */
function harnessFor(message: ReturnType<typeof fakeMessage>) {
  const channel = { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue(message) } };
  const client = fakeClient(BOT_ID, channel);
  return { client: client as unknown as Client, channel };
}

describe("handleVoteReactionAdd", () => {
  it("ignores the bot's own reaction", async () => {
    const { event, proposals } = openEventWithProposals(["A", "B"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const castVoteSpy = vi.spyOn(service, "castVote");

    await handleVoteReactionAdd(
      fakeReaction(message, "1️⃣") as unknown as MessageReaction,
      fakeUser(BOT_ID) as unknown as User,
      client,
      service,
    );

    expect(castVoteSpy).not.toHaveBeenCalled();
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
  });

  it("ignores a reaction on a message that isn't a tracked announcement", async () => {
    openEventWithProposals(["A"]);
    const message = fakeMessage("some-other-message");
    const { client } = harnessFor(message);

    await expect(
      handleVoteReactionAdd(
        fakeReaction(message, "1️⃣") as unknown as MessageReaction,
        fakeUser("voter-1") as unknown as User,
        client,
        service,
      ),
    ).resolves.toBeUndefined();
  });

  it("casts a vote and refreshes the announcement when reacting with a proposal's number", async () => {
    const { event, proposals } = openEventWithProposals(["A", "B"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);

    await handleVoteReactionAdd(
      fakeReaction(message, "1️⃣") as unknown as MessageReaction,
      fakeUser("voter-1") as unknown as User,
      client,
      service,
    );

    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(1);
    expect(message.edit).toHaveBeenCalledTimes(1);
  });

  it("reverts the reaction when the number has no matching proposal (overflow)", async () => {
    const { event, proposals } = openEventWithProposals(["A"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const reaction = fakeReaction(message, "2️⃣");

    await handleVoteReactionAdd(reaction as unknown as MessageReaction, fakeUser("voter-1") as unknown as User, client, service);

    expect(reaction.users.remove).toHaveBeenCalledWith("voter-1");
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
  });

  it("reverts the reaction once voting has closed", async () => {
    const { event, proposals } = openEventWithProposals(["A"]);
    scheduler.trigger(event.id);
    expect(service.getEvent(event.id)?.status).toBe("announced");

    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const reaction = fakeReaction(message, "1️⃣");

    await handleVoteReactionAdd(reaction as unknown as MessageReaction, fakeUser("voter-1") as unknown as User, client, service);

    expect(reaction.users.remove).toHaveBeenCalledWith("voter-1");
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
  });

  it("moving a vote to a different number removes the old reaction and moves the count", async () => {
    // The bot itself reacts with every proposal's number up front (on propose), so both are
    // already in the cache before the user reacts with either - matching real Discord state.
    const { event, proposals } = openEventWithProposals(["A", "B"]);
    const oneCached = fakeCachedReaction("1️⃣");
    const twoCached = fakeCachedReaction("2️⃣");
    const message = fakeMessage("msg-1", [oneCached, twoCached]);
    const { client } = harnessFor(message);

    await handleVoteReactionAdd(
      fakeReaction(message, "1️⃣") as unknown as MessageReaction,
      fakeUser("voter-1") as unknown as User,
      client,
      service,
    );
    await handleVoteReactionAdd(
      fakeReaction(message, "2️⃣") as unknown as MessageReaction,
      fakeUser("voter-1") as unknown as User,
      client,
      service,
    );

    // The 1️⃣ reaction (now stale) must have been removed for this user at some point.
    expect(oneCached.users.remove).toHaveBeenCalledWith("voter-1");
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
    expect(service.getStatus(event.id)?.counts.get(proposals[1].id)).toBe(1);
  });
});

describe("handleVoteReactionRemove", () => {
  it("retracts a vote when its reaction is removed", async () => {
    const { event, proposals } = openEventWithProposals(["A"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const reaction = fakeReaction(message, "1️⃣") as unknown as MessageReaction;
    const user = fakeUser("voter-1") as unknown as User;

    await handleVoteReactionAdd(reaction, user, client, service);
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(1);

    await handleVoteReactionRemove(reaction, user, client, service);
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
  });

  it("does not retract a vote already moved elsewhere by the auto-remove-old-reaction step", async () => {
    const { event, proposals } = openEventWithProposals(["A", "B"]);
    const message = fakeMessage("msg-1", [fakeCachedReaction("1️⃣"), fakeCachedReaction("2️⃣")]);
    const { client } = harnessFor(message);
    const user = fakeUser("voter-1") as unknown as User;
    const oldReaction = fakeReaction(message, "1️⃣") as unknown as MessageReaction;
    const newReaction = fakeReaction(message, "2️⃣") as unknown as MessageReaction;

    await handleVoteReactionAdd(oldReaction, user, client, service);
    await handleVoteReactionAdd(newReaction, user, client, service);
    // Discord fires messageReactionRemove for the old reaction as a side effect of the auto-removal above.
    await handleVoteReactionRemove(oldReaction, user, client, service);

    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(0);
    expect(service.getStatus(event.id)?.counts.get(proposals[1].id)).toBe(1);
  });

  it("does not retract a vote cast before voting closed once the message is reacted to afterward", async () => {
    const { event, proposals } = openEventWithProposals(["A"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const reaction = fakeReaction(message, "1️⃣") as unknown as MessageReaction;
    const user = fakeUser("voter-1") as unknown as User;

    await handleVoteReactionAdd(reaction, user, client, service);
    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(1);

    scheduler.trigger(event.id);
    expect(service.getEvent(event.id)?.status).toBe("announced");

    await handleVoteReactionRemove(reaction, user, client, service);

    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(1);
  });

  it("ignores the bot's own reaction removal", async () => {
    const { event, proposals } = openEventWithProposals(["A"]);
    const message = fakeMessage("msg-1");
    const { client } = harnessFor(message);
    const user = fakeUser("voter-1") as unknown as User;
    const reaction = fakeReaction(message, "1️⃣") as unknown as MessageReaction;

    await handleVoteReactionAdd(reaction, user, client, service);
    await handleVoteReactionRemove(reaction, fakeUser(BOT_ID) as unknown as User, client, service);

    expect(service.getStatus(event.id)?.counts.get(proposals[0].id)).toBe(1);
  });
});
