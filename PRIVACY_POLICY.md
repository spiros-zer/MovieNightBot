# Privacy Policy

**Last updated:** 2026-09-27

This Privacy Policy explains what information Movie Night Bot (the "Bot") collects, how it's used, and your choices, when you interact with the Bot on a Discord server.

## 1. Information We Collect

When you use the Bot's commands, the following is stored in a database controlled by whoever operates that instance of the Bot:

- **Discord identifiers** — your Discord user ID, and the ID of the server (guild) and channel where a movie night event was scheduled. This is how the Bot knows who proposed or voted, and where to post announcements.
- **Movie night event details** — the date and time scheduled, and the server's configured proposal/voting rules (these are server-wide settings, not personal data).
- **Movie proposals** — either the title text you type, or, if you paste a link to the movie (e.g. an IMDb, Netflix, or TMDB page) instead of typing a title, the page's title and poster image, read from that page's own public link-preview metadata (the same `og:title`/`og:image` tags used for share previews on iMessage, WhatsApp, and Discord itself) — plus the link you pasted, stored alongside the proposal so it can be shown as a clickable title. No provider-specific API or account is used to read this; the Bot only reads what that page already exposes for link unfurling.
- **Votes** — which proposal you voted for (cast by reacting with its number on the Bot's own message), and a timestamp, so the Bot can enforce one vote per person and tally results.

The Bot does **not** collect your Discord username, avatar, email address, or any message content beyond what you submit through its own commands, buttons, or reactions. It has no access to and does not read your server's regular chat messages.

## 2. How We Use Information

This information is used solely to operate the Bot's features: enforcing per-user proposal and vote limits, tallying votes, and announcing the winning movie in the correct channel. It is not used for advertising, profiling, or any purpose unrelated to running movie night events.

## 3. Sharing

We do not sell or share this information with third parties, and it is not used by any analytics or advertising service. Data lives only in the database of the specific Bot instance a server has added.

## 4. Data Retention

Event, proposal, and vote records are kept until the Bot operator removes them. There is currently no automatic deletion schedule; you can request deletion as described below.

## 5. Your Rights

You can request that the Bot operator delete any data associated with your Discord user ID by contacting **spiridonzervos@gmail.com**. On request, the operator deletes every movie proposal and vote tied to your user ID, across every server this Bot instance is in.

One thing is not deleted by this: if you *scheduled* a movie night, that event keeps your Discord user ID as its organizer, because it's shown publicly to that server as "Scheduled by @you" on the event's own status message and, while the event is still open, is needed to know who's allowed to cancel it — this is closer to authorship of a public post than to the private proposal/vote data described in Section 1. If you'd also like that association removed, cancel the event yourself (or ask the operator to) before or as part of your request.

If you administer a server, removing the Bot stops any further data collection there; previously stored records can still be deleted on request as described above.

## 6. Children's Privacy

The Bot is not directed at children under the minimum age required by Discord's own Terms of Service (13 in most regions), and we do not knowingly collect data from users below that age beyond what Discord itself permits as part of normal command handling.

## 7. Security

We take reasonable measures to protect stored data, but no method of electronic storage is completely secure, and we cannot guarantee absolute security.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. The "Last updated" date above reflects the most recent change.

## 9. Contact

Questions about this policy, or requests to access or delete your data, can be sent to **spiridonzervos@gmail.com**.

---

*This document is a general template, not legal advice. If you plan to operate this Bot at a larger scale, or need specific legal compliance guarantees (e.g. GDPR, CCPA), consult a qualified lawyer in your jurisdiction.*
