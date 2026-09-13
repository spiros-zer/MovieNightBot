export type EventStatus = "open" | "voting_closed" | "announced" | "cancelled";

export interface GuildConfig {
  guildId: string;
  maxProposalsPerUser: number;
  votingCloseMinutesBeforeEvent: number;
  /** IANA time zone assumed for `/movienight schedule` when its `timezone` option is omitted. */
  defaultTimeZone: string;
}

export const DEFAULT_GUILD_CONFIG: Omit<GuildConfig, "guildId"> = {
  maxProposalsPerUser: 1,
  votingCloseMinutesBeforeEvent: 60,
  defaultTimeZone: "UTC",
};

export interface MovieNightEvent {
  id: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  eventTime: Date;
  votingCloseTime: Date;
  status: EventStatus;
  winningProposalId: string | null;
  /** Id of the associated Discord guild scheduled event (Events tab), if one was created. */
  discordEventId: string | null;
  /** Id of the channel message announcing this movie night (pinned on creation), if it was sent. */
  announcementMessageId: string | null;
}

export interface MovieProposal {
  id: string;
  eventId: string;
  userId: string;
  title: string;
  createdAt: Date;
}

export interface Vote {
  id: string;
  eventId: string;
  userId: string;
  proposalId: string;
  createdAt: Date;
}
