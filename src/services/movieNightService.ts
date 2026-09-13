import { randomUUID } from "node:crypto";
import type { GuildConfigRepository } from "../db/repositories/guildConfigRepository";
import type { EventRepository } from "../db/repositories/eventRepository";
import type { ProposalRepository } from "../db/repositories/proposalRepository";
import type { VoteRepository } from "../db/repositories/voteRepository";
import type { Scheduler } from "../scheduler/scheduler";
import { canPropose, canVote, computeVotingCloseTime } from "../domain/rules";
import { countVotes, tallyVotes } from "../domain/tally";
import type { GuildConfig, MovieNightEvent, MovieProposal, Vote } from "../domain/types";

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface VotingClosedPayload {
  event: MovieNightEvent;
  proposals: MovieProposal[];
  winner: MovieProposal | null;
  counts: Map<string, number>;
  tiedCount: number;
}

export interface MovieNightServiceDeps {
  guildConfigRepo: GuildConfigRepository;
  eventRepo: EventRepository;
  proposalRepo: ProposalRepository;
  voteRepo: VoteRepository;
  scheduler: Scheduler;
  generateId?: () => string;
  now?: () => Date;
  rng?: () => number;
  onVotingClosed?: (payload: VotingClosedPayload) => void;
}

/** Orchestrates guild config, events, proposals and votes; owns the vote-close scheduling. */
export class MovieNightService {
  private readonly guildConfigRepo: GuildConfigRepository;
  private readonly eventRepo: EventRepository;
  private readonly proposalRepo: ProposalRepository;
  private readonly voteRepo: VoteRepository;
  private readonly scheduler: Scheduler;
  private readonly generateId: () => string;
  private readonly now: () => Date;
  private readonly rng: () => number;
  private readonly onVotingClosed?: (payload: VotingClosedPayload) => void;

  constructor(deps: MovieNightServiceDeps) {
    this.guildConfigRepo = deps.guildConfigRepo;
    this.eventRepo = deps.eventRepo;
    this.proposalRepo = deps.proposalRepo;
    this.voteRepo = deps.voteRepo;
    this.scheduler = deps.scheduler;
    this.generateId = deps.generateId ?? randomUUID;
    this.now = deps.now ?? (() => new Date());
    this.rng = deps.rng ?? Math.random;
    this.onVotingClosed = deps.onVotingClosed;
  }

  getGuildConfig(guildId: string): GuildConfig {
    return this.guildConfigRepo.getOrDefault(guildId);
  }

  setGuildConfig(
    guildId: string,
    updates: Partial<Pick<GuildConfig, "maxProposalsPerUser" | "votingCloseMinutesBeforeEvent" | "defaultTimeZone">>,
  ): GuildConfig {
    const current = this.guildConfigRepo.getOrDefault(guildId);
    const updated: GuildConfig = { ...current, ...updates };
    this.guildConfigRepo.upsert(updated);
    return updated;
  }

  createEvent(params: {
    guildId: string;
    channelId: string;
    creatorId: string;
    eventTime: Date;
  }): ServiceResult<MovieNightEvent> {
    if (params.eventTime.getTime() <= this.now().getTime()) {
      return { ok: false, reason: "The event time must be in the future." };
    }

    const config = this.guildConfigRepo.getOrDefault(params.guildId);
    const votingCloseTime = computeVotingCloseTime(params.eventTime, config.votingCloseMinutesBeforeEvent);
    if (votingCloseTime.getTime() <= this.now().getTime()) {
      return {
        ok: false,
        reason:
          "The voting deadline for this event would already be in the past. Pick a later time, or ask an admin to shorten the voting close offset.",
      };
    }

    const event: MovieNightEvent = {
      id: this.generateId(),
      guildId: params.guildId,
      channelId: params.channelId,
      creatorId: params.creatorId,
      eventTime: params.eventTime,
      votingCloseTime,
      status: "open",
      winningProposalId: null,
      discordEventId: null,
      announcementMessageId: null,
    };
    this.eventRepo.create(event);
    this.scheduleClose(event);
    return { ok: true, value: event };
  }

  getEvent(eventId: string): MovieNightEvent | null {
    return this.eventRepo.getById(eventId);
  }

  /** Looks up a movie night by its associated Discord guild scheduled event id (Events tab). */
  getEventByDiscordEventId(discordEventId: string): MovieNightEvent | null {
    return this.eventRepo.getByDiscordEventId(discordEventId);
  }

  /** Records the id of the Discord guild scheduled event (Events tab) created for this movie night, if any. */
  setDiscordEventId(eventId: string, discordEventId: string | null): MovieNightEvent | null {
    const event = this.eventRepo.getById(eventId);
    if (!event) return null;
    this.eventRepo.setDiscordEventId(eventId, discordEventId);
    return { ...event, discordEventId };
  }

