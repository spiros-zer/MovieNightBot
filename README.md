# Movie Night Bot

A Discord bot for organizing movie night events: schedule a date/time, let
members propose and vote on movies, and automatically announce the winner
before the event starts.

[Terms of Service](TERMS_OF_SERVICE.md) · [Privacy Policy](PRIVACY_POLICY.md)

## How it works

1. Anyone can schedule a movie night with `/movienight schedule` (date as
   `MM-DD` — the current year is always assumed — plus the time the movie
   starts, and optionally a time zone and channel; the time zone defaults to
   the server's configured default, see `/movienight config` below). This
   posts a single pinned status message — who scheduled it, when, whether
   voting is open, and one small embed per proposed movie with its poster and
   vote count — that's edited in place as people propose and vote, rather
   than posting a new message each time. If the bot has the **Manage Events**
   permission, it also creates a Discord scheduled event in the server's
   **Events** tab, so members see the day and time without leaving Discord's
   native UI.
2. Members propose movies with the "🎬 Propose a Movie" button on the status
   message — the server admin controls how many proposals each person may
   submit (`/movienight config`). Instead of typing a title, they can paste a
   link to the movie (IMDb, Netflix, TMDB, Disney+, JustWatch, ...); the bot
   reads that page's link-preview metadata (the same `og:title`/`og:image`
   tags used for share previews on iMessage/WhatsApp/Discord itself) to fill
   in the correct title and poster automatically. If a link can't be read,
   the raw link is used as the title so proposing still succeeds. The status
   message updates immediately to show the new proposal, numbered with the
   keycap emoji (1️⃣, 2️⃣, ...) the bot reacts with — a proposal's number is
   fixed for the event, even as movies get reordered by vote count.
3. Members vote by reacting with a movie's number emoji on the status
   message. Only one reaction counts: pressing a different number moves your
   vote there and removes your old reaction, and removing your reaction
   entirely retracts your vote. The status message's vote counts update
   immediately either way — proposing and voting are reaction/button-only,
   there's no slash-command equivalent.
4. A configurable number of minutes before the event (also set via
   `/movienight config`), voting closes automatically and the bot announces
   the winner in the event's channel, and the status message flips to
   "closed" with final tallies and the winner marked. Ties are broken by a
   random raffle draw; if nobody voted, a movie is still picked at random
   from the proposals so the event never goes undecided.
5. `/movienight cancel` lets the organizer cancel an event they scheduled.

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
scopes, and these bot permissions:

- **Send Messages** / **Use Slash Commands** — required; without these the
  bot can't post the status message or register `/movienight` at all.
- **Add Reactions** — required for voting: the bot reacts a proposal's number
  emoji onto the status message for people to vote with.
- **Manage Messages** — required for vote-*switching* to work correctly: when
  someone presses a different number, the bot removes their old reaction via
  `MessageReaction.users.remove()` for *that user*, which Discord only allows
  with this permission. Without it, that removal fails silently (caught and
  ignored, so voting doesn't break outright), but a stale reaction is left on
  the message and the person now has two number reactions even though only
  the newer one counts.
- **Manage Events** (optional) — grant this if you want scheduled movie
  nights to also show up in the server's **Events** tab. The bot still works
  without it, just without that calendar entry.

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
| `/movienight schedule date time [timezone] [channel]` | anyone | Schedules a movie night (`date` is `MM-DD`, current year assumed; `time` is when the movie starts). |
| `/movienight cancel event` | the event's creator | Cancels a movie night. |
| `/movienight config [max-proposals] [close-before-minutes] [timezone]` | Manage Server permission | Views/changes per-server rules, including the default time zone used when `schedule` omits one. |

## Development

```bash
npm test          # run the test suite once
npm run test:watch
npm run typecheck
```

To fulfil a data-deletion request under the [Privacy Policy](PRIVACY_POLICY.md)
(§5), stop the bot and run:

```bash
npm run forget-user -- <discord-user-id>
```

This deletes every proposal and vote that Discord user submitted, across all
guilds this instance serves (deleting one of their proposals also removes
any votes *other* users cast for it, since a vote can't outlive the proposal
it's for). It leaves alone events they *scheduled*: the organizer id is
operational data already shown publicly on the event's own status message,
not personal content like a proposal or vote — the script reports which
events, if any, are affected by that distinction.

The codebase is layered so the interesting logic is unit-testable without
Discord or a database:

- `src/domain/` — pure rules (who can propose/vote, tie-break tallying).
- `src/db/` — SQLite persistence (via `node:sqlite`).
- `src/scheduler/` — schedules the automatic vote-close/announcement job,
  including for delays beyond `setTimeout`'s ~24.8-day limit.
- `src/services/movieNightService.ts` — orchestrates the above; this is
  where guild config, event/proposal/vote rules, and scheduling meet.
- `src/discord/` — slash command definitions, date/time parsing, embed
  formatting, and the bot client itself. `formatting.ts` builds the pinned
  status message's content (header + one embed per movie, each numbered with
  a keycap emoji) as plain data; `announcementMessage.ts` turns that into
  real embeds and edits the pinned message in place
  (`refreshAnnouncementMessage`), called after every propose/vote/close, and
  reacts a newly proposed movie's number onto it. `voteReaction.ts` handles
  the other side: a user reacting/un-reacting with a number on that message
  casts, moves, or retracts their vote through the same service the `vote`
  subcommand uses.
- `src/services/linkMetadata.ts` — fetches a pasted URL's link-preview
  (Open Graph/Twitter Card) title and image; `src/services/proposalInput.ts`
  turns a propose field's raw text into a title/poster/source triple,
  resolving it through a link if it looks like one.
