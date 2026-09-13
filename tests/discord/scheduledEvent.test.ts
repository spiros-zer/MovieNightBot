import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import { describe, expect, it } from "vitest";
import { buildResultDescription, buildScheduledEventOptions, SCHEDULED_EVENT_DURATION_MINUTES } from "../../src/discord/scheduledEvent";
import type { MovieNightEvent } from "../../src/domain/types";

function makeEvent(overrides: Partial<MovieNightEvent> = {}): MovieNightEvent {
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "creator-1",
    eventTime: new Date("2026-02-01T20:00:00.000Z"),
    votingCloseTime: new Date("2026-02-01T19:00:00.000Z"),
    status: "open",
    winningProposalId: null,
    discordEventId: null,
    announcementMessageId: null,
    ...overrides,
  };
}

describe("buildScheduledEventOptions", () => {
  it("builds an External guild-only scheduled event matching the movie night's start time", () => {
    const event = makeEvent();
    const options = buildScheduledEventOptions(event, "movie-night");

    expect(options.scheduledStartTime).toBe(event.eventTime);
    expect(options.privacyLevel).toBe(GuildScheduledEventPrivacyLevel.GuildOnly);
    expect(options.entityType).toBe(GuildScheduledEventEntityType.External);
    expect(options.entityMetadata.location).toBe("#movie-night");
    expect(options.description).toMatch(/movienight propose/);
  });

  it("sets an end time offset from the start by the configured duration", () => {
    const event = makeEvent();
    const options = buildScheduledEventOptions(event, "movie-night");

    const diffMinutes = (options.scheduledEndTime.getTime() - event.eventTime.getTime()) / 60_000;
    expect(diffMinutes).toBe(SCHEDULED_EVENT_DURATION_MINUTES);
  });
});

describe("buildResultDescription", () => {
  it("announces the winner by name", () => {
    expect(buildResultDescription("movie-night", "The Matrix")).toMatch(/Winner: The Matrix/);
  });

  it("explains that nothing was chosen when there's no winner", () => {
    expect(buildResultDescription("movie-night", null)).toMatch(/no movie was chosen/i);
  });
});