  /** Records the id of the channel message announcing this movie night, so it can be deleted on cancellation. */
  setAnnouncementMessageId(eventId: string, announcementMessageId: string | null): MovieNightEvent | null {
    const event = this.eventRepo.getById(eventId);
    if (!event) return null;
    this.eventRepo.setAnnouncementMessageId(eventId, announcementMessageId);
    return { ...event, announcementMessageId };
  }

  listOpenEvents(guildId: string): MovieNightEvent[] {
    return this.eventRepo.listOpenEventsForGuild(guildId);
  }

  listProposals(eventId: string): MovieProposal[] {
    return this.proposalRepo.listByEvent(eventId);
  }

  /** Live standings for an in-progress (or concluded) event; does not mutate anything. */
  getStatus(eventId: string): { event: MovieNightEvent; proposals: MovieProposal[]; counts: Map<string, number> } | null {
    const event = this.eventRepo.getById(eventId);
    if (!event) return null;
    const proposals = this.proposalRepo.listByEvent(eventId);
    const votes = this.voteRepo.listByEvent(eventId);
    return { event, proposals, counts: countVotes(proposals, votes) };
  }

  proposeMovie(params: { eventId: string; userId: string; title: string }): ServiceResult<MovieProposal> {
    const event = this.eventRepo.getById(params.eventId);
    if (!event) return { ok: false, reason: "That movie night event doesn't exist." };

    const title = params.title.trim();
    if (!title) return { ok: false, reason: "A movie title can't be empty." };

    const config = this.guildConfigRepo.getOrDefault(event.guildId);
    const existingCount = this.proposalRepo.countByEventAndUser(event.id, params.userId);
    const rule = canPropose({
      event,
      existingProposalCountForUser: existingCount,
      maxProposalsPerUser: config.maxProposalsPerUser,
    });
    if (!rule.allowed) return { ok: false, reason: rule.reason! };

    const proposal: MovieProposal = {
      id: this.generateId(),
      eventId: event.id,
      userId: params.userId,
      title,
      createdAt: this.now(),
    };
    this.proposalRepo.create(proposal);
    return { ok: true, value: proposal };
  }

  castVote(params: {
    eventId: string;
    userId: string;
    proposalId: string;
  }): ServiceResult<{ vote: Vote; proposal: MovieProposal }> {
    const event = this.eventRepo.getById(params.eventId);
    if (!event) return { ok: false, reason: "That movie night event doesn't exist." };

    const proposal = this.proposalRepo.getById(params.proposalId);
    if (!proposal || proposal.eventId !== event.id) {
      return { ok: false, reason: "That movie isn't proposed for this event." };
    }

    const proposals = this.proposalRepo.listByEvent(event.id);
    const existingVote = this.voteRepo.getByEventAndUser(event.id, params.userId);
    const rule = canVote({ event, hasExistingVote: existingVote !== null, proposalCount: proposals.length });
    if (!rule.allowed) return { ok: false, reason: rule.reason! };

    const vote: Vote = {
      id: this.generateId(),
      eventId: event.id,
      userId: params.userId,
      proposalId: proposal.id,
      createdAt: this.now(),
    };
    this.voteRepo.create(vote);
    return { ok: true, value: { vote, proposal } };
  }

  cancelEvent(eventId: string, requesterId: string): ServiceResult<MovieNightEvent> {
    const event = this.eventRepo.getById(eventId);
    if (!event) return { ok: false, reason: "That movie night event doesn't exist." };
    if (event.creatorId !== requesterId) {
      return { ok: false, reason: "Only the person who scheduled this movie night can cancel it." };
    }
    if (event.status !== "open") {
      return { ok: false, reason: "This movie night is no longer open." };
    }

    this.eventRepo.updateStatus(event.id, "cancelled", null);
    this.scheduler.cancel(event.id);
    return { ok: true, value: { ...event, status: "cancelled", winningProposalId: null } };
  }

  /** Re-schedules vote-close jobs for events still open in storage; call once at startup. */
  rehydrate(): void {
    for (const event of this.eventRepo.listPendingEvents()) {
      this.scheduleClose(event);
    }
  }

  private scheduleClose(event: MovieNightEvent): void {
    this.scheduler.scheduleAt(event.id, event.votingCloseTime, () => this.closeVotingAndAnnounce(event.id));
  }

  private closeVotingAndAnnounce(eventId: string): void {
    const event = this.eventRepo.getById(eventId);
    if (!event || event.status !== "open") return;

    const proposals = this.proposalRepo.listByEvent(eventId);
    const votes = this.voteRepo.listByEvent(eventId);
    const { winner, counts, tiedCount } = tallyVotes(proposals, votes, this.rng);

    this.eventRepo.updateStatus(eventId, "announced", winner?.id ?? null);

    this.onVotingClosed?.({
      event: { ...event, status: "announced", winningProposalId: winner?.id ?? null },
      proposals,
      winner,
      counts,
      tiedCount,
    });
  }
}
