# Movie Night Bot

A Discord bot for organizing movie night events: schedule a date/time, let
members propose and vote on movies, and automatically announce the winner
before the event starts.

## How it works

1. Anyone can schedule a movie night with `/movienight schedule` (date, time,
   optional time zone and channel).
2. Members propose movies with `/movienight propose` — the server admin
   controls how many proposals each person may submit (`/movienight config`).
3. Members vote for one proposed movie with `/movienight vote` (one vote per
   person).
4. A configurable number of minutes before the event (also set via
   `/movienight config`), voting closes automatically and the bot announces
   the winner in the event's channel. Ties are broken by a random raffle
   draw; if nobody voted, a movie is still picked at random from the
   proposals so the event never goes undecided.
5. `/movienight status` shows live standings at any time; `/movienight
   cancel` lets the organizer cancel an event they scheduled.

## Requirements

- Node.js **22.5+** (uses the built-in `node:sqlite` module — no native
  build tools required, unlike most SQLite drivers).
- A Discord application + bot token ([Discord Developer Portal](https://discord.com/developers/applications)).

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `DISCORD_TOKEN` — your bot's token.
- `DISCORD_CLIENT_ID` — your application's client ID.
- `DISCORD_DEV_GUILD_ID` — (optional) a guild ID for instant command
  registration during development. Omit for global registration (can take up
  to an hour to propagate).
- `DATABASE_PATH` — where the SQLite file is stored (default
  `./data/movie-night.sqlite`).

Invite the bot to your server with the `applications.commands` and `bot`
scopes, and the "Send Messages" / "Use Slash Commands" permissions.

Register the slash commands, then start the bot:

```bash
npm run deploy-commands
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

## Commands

| Command | Who | Description |
|---|---|---|
| `/movienight schedule date time [timezone] [channel]` | anyone | Schedules a movie night. |
| `/movienight propose event title` | anyone | Proposes a movie. |
| `/movienight vote event movie` | anyone | Casts a single vote. |
| `/movienight status event` | anyone | Shows live proposals and vote counts. |
| `/movienight cancel event` | the event's creator | Cancels a movie night. |
| `/movienight config [max-proposals] [close-before-minutes]` | Manage Server permission | Views/changes per-server rules. |

## Development

```bash
npm test          # run the test suite once
npm run test:watch
npm run typecheck
```

The codebase is layered so the interesting logic is unit-testable without
Discord or a database:

- `src/domain/` — pure rules (who can propose/vote, tie-break tallying).
- `src/db/` — SQLite persistence (via `node:sqlite`).
- `src/scheduler/` — schedules the automatic vote-close/announcement job,
  including for delays beyond `setTimeout`'s ~24.8-day limit.
- `src/services/movieNightService.ts` — orchestrates the above; this is
  where guild config, event/proposal/vote rules, and scheduling meet.
- `src/discord/` — slash command definitions, date/time parsing, embed
  formatting, and the bot client itself.
