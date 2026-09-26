import type { MovieNightEvent } from "./types";

export function computeVotingCloseTime(eventTime: Date, minutesBefore: number): Date {
  return new Date(eventTime.getTime() - minutesBefore * 60_000);
}

export function isVotingOpen(event: MovieNightEvent, now: Date): boolean {
  return event.status === "open" && now.getTime() < event.votingCloseTime.getTime();
}

export interface RuleResult {
  allowed: boolean;
  reason?: string;
}

export function canPropose(params: {
  event: MovieNightEvent;
  existingProposalCountForUser: number;
  maxProposalsPerUser: number;
}): RuleResult {
  const { event, existingProposalCountForUser, maxProposalsPerUser } = params;

  if (event.status === "cancelled") {
    return { allowed: false, reason: "This movie night has been cancelled." };
  }
  if (event.status !== "open") {
    return { allowed: false, reason: "Proposals are closed for this movie night." };
  }
  if (existingProposalCountForUser >= maxProposalsPerUser) {
    return {
      allowed: false,
      reason: `You've reached the limit of ${maxProposalsPerUser} proposal(s) per person for this movie night.`,
    };
  }
  return { allowed: true };
}

/** A user may (re-)cast their vote any time voting is open; casting again just moves it to the new proposal. */
export function canVote(params: { event: MovieNightEvent; proposalCount: number }): RuleResult {
  const { event, proposalCount } = params;

  if (event.status === "cancelled") {
    return { allowed: false, reason: "This movie night has been cancelled." };
  }
  if (event.status !== "open") {
    return { allowed: false, reason: "Voting is closed for this movie night." };
  }
  if (proposalCount === 0) {
    return { allowed: false, reason: "There are no movies proposed yet to vote for." };
  }
  return { allowed: true };
}
