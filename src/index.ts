import { env } from "./config/env";
import { createDatabase } from "./db/database";
import { GuildConfigRepository } from "./db/repositories/guildConfigRepository";
import { EventRepository } from "./db/repositories/eventRepository";
import { ProposalRepository } from "./db/repositories/proposalRepository";
import { VoteRepository } from "./db/repositories/voteRepository";
import { TimerScheduler } from "./scheduler/timerScheduler";
import { MovieNightService } from "./services/movieNightService";
import { announceWinner, createClient } from "./discord/client";

async function main(): Promise<void> {
  const db = createDatabase(env.databasePath());

  const scheduler = new TimerScheduler();
  const service = new MovieNightService({
    guildConfigRepo: new GuildConfigRepository(db),
    eventRepo: new EventRepository(db),
    proposalRepo: new ProposalRepository(db),
    voteRepo: new VoteRepository(db),
    scheduler,
    onVotingClosed: (payload) => announceWinner(client, payload),
  });

  const client = createClient(service);

  // Vote-close timers for events still open from a previous run are restored once the
  // client is ready (see client.ts) — not here, since announcing requires a live client.
  await client.login(env.discordToken());
}

main().catch((error) => {
  console.error("Fatal error starting the bot:", error);
  process.exit(1);
});
