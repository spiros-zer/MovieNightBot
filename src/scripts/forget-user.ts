import { env } from "../config/env";
import { createDatabase } from "../db/database";
import { GuildConfigRepository } from "../db/repositories/guildConfigRepository";
import { EventRepository } from "../db/repositories/eventRepository";
import { ProposalRepository } from "../db/repositories/proposalRepository";
import { VoteRepository } from "../db/repositories/voteRepository";
import { TimerScheduler } from "../scheduler/timerScheduler";
import { MovieNightService } from "../services/movieNightService";

/**
 * Operator-run tool for a Privacy Policy data-deletion request: deletes every proposal and vote a
 * Discord user submitted through the bot, across all guilds this instance serves. Run against the
 * bot's own database file — stop the bot first if it's running, so a concurrent write can't race
 * this script's read-then-delete.
 *
 * Usage: npm run forget-user -- <discord-user-id>
 */
function main(): void {
  const userId = process.argv[2];
  if (!userId || !/^\d{5,25}$/.test(userId)) {
    console.error("Usage: npm run forget-user -- <discord-user-id>");
    console.error('Expected a numeric Discord user ID (right-click a user in Discord with Developer Mode on → "Copy User ID").');
    process.exit(1);
  }

  const db = createDatabase(env.databasePath());
  const service = new MovieNightService({
    guildConfigRepo: new GuildConfigRepository(db),
    eventRepo: new EventRepository(db),
    proposalRepo: new ProposalRepository(db),
    voteRepo: new VoteRepository(db),
    scheduler: new TimerScheduler(),
  });

  const result = service.forgetUser(userId);

  console.log(`Deleted ${result.deletedVoteCount} vote(s) cast by ${userId}.`);
  console.log(`Deleted ${result.deletedProposalCount} proposal(s) submitted by ${userId}.`);
  if (result.collateralVoteCount > 0) {
    console.log(
      `Also deleted ${result.collateralVoteCount} vote(s) *other* users cast for those proposals ` +
        `(a vote can't reference a proposal that no longer exists).`,
    );
  }
  if (result.retainedAsOrganizerOf.length > 0) {
    console.log(
      `Note: ${userId} is still recorded as the organizer of ${result.retainedAsOrganizerOf.length} movie night event(s) ` +
        `(${result.retainedAsOrganizerOf.map((event) => event.id).join(", ")}). This is kept because it's operational data ` +
        `already shown publicly on the event's own status message ("Scheduled by @user"), and, while an event is still ` +
        `open, is needed to know who's allowed to cancel it — it isn't personal content like a proposal or vote. ` +
        `Cancel those events first (or wait for them to close) if the requester also wants that association gone.`,
    );
  }
}

main();
