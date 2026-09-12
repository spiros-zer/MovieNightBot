import type { MovieProposal, Vote } from "./types";

export interface TallyResult {
  winner: MovieProposal | null;
  counts: Map<string, number>;
  /** How many proposals were tied for the winning vote count (1 = outright win, no proposals = 0). */
  tiedCount: number;
}

/**
 * Tallies votes and picks a winner. Ties (including the "nobody voted" case,
 * where every proposal is tied at zero) are broken at random via `rng`,
 * which must return a value in [0, 1) — matching Math.random's contract.
 */
export function countVotes(proposals: MovieProposal[], votes: Vote[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    counts.set(proposal.id, 0);
  }
  for (const vote of votes) {
    if (counts.has(vote.proposalId)) {
      counts.set(vote.proposalId, (counts.get(vote.proposalId) ?? 0) + 1);
    }
  }
  return counts;
}

export function tallyVotes(
  proposals: MovieProposal[],
  votes: Vote[],
  rng: () => number = Math.random,
): TallyResult {
  const counts = countVotes(proposals, votes);

  if (proposals.length === 0) {
    return { winner: null, counts, tiedCount: 0 };
  }

  const maxVotes = Math.max(...proposals.map((p) => counts.get(p.id) ?? 0));
  const tied = proposals.filter((p) => (counts.get(p.id) ?? 0) === maxVotes);

  const index = Math.min(tied.length - 1, Math.floor(rng() * tied.length));
  return { winner: tied[index], counts, tiedCount: tied.length };
}
