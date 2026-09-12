import { describe, expect, it } from "vitest";
import { tallyVotes } from "../../src/domain/tally";
import type { MovieProposal, Vote } from "../../src/domain/types";

function proposal(id: string, userId = "proposer"): MovieProposal {
  return { id, eventId: "event-1", userId, title: `Movie ${id}`, createdAt: new Date() };
}

function vote(id: string, proposalId: string, userId: string): Vote {
  return { id, eventId: "event-1", userId, proposalId, createdAt: new Date() };
}

describe("tallyVotes", () => {
  it("returns no winner when there are no proposals", () => {
    const result = tallyVotes([], []);
    expect(result.winner).toBeNull();
    expect(result.counts.size).toBe(0);
  });

  it("picks the single proposal when only one exists, even with no votes", () => {
    const proposals = [proposal("p1")];
    const result = tallyVotes(proposals, []);
    expect(result.winner?.id).toBe("p1");
  });

  it("picks the proposal with the most votes", () => {
    const proposals = [proposal("p1"), proposal("p2"), proposal("p3")];
    const votes = [
      vote("v1", "p1", "u1"),
      vote("v2", "p2", "u2"),
      vote("v3", "p2", "u3"),
      vote("v4", "p3", "u4"),
    ];
    const result = tallyVotes(proposals, votes);
    expect(result.winner?.id).toBe("p2");
    expect(result.counts.get("p1")).toBe(1);
    expect(result.counts.get("p2")).toBe(2);
    expect(result.counts.get("p3")).toBe(1);
  });

  it("breaks ties using the provided random number generator", () => {
    const proposals = [proposal("p1"), proposal("p2"), proposal("p3")];
    const votes = [vote("v1", "p1", "u1"), vote("v2", "p2", "u2")];
    // Tied proposals in tie order are [p1, p2]; rng() = 0.99 should select the last one.
    const result = tallyVotes(proposals, votes, () => 0.99);
    expect(result.winner?.id).toBe("p2");
  });

  it("picks deterministically when rng returns 0 (first tied proposal)", () => {
    const proposals = [proposal("p1"), proposal("p2"), proposal("p3")];
    const votes = [vote("v1", "p1", "u1"), vote("v2", "p2", "u2")];
    const result = tallyVotes(proposals, votes, () => 0);
    expect(result.winner?.id).toBe("p1");
  });

  it("randomly picks among all proposals when nobody voted", () => {
    const proposals = [proposal("p1"), proposal("p2"), proposal("p3")];
    const result = tallyVotes(proposals, [], () => 0.5);
    expect(result.winner?.id).toBe("p2");
    expect(result.counts.get("p1")).toBe(0);
  });
});
