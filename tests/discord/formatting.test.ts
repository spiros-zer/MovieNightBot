import { describe, expect, it } from "vitest";
import { buildAnnouncementEmbedData, channelDisplayName, discordTimestamp } from "../../src/discord/formatting";
import type { MovieProposal } from "../../src/domain/types";
import type { VotingClosedPayload } from "../../src/services/movieNightService";

function proposal(id: string, title: string, userId: string): MovieProposal {
  return { id, eventId: "event-1", userId, title, createdAt: new Date() };
}

function basePayload(overrides: Partial<VotingClosedPayload> = {}): VotingClosedPayload {
  return {
    event: {
      id: "event-1",
      guildId: "guild-1",
      channelId: "channel-1",
      creatorId: "creator-1",
      eventTime: new Date("2026-02-01T20:00:00.000Z"),
      votingCloseTime: new Date("2026-02-01T19:00:00.000Z"),
      status: "announced",
      winningProposalId: null,
      discordEventId: null,
      announcementMessageId: null,
    },
    proposals: [],
    winner: null,
    counts: new Map(),
    tiedCount: 0,
    ...overrides,
  };
}

describe("discordTimestamp", () => {
  it("renders Discord's <t:seconds:style> markup", () => {
    const date = new Date("2026-02-01T20:00:00.000Z");
    expect(discordTimestamp(date)).toBe(`<t:${Math.floor(date.getTime() / 1000)}:F>`);
  });

  it("supports an alternate style", () => {
    const date = new Date("2026-02-01T20:00:00.000Z");
    expect(discordTimestamp(date, "R")).toBe(`<t:${Math.floor(date.getTime() / 1000)}:R>`);
  });
});

describe("channelDisplayName", () => {
  it("returns the channel's name when it has one", () => {
    expect(channelDisplayName({ id: "channel-1", name: "movie-night" })).toBe("movie-night");
  });

  it("falls back to a generic label for channel types without a name", () => {
    expect(channelDisplayName({ id: "channel-1" })).toBe("the event channel");
    expect(channelDisplayName({ id: "channel-1", name: undefined })).toBe("the event channel");
  });
});

describe("buildAnnouncementEmbedData", () => {
  it("announces the winner with vote counts sorted highest first", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const p2 = proposal("p2", "Inception", "u2");
    const p3 = proposal("p3", "Arrival", "u3");
    const counts = new Map([
      ["p1", 1],
      ["p2", 3],
      ["p3", 0],
    ]);
    const payload = basePayload({ proposals: [p1, p2, p3], winner: p2, counts, tiedCount: 1 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/Inception/);
    expect(result.fields[0].value).toMatch(/Inception.*3/);
    // Highest vote count should appear before lower ones in the results field.
    const inceptionIndex = result.description.indexOf("Inception");
    const matrixIndex = result.description.indexOf("Matrix");
    const arrivalIndex = result.description.indexOf("Arrival");
    expect(inceptionIndex).toBeGreaterThanOrEqual(0);
    expect(inceptionIndex).toBeLessThan(matrixIndex);
    expect(matrixIndex).toBeLessThan(arrivalIndex);
  });

  it("handles a tie by not implying the win was unanimous", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const p2 = proposal("p2", "Inception", "u2");
    const counts = new Map([
      ["p1", 2],
      ["p2", 2],
    ]);
    const payload = basePayload({ proposals: [p1, p2], winner: p1, counts, tiedCount: 2 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/Matrix/);
    expect(result.description).toMatch(/tie|raffle|random/i);
  });

  it("reports that no movie was chosen when there were no proposals", () => {
    const payload = basePayload({ proposals: [], winner: null, counts: new Map() });
    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/no movie/i);
  });
});
