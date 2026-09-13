import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/db/database";
import { GuildConfigRepository } from "../../src/db/repositories/guildConfigRepository";
import { EventRepository } from "../../src/db/repositories/eventRepository";
import { ProposalRepository } from "../../src/db/repositories/proposalRepository";
import { VoteRepository } from "../../src/db/repositories/voteRepository";
import { MovieNightService } from "../../src/services/movieNightService";
import type { Scheduler } from "../../src/scheduler/scheduler";

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

let db: DatabaseSync;
let scheduler: FakeScheduler;
let service: MovieNightService;
let idCounter: number;

const GUILD_ID = "guild-1";
const CHANNEL_ID = "channel-1";
const CREATOR_ID = "creator-1";
const EVENT_TIME = new Date("2026-02-01T20:00:00.000Z");

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
    rng: () => 0,
  });
});

describe("createEvent", () => {
  it("computes the voting close time from the guild's configured offset and persists the event", () => {
    const result = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.status).toBe("open");
    expect(result.value.votingCloseTime.toISOString()).toBe("2026-02-01T19:00:00.000Z"); // default 60 min offset
    expect(service.getEvent(result.value.id)).toEqual(result.value);
  });

  it("schedules a voting-close job at the computed close time", () => {
    const result = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!result.ok) throw new Error("expected success");

    const job = scheduler.jobs.get(result.value.id);
    expect(job?.when.toISOString()).toBe("2026-02-01T19:00:00.000Z");
  });

  it("uses a custom voting-close offset once the guild config is updated", () => {
    service.setGuildConfig(GUILD_ID, { votingCloseMinutesBeforeEvent: 15 });
    const result = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!result.ok) throw new Error("expected success");
    expect(result.value.votingCloseTime.toISOString()).toBe("2026-02-01T19:45:00.000Z");
  });

  it("rejects an event time in the past", () => {
    const result = service.createEvent({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      creatorId: CREATOR_ID,
      eventTime: new Date("2025-01-01T00:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
  });
});

describe("proposeMovie", () => {
  function openEvent() {
    const result = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!result.ok) throw new Error("expected success");
    return result.value;
  }

  it("adds a proposal to an open event", () => {
    const event = openEvent();
    const result = service.proposeMovie({ eventId: event.id, userId: "user-1", title: "The Matrix" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("The Matrix");
    expect(service.listProposals(event.id)).toHaveLength(1);
  });

  it("enforces the guild's configured max proposals per user", () => {
    service.setGuildConfig(GUILD_ID, { maxProposalsPerUser: 1 });
    const event = openEvent();
    service.proposeMovie({ eventId: event.id, userId: "user-1", title: "A" });
    const second = service.proposeMovie({ eventId: event.id, userId: "user-1", title: "B" });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toMatch(/limit/i);
    expect(service.listProposals(event.id)).toHaveLength(1);
  });

  it("rejects proposals for an unknown event", () => {
    const result = service.proposeMovie({ eventId: "missing", userId: "user-1", title: "A" });
    expect(result.ok).toBe(false);
  });
});

describe("castVote", () => {
  function eventWithProposal() {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");
    const proposalResult = service.proposeMovie({ eventId: eventResult.value.id, userId: "proposer", title: "The Matrix" });
    if (!proposalResult.ok) throw new Error("expected success");
    return { event: eventResult.value, proposal: proposalResult.value };
  }

  it("records a vote for a valid proposal", () => {
    const { event, proposal } = eventWithProposal();
    const result = service.castVote({ eventId: event.id, userId: "voter-1", proposalId: proposal.id });
    expect(result.ok).toBe(true);
  });

  it("rejects a second vote from the same user", () => {
    const { event, proposal } = eventWithProposal();
    service.castVote({ eventId: event.id, userId: "voter-1", proposalId: proposal.id });
    const second = service.castVote({ eventId: event.id, userId: "voter-1", proposalId: proposal.id });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toMatch(/already voted/i);
  });

  it("rejects a vote for a proposal that doesn't belong to the event", () => {
    const { event } = eventWithProposal();
    const otherEventResult = service.createEvent({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      creatorId: CREATOR_ID,
      eventTime: new Date("2026-03-01T20:00:00.000Z"),
    });
    if (!otherEventResult.ok) throw new Error("expected success");
    const otherProposal = service.proposeMovie({ eventId: otherEventResult.value.id, userId: "proposer", title: "Other" });
    if (!otherProposal.ok) throw new Error("expected success");

    const result = service.castVote({ eventId: event.id, userId: "voter-1", proposalId: otherProposal.value.id });
    expect(result.ok).toBe(false);
  });
});

describe("automatic voting close", () => {
  it("tallies votes, marks the event announced, and notifies the callback when the scheduled job fires", () => {
    const onVotingClosed = vi.fn();
    service = new MovieNightService({
      guildConfigRepo: new GuildConfigRepository(db),
      eventRepo: new EventRepository(db),
      proposalRepo: new ProposalRepository(db),
      voteRepo: new VoteRepository(db),
      scheduler,
      generateId: () => `id-${++idCounter}`,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      rng: () => 0,
      onVotingClosed,
    });

    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");
    const event = eventResult.value;

    const p1 = service.proposeMovie({ eventId: event.id, userId: "u1", title: "A" });
    const p2 = service.proposeMovie({ eventId: event.id, userId: "u2", title: "B" });
    if (!p1.ok || !p2.ok) throw new Error("expected success");

    service.castVote({ eventId: event.id, userId: "voter-1", proposalId: p2.value.id });
    service.castVote({ eventId: event.id, userId: "voter-2", proposalId: p2.value.id });
    service.castVote({ eventId: event.id, userId: "voter-3", proposalId: p1.value.id });

    scheduler.trigger(event.id);

    const updated = service.getEvent(event.id);
    expect(updated?.status).toBe("announced");
    expect(updated?.winningProposalId).toBe(p2.value.id);

    expect(onVotingClosed).toHaveBeenCalledTimes(1);
    const payload = onVotingClosed.mock.calls[0][0];
    expect(payload.event.id).toBe(event.id);
    expect(payload.winner?.id).toBe(p2.value.id);
    expect(payload.counts.get(p2.value.id)).toBe(2);
  });

  it("does nothing if the event was already cancelled before the job fires", () => {
    const onVotingClosed = vi.fn();
    service = new MovieNightService({
      guildConfigRepo: new GuildConfigRepository(db),
      eventRepo: new EventRepository(db),
      proposalRepo: new ProposalRepository(db),
      voteRepo: new VoteRepository(db),
      scheduler,
      generateId: () => `id-${++idCounter}`,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      rng: () => 0,
      onVotingClosed,
    });
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");

    service.cancelEvent(eventResult.value.id, CREATOR_ID);

    expect(scheduler.jobs.has(eventResult.value.id)).toBe(false);
    expect(onVotingClosed).not.toHaveBeenCalled();
  });
});

describe("setDiscordEventId", () => {
  it("persists the Discord scheduled event id and returns the updated event", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");

    const updated = service.setDiscordEventId(eventResult.value.id, "discord-evt-1");
    expect(updated?.discordEventId).toBe("discord-evt-1");
    expect(service.getEvent(eventResult.value.id)?.discordEventId).toBe("discord-evt-1");
  });

  it("returns null for an unknown event", () => {
    expect(service.setDiscordEventId("missing", "discord-evt-1")).toBeNull();
  });
});

describe("getEventByDiscordEventId", () => {
  it("finds the event by its associated Discord scheduled event id", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");
    service.setDiscordEventId(eventResult.value.id, "discord-evt-1");

    expect(service.getEventByDiscordEventId("discord-evt-1")?.id).toBe(eventResult.value.id);
    expect(service.getEventByDiscordEventId("missing")).toBeNull();
  });
});

