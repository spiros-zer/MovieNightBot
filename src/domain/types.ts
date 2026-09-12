export type EventStatus = "open" | "voting_closed" | "announced" | "cancelled";

export interface GuildConfig {
  guildId: string;
  maxProposalsPerUser: number;
  votingCloseMinutesBeforeEvent: number;
}

export const DEFAULT_GUILD_CONFIG: Omit<GuildConfig, "guildId"> = {
  maxProposalsPerUser: 1,
  votingCloseMinutesBeforeEvent: 60,
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
