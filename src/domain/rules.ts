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

export function canVote(params: {
  event: MovieNightEvent;
  hasExistingVote: boolean;
  proposalCount: number;
}): RuleResult {
  const { event, hasExistingVote, proposalCount } = params;

  if (event.status === "cancelled") {
    return { allowed: false, reason: "This movie night has been cancelled." };
  }
  if (event.status !== "open") {
    return { allowed: false, reason: "Voting is closed for this movie night." };
  }
  if (proposalCount === 0) {
    return { allowed: false, reason: "There are no movies proposed yet to vote for." };
  }
  if (hasExistingVote) {
    return { allowed: false, reason: "You've already voted for this movie night." };
  }
  return { allowed: true };
}