describe("setAnnouncementMessageId", () => {
  it("persists the announcement message id and returns the updated event", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");

    const updated = service.setAnnouncementMessageId(eventResult.value.id, "message-1");
    expect(updated?.announcementMessageId).toBe("message-1");
    expect(service.getEvent(eventResult.value.id)?.announcementMessageId).toBe("message-1");
  });

  it("returns null for an unknown event", () => {
    expect(service.setAnnouncementMessageId("missing", "message-1")).toBeNull();
  });
});

describe("cancelEvent", () => {
  it("marks the event cancelled and cancels its scheduled job", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");

    const result = service.cancelEvent(eventResult.value.id, CREATOR_ID);
    expect(result.ok).toBe(true);
    expect(service.getEvent(eventResult.value.id)?.status).toBe("cancelled");
    expect(scheduler.jobs.has(eventResult.value.id)).toBe(false);
  });

  it("rejects cancellation from someone other than the creator", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");

    const result = service.cancelEvent(eventResult.value.id, "someone-else");
    expect(result.ok).toBe(false);
    expect(service.getEvent(eventResult.value.id)?.status).toBe("open");
  });
});

describe("getStatus", () => {
  it("reports live vote counts without closing the event", () => {
    const eventResult = service.createEvent({ guildId: GUILD_ID, channelId: CHANNEL_ID, creatorId: CREATOR_ID, eventTime: EVENT_TIME });
    if (!eventResult.ok) throw new Error("expected success");
    const p1 = service.proposeMovie({ eventId: eventResult.value.id, userId: "u1", title: "A" });
    if (!p1.ok) throw new Error("expected success");
    service.castVote({ eventId: eventResult.value.id, userId: "voter-1", proposalId: p1.value.id });

    const status = service.getStatus(eventResult.value.id);
    expect(status?.event.status).toBe("open");
    expect(status?.counts.get(p1.value.id)).toBe(1);
    expect(scheduler.jobs.has(eventResult.value.id)).toBe(true);
  });

  it("returns null for an unknown event", () => {
    expect(service.getStatus("missing")).toBeNull();
  });
});

describe("rehydrate", () => {
  it("re-schedules jobs for every still-open event found in storage", () => {
    const eventRepo = new EventRepository(db);
    eventRepo.create({
      id: "evt-a",
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      creatorId: CREATOR_ID,
      eventTime: EVENT_TIME,
      votingCloseTime: new Date("2026-02-01T19:00:00.000Z"),
      status: "open",
      winningProposalId: null,
      discordEventId: null,
      announcementMessageId: null,
    });
    eventRepo.create({
      id: "evt-b",
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      creatorId: CREATOR_ID,
      eventTime: EVENT_TIME,
      votingCloseTime: new Date("2026-02-01T19:30:00.000Z"),
      status: "announced",
      winningProposalId: null,
      discordEventId: null,
      announcementMessageId: null,
    });

    service.rehydrate();

    expect(scheduler.jobs.has("evt-a")).toBe(true);
    expect(scheduler.jobs.has("evt-b")).toBe(false);
  });
});
