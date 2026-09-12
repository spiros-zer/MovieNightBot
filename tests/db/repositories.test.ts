import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../../src/db/database";
import { GuildConfigRepository } from "../../src/db/repositories/guildConfigRepository";
import { EventRepository } from "../../src/db/repositories/eventRepository";
import { ProposalRepository } from "../../src/db/repositories/proposalRepository";
import { VoteRepository } from "../../src/db/repositories/voteRepository";
import type { MovieNightEvent } from "../../src/domain/types";

let db: DatabaseSync;
let guildConfigRepo: GuildConfigRepository;
let eventRepo: EventRepository;
let proposalRepo: ProposalRepository;
let voteRepo: VoteRepository;

beforeEach(() => {
  db = createDatabase(":memory:");
  guildConfigRepo = new GuildConfigRepository(db);
  eventRepo = new EventRepository(db);
  proposalRepo = new ProposalRepository(db);
  voteRepo = new VoteRepository(db);
});

function makeEvent(overrides: Partial<MovieNightEvent> = {}): MovieNightEvent {
  return {
    id: randomUUID(),
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "user-1",
    eventTime: new Date("2026-01-10T20:00:00.000Z"),
    votingCloseTime: new Date("2026-01-10T19:00:00.000Z"),
    status: "open",
    winningProposalId: null,
    ...overrides,
  };
}

describe("GuildConfigRepository", () => {
  it("returns the default config when none has been set", () => {
    const config = guildConfigRepo.getOrDefault("guild-1");
    expect(config).toEqual({
      guildId: "guild-1",
      maxProposalsPerUser: 1,
      votingCloseMinutesBeforeEvent: 60,
    });
  });

  it("persists an upserted config and returns it thereafter", () => {
    guildConfigRepo.upsert({ guildId: "guild-1", maxProposalsPerUser: 3, votingCloseMinutesBeforeEvent: 30 });
    expect(guildConfigRepo.getOrDefault("guild-1")).toEqual({
      guildId: "guild-1",
      maxProposalsPerUser: 3,
      votingCloseMinutesBeforeEvent: 30,
    });
  });

  it("overwrites an existing config on a second upsert", () => {
    guildConfigRepo.upsert({ guildId: "guild-1", maxProposalsPerUser: 3, votingCloseMinutesBeforeEvent: 30 });
    guildConfigRepo.upsert({ guildId: "guild-1", maxProposalsPerUser: 5, votingCloseMinutesBeforeEvent: 15 });
    expect(guildConfigRepo.getOrDefault("guild-1").maxProposalsPerUser).toBe(5);
  });
});

describe("EventRepository", () => {
  it("round-trips an event through create and getById", () => {
    const event = makeEvent();
    eventRepo.create(event);
    expect(eventRepo.getById(event.id)).toEqual(event);
  });

  it("returns null for an unknown id", () => {
    expect(eventRepo.getById("missing")).toBeNull();
  });

  it("lists only open events for a guild", () => {
    const open = makeEvent({ guildId: "guild-1", status: "open" });
    const closed = makeEvent({ guildId: "guild-1", status: "announced" });
    const otherGuild = makeEvent({ guildId: "guild-2", status: "open" });
    eventRepo.create(open);
    eventRepo.create(closed);
    eventRepo.create(otherGuild);

    const results = eventRepo.listOpenEventsForGuild("guild-1");
    expect(results.map((e) => e.id)).toEqual([open.id]);
  });

  it("lists all pending (open) events across guilds for scheduler rehydration", () => {
    const open1 = makeEvent({ guildId: "guild-1", status: "open" });
    const open2 = makeEvent({ guildId: "guild-2", status: "open" });
    const closed = makeEvent({ guildId: "guild-1", status: "announced" });
    eventRepo.create(open1);
    eventRepo.create(open2);
    eventRepo.create(closed);

    const results = eventRepo.listPendingEvents();
    expect(results.map((e) => e.id).sort()).toEqual([open1.id, open2.id].sort());
  });

  it("updates status and winning proposal id", () => {
    const event = makeEvent();
    eventRepo.create(event);
    eventRepo.updateStatus(event.id, "announced", "proposal-1");

    const updated = eventRepo.getById(event.id);
    expect(updated?.status).toBe("announced");
    expect(updated?.winningProposalId).toBe("proposal-1");
  });
});

describe("ProposalRepository", () => {
  it("round-trips a proposal and lists it by event", () => {
    const event = makeEvent();
    eventRepo.create(event);
    const proposal = {
      id: randomUUID(),
      eventId: event.id,
      userId: "user-1",
      title: "The Matrix",
      createdAt: new Date("2026-01-05T00:00:00.000Z"),
    };
    proposalRepo.create(proposal);

    expect(proposalRepo.getById(proposal.id)).toEqual(proposal);
    expect(proposalRepo.listByEvent(event.id)).toEqual([proposal]);
  });

  it("counts proposals per user within an event", () => {
    const event = makeEvent();
    eventRepo.create(event);
    proposalRepo.create({ id: randomUUID(), eventId: event.id, userId: "user-1", title: "A", createdAt: new Date() });
    proposalRepo.create({ id: randomUUID(), eventId: event.id, userId: "user-1", title: "B", createdAt: new Date() });
    proposalRepo.create({ id: randomUUID(), eventId: event.id, userId: "user-2", title: "C", createdAt: new Date() });

    expect(proposalRepo.countByEventAndUser(event.id, "user-1")).toBe(2);
    expect(proposalRepo.countByEventAndUser(event.id, "user-2")).toBe(1);
    expect(proposalRepo.countByEventAndUser(event.id, "user-3")).toBe(0);
  });
});

describe("VoteRepository", () => {
  it("round-trips a vote and finds it by event and user", () => {
    const event = makeEvent();
    eventRepo.create(event);
    const proposal = { id: randomUUID(), eventId: event.id, userId: "user-1", title: "A", createdAt: new Date() };
    proposalRepo.create(proposal);

    const vote = { id: randomUUID(), eventId: event.id, userId: "user-2", proposalId: proposal.id, createdAt: new Date() };
    voteRepo.create(vote);

    expect(voteRepo.getByEventAndUser(event.id, "user-2")).toEqual(vote);
    expect(voteRepo.getByEventAndUser(event.id, "someone-else")).toBeNull();
    expect(voteRepo.listByEvent(event.id)).toEqual([vote]);
  });

  it("rejects a second vote from the same user in the same event", () => {
    const event = makeEvent();
    eventRepo.create(event);
    const proposal = { id: randomUUID(), eventId: event.id, userId: "user-1", title: "A", createdAt: new Date() };
    proposalRepo.create(proposal);

    voteRepo.create({ id: randomUUID(), eventId: event.id, userId: "user-2", proposalId: proposal.id, createdAt: new Date() });

    expect(() =>
      voteRepo.create({ id: randomUUID(), eventId: event.id, userId: "user-2", proposalId: proposal.id, createdAt: new Date() }),
    ).toThrow();
  });
});
