import { describe, expect, it } from "vitest";
import {
  canPropose,
  canVote,
  computeVotingCloseTime,
  isVotingOpen,
} from "../../src/domain/rules";
import type { MovieNightEvent } from "../../src/domain/types";

function makeEvent(overrides: Partial<MovieNightEvent> = {}): MovieNightEvent {
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "user-1",
    eventTime: new Date("2026-01-10T20:00:00Z"),
    votingCloseTime: new Date("2026-01-10T19:00:00Z"),
    status: "open",
    winningProposalId: null,
    ...overrides,
  };
}

describe("computeVotingCloseTime", () => {
  it("subtracts the configured number of minutes from the event time", () => {
    const eventTime = new Date("2026-01-10T20:00:00Z");
    const result = computeVotingCloseTime(eventTime, 90);
    expect(result.toISOString()).toBe("2026-01-10T18:30:00.000Z");
  });

  it("returns the event time unchanged when offset is zero", () => {
    const eventTime = new Date("2026-01-10T20:00:00Z");
    const result = computeVotingCloseTime(eventTime, 0);
    expect(result.toISOString()).toBe(eventTime.toISOString());
  });
});

describe("isVotingOpen", () => {
  it("is open when the event is 'open' and now is before the voting close time", () => {
    const event = makeEvent({ status: "open", votingCloseTime: new Date("2026-01-10T19:00:00Z") });
    expect(isVotingOpen(event, new Date("2026-01-10T18:00:00Z"))).toBe(true);
  });

  it("is closed once now reaches the voting close time", () => {
    const event = makeEvent({ status: "open", votingCloseTime: new Date("2026-01-10T19:00:00Z") });
    expect(isVotingOpen(event, new Date("2026-01-10T19:00:00Z"))).toBe(false);
  });

  it("is closed when the event status is no longer 'open'", () => {
    const event = makeEvent({ status: "voting_closed", votingCloseTime: new Date("2026-01-10T19:00:00Z") });
    expect(isVotingOpen(event, new Date("2026-01-10T18:00:00Z"))).toBe(false);
  });

  it("is closed when the event was cancelled", () => {
    const event = makeEvent({ status: "cancelled" });
    expect(isVotingOpen(event, new Date("2026-01-10T00:00:00Z"))).toBe(false);
  });
});

describe("canPropose", () => {
  it("allows proposing when the user is under their proposal limit", () => {
    const event = makeEvent({ status: "open" });
    const result = canPropose({ event, existingProposalCountForUser: 1, maxProposalsPerUser: 3 });
    expect(result).toEqual({ allowed: true });
  });

  it("rejects proposing once the user has hit their proposal limit", () => {
    const event = makeEvent({ status: "open" });
    const result = canPropose({ event, existingProposalCountForUser: 3, maxProposalsPerUser: 3 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/limit/i);
  });

  it("rejects proposing once voting has closed", () => {
    const event = makeEvent({ status: "voting_closed" });
    const result = canPropose({ event, existingProposalCountForUser: 0, maxProposalsPerUser: 3 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/closed/i);
  });

  it("rejects proposing on a cancelled event", () => {
    const event = makeEvent({ status: "cancelled" });
    const result = canPropose({ event, existingProposalCountForUser: 0, maxProposalsPerUser: 3 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/cancelled/i);
  });
});

describe("canVote", () => {
  it("allows voting when the event is open and the user has not voted yet", () => {
    const event = makeEvent({ status: "open" });
    const result = canVote({ event, hasExistingVote: false, proposalCount: 2 });
    expect(result).toEqual({ allowed: true });
  });

  it("rejects a second vote from the same user", () => {
    const event = makeEvent({ status: "open" });
    const result = canVote({ event, hasExistingVote: true, proposalCount: 2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already voted/i);
  });

  it("rejects voting once the event is no longer open", () => {
    const event = makeEvent({ status: "voting_closed" });
    const result = canVote({ event, hasExistingVote: false, proposalCount: 2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/closed/i);
  });

  it("rejects voting when there are no proposals to vote for", () => {
    const event = makeEvent({ status: "open" });
    const result = canVote({ event, hasExistingVote: false, proposalCount: 0 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/no movies/i);
  });
});
