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
2. Members propose movies with `/movienight propose` (or the "🎬 Propose a
   Movie" button on the status message) — the server admin controls how many
   proposals each person may submit (`/movienight config`). Instead of typing
   a title, they can paste a link to the movie (IMDb, Netflix, TMDB, Disney+,
   JustWatch, ...); the bot reads that page's link-preview metadata (the same
   `og:title`/`og:image` tags used for share previews on iMessage/WhatsApp/
   Discord itself) to fill in the correct title and poster automatically. If
   a link can't be read, the raw link is used as the title so proposing still
   succeeds. The status message updates immediately to show the new proposal.
3. Members vote for one proposed movie with `/movienight vote` (one vote per
   person) — the status message's vote counts update immediately.
4. A configurable number of minutes before the event (also set via
   `/movienight config`), voting closes automatically and the bot announces
   the winner in the event's channel, and the status message flips to
   "closed" with final tallies and the winner marked. Ties are broken by a
   random raffle draw; if nobody voted, a movie is still picked at random
   from the proposals so the event never goes undecided.
5. `/movienight status` shows the same information as an ephemeral (only you
   can see it) reply, in case the pinned message has scrolled out of view;
   `/movienight cancel` lets the organizer cancel an event they scheduled.

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
scopes, and the "Send Messages" / "Use Slash Commands" permissions. Also grant
"Manage Events" if you want scheduled movie nights to show up in the server's
Events tab (optional — the bot still works without it, just without that
calendar entry).

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
| `/movienight propose event title` | anyone | Proposes a movie — `title` can be a movie title or a link to it (IMDb, Netflix, etc.). |
| `/movienight vote event movie` | anyone | Casts a single vote. |
| `/movienight status event` | anyone | Shows the current proposals and vote counts (ephemeral — the pinned message already stays current). |
| `/movienight cancel event` | the event's creator | Cancels a movie night. |
| `/movienight config [max-proposals] [close-before-minutes] [timezone]` | Manage Server permission | Views/changes per-server rules, including the default time zone used when `schedule` omits one. |

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
  formatting, and the bot client itself. `formatting.ts` builds the pinned
  status message's content (header + one embed per movie) as plain data;
  `announcementMessage.ts` turns that into real embeds and edits the pinned
  message in place (`refreshAnnouncementMessage`), called after every
  propose/vote/close.
- `src/services/linkMetadata.ts` — fetches a pasted URL's link-preview
  (Open Graph/Twitter Card) title and image; `src/services/proposalInput.ts`
  turns a propose field's raw text into a title/poster/source triple,
  resolving it through a link if it looks like one.
