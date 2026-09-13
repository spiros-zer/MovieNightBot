import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import type { MovieNightEvent } from "../domain/types";

/** Discord requires an end time for an External-entity scheduled event; movie + discussion buffer. */
export const SCHEDULED_EVENT_DURATION_MINUTES = 180;

export function buildScheduledEventOptions(event: MovieNightEvent, channelName: string) {
  return {
    name: "🎬 Movie Night",
    scheduledStartTime: event.eventTime,
    scheduledEndTime: new Date(event.eventTime.getTime() + SCHEDULED_EVENT_DURATION_MINUTES * 60_000),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: `#${channelName}` },
    description: `Propose a movie with /movienight propose or vote with /movienight vote in #${channelName}.`,
  };
}

export function buildResultDescription(channelName: string, winnerTitle: string | null): string {
  return winnerTitle
    ? `🏆 Winner: ${winnerTitle}. See #${channelName} for the full results.`
    : `No movie was chosen — nobody proposed one in time. See #${channelName} for details.`;
}
