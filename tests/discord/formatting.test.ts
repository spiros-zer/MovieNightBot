import { describe, expect, it } from "vitest";
import {
  buildAnnouncementEmbedData,
  buildMovieNightMessageData,
  channelDisplayName,
  discordTimestamp,
  MAX_MOVIE_ROW_EMBEDS,
  movieLink,
  NUMBER_EMOJIS,
  numberEmojiIndex,
} from "../../src/discord/formatting";
import type { MovieNightEvent, MovieProposal } from "../../src/domain/types";
import type { VotingClosedPayload } from "../../src/services/movieNightService";

function proposal(
  id: string,
  title: string,
  userId: string,
  posterUrl: string | null = null,
  sourceUrl: string | null = null,
): MovieProposal {
  return { id, eventId: "event-1", userId, title, createdAt: new Date(), posterUrl, sourceUrl };
}

function baseEvent(overrides: Partial<MovieNightEvent> = {}): MovieNightEvent {
  return {
    id: "event-1",
    guildId: "guild-1",
    channelId: "channel-1",
    creatorId: "creator-1",
    eventTime: new Date("2026-02-01T20:00:00.000Z"),
    votingCloseTime: new Date("2026-02-01T19:00:00.000Z"),
    status: "open",
    winningProposalId: null,
    discordEventId: null,
    announcementMessageId: null,
    ...overrides,
  };
}

function basePayload(overrides: Partial<VotingClosedPayload> = {}): VotingClosedPayload {
  return {
    event: baseEvent({ status: "announced" }),
    proposals: [],
    winner: null,
    counts: new Map(),
    tiedCount: 0,
    ...overrides,
  };
}

describe("discordTimestamp", () => {
  it("renders Discord's <t:seconds:style> markup", () => {
    const date = new Date("2026-02-01T20:00:00.000Z");
    expect(discordTimestamp(date)).toBe(`<t:${Math.floor(date.getTime() / 1000)}:F>`);
  });

  it("supports an alternate style", () => {
    const date = new Date("2026-02-01T20:00:00.000Z");
    expect(discordTimestamp(date, "R")).toBe(`<t:${Math.floor(date.getTime() / 1000)}:R>`);
  });
});

describe("channelDisplayName", () => {
  it("returns the channel's name when it has one", () => {
    expect(channelDisplayName({ id: "channel-1", name: "movie-night" })).toBe("movie-night");
  });

  it("falls back to a generic label for channel types without a name", () => {
    expect(channelDisplayName({ id: "channel-1" })).toBe("the event channel");
    expect(channelDisplayName({ id: "channel-1", name: undefined })).toBe("the event channel");
  });
});

describe("movieLink", () => {
  it("returns a plain bolded title when there's no source URL", () => {
    expect(movieLink("The Matrix", null)).toBe("**The Matrix**");
  });

  it("wraps the title in a masked link to the source URL", () => {
    expect(movieLink("The Matrix", "https://www.netflix.com/title/70143836")).toBe(
      "[**The Matrix**](https://www.netflix.com/title/70143836)",
    );
  });

  it("escapes brackets in the title so it can't break out of the link syntax", () => {
    expect(movieLink("Weird [Title]", "https://example.com/movie")).toBe(
      "[**Weird \\[Title\\]**](https://example.com/movie)",
    );
  });

  it("falls back to plain bold if the URL itself contains a closing paren", () => {
    expect(movieLink("The Matrix", "https://example.com/movie(1999)")).toBe("**The Matrix**");
  });
});

describe("numberEmojiIndex", () => {
  it("maps a known number emoji back to its zero-based index", () => {
    expect(numberEmojiIndex(NUMBER_EMOJIS[0])).toBe(0);
    expect(numberEmojiIndex(NUMBER_EMOJIS[8])).toBe(8);
  });

  it("returns null for anything that isn't a tracked number emoji", () => {
    expect(numberEmojiIndex("👍")).toBeNull();
  });
});

describe("buildAnnouncementEmbedData", () => {
  it("announces the winner with vote counts sorted highest first", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const p2 = proposal("p2", "Inception", "u2");
    const p3 = proposal("p3", "Arrival", "u3");
    const counts = new Map([
      ["p1", 1],
      ["p2", 3],
      ["p3", 0],
    ]);
    const payload = basePayload({ proposals: [p1, p2, p3], winner: p2, counts, tiedCount: 1 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/Inception/);
    expect(result.fields[0].value).toMatch(/Inception.*3/);
    // Highest vote count should appear before lower ones in the results field.
    const inceptionIndex = result.description.indexOf("Inception");
    const matrixIndex = result.description.indexOf("Matrix");
    const arrivalIndex = result.description.indexOf("Arrival");
    expect(inceptionIndex).toBeGreaterThanOrEqual(0);
    expect(inceptionIndex).toBeLessThan(matrixIndex);
    expect(matrixIndex).toBeLessThan(arrivalIndex);
  });

  it("handles a tie by not implying the win was unanimous", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const p2 = proposal("p2", "Inception", "u2");
    const counts = new Map([
      ["p1", 2],
      ["p2", 2],
    ]);
    const payload = basePayload({ proposals: [p1, p2], winner: p1, counts, tiedCount: 2 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/Matrix/);
    expect(result.description).toMatch(/tie|raffle|random/i);
  });

  it("reports that no movie was chosen when there were no proposals", () => {
    const payload = basePayload({ proposals: [], winner: null, counts: new Map() });
    const result = buildAnnouncementEmbedData(payload);
    expect(result.title).toMatch(/no movie/i);
  });

  it("includes the winner's poster image when it was proposed via a link", () => {
    const p1 = proposal("p1", "The Matrix", "u1", "https://img.example.com/matrix.jpg");
    const payload = basePayload({ proposals: [p1], winner: p1, counts: new Map([["p1", 1]]), tiedCount: 1 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.imageUrl).toBe("https://img.example.com/matrix.jpg");
  });

  it("omits the image field when the winner has no poster", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const payload = basePayload({ proposals: [p1], winner: p1, counts: new Map([["p1", 1]]), tiedCount: 1 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.imageUrl).toBeUndefined();
  });

  it("links the winner's title in the description and field, and sets the embed url, when proposed via a link", () => {
    const p1 = proposal("p1", "The Matrix", "u1", null, "https://www.netflix.com/title/70143836");
    const p2 = proposal("p2", "Inception", "u2");
    const payload = basePayload({
      proposals: [p1, p2],
      winner: p1,
      counts: new Map([
        ["p1", 2],
        ["p2", 1],
      ]),
      tiedCount: 1,
    });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.description).toContain("[**The Matrix**](https://www.netflix.com/title/70143836)");
    expect(result.fields[0].value).toContain("[**The Matrix**](https://www.netflix.com/title/70143836)");
    expect(result.url).toBe("https://www.netflix.com/title/70143836");
  });

  it("omits the embed url when the winner has no source link", () => {
    const p1 = proposal("p1", "The Matrix", "u1");
    const payload = basePayload({ proposals: [p1], winner: p1, counts: new Map([["p1", 1]]), tiedCount: 1 });

    const result = buildAnnouncementEmbedData(payload);
    expect(result.url).toBeUndefined();
  });
});

describe("buildMovieNightMessageData", () => {
  it("shows who scheduled it, the event time, and that voting is open", () => {
    const event = baseEvent();
    const result = buildMovieNightMessageData(event, [], new Map());

    expect(result.header.fields).toContainEqual({ name: "Scheduled by", value: "<@creator-1>", inline: true });
    expect(result.header.description).toContain("Status: **open**");
    expect(result.header.description).toContain("Voting closes:");
    expect(result.header.description).not.toContain("Voting closes: closed");
  });

  it("shows a placeholder when nobody has proposed yet", () => {
    const event = baseEvent();
    const result = buildMovieNightMessageData(event, [], new Map());

    expect(result.header.description).toMatch(/no movies proposed yet/i);
    expect(result.movieEmbeds).toEqual([]);
  });

  it("discloses to voters that a movie is picked at random if nobody votes", () => {
    const event = baseEvent();
    const p1 = proposal("p1", "The Matrix", "u1");
    const result = buildMovieNightMessageData(event, [p1], new Map());

    expect(result.header.description).toMatch(/picked at random/i);
  });

  it("omits the random-pick disclosure once voting has closed", () => {
    const event = baseEvent({ status: "announced", winningProposalId: "p1" });
    const p1 = proposal("p1", "The Matrix", "u1");
    const result = buildMovieNightMessageData(event, [p1], new Map([["p1", 1]]));

    expect(result.header.description).not.toMatch(/picked at random/i);
  });

  it("renders one embed per proposal, sorted by votes, with poster and link", () => {
    const event = baseEvent();
    const p1 = proposal("p1", "The Matrix", "u1", "https://img.example.com/matrix.jpg", "https://www.netflix.com/title/1");
    const p2 = proposal("p2", "Inception", "u2");
    const counts = new Map([
      ["p1", 1],
      ["p2", 3],
    ]);

    const result = buildMovieNightMessageData(event, [p1, p2], counts);

    expect(result.movieEmbeds).toEqual([
      { title: `${NUMBER_EMOJIS[1]} Inception`, description: "3 votes" },
      {
        title: `${NUMBER_EMOJIS[0]} The Matrix`,
        description: "1 vote",
        url: "https://www.netflix.com/title/1",
        imageUrl: "https://img.example.com/matrix.jpg",
      },
    ]);
  });

  it("gives each proposal a number fixed by proposal order, unaffected by vote-count reordering", () => {
    const event = baseEvent();
    const p1 = proposal("p1", "The Matrix", "u1");
    const p2 = proposal("p2", "Inception", "u2");
    const p3 = proposal("p3", "Arrival", "u3");
    const counts = new Map([
      ["p1", 0],
      ["p2", 5],
      ["p3", 1],
    ]);

    const result = buildMovieNightMessageData(event, [p1, p2, p3], counts);

    const byTitle = new Map(result.movieEmbeds.map((row) => [row.title.split(" ").slice(1).join(" "), row.title.split(" ")[0]]));
    expect(byTitle.get("The Matrix")).toBe(NUMBER_EMOJIS[0]);
    expect(byTitle.get("Inception")).toBe(NUMBER_EMOJIS[1]);
    expect(byTitle.get("Arrival")).toBe(NUMBER_EMOJIS[2]);
  });

  it("marks the winning proposal once the event is closed", () => {
    const event = baseEvent({ status: "announced", winningProposalId: "p1" });
    const p1 = proposal("p1", "The Matrix", "u1");
    const result = buildMovieNightMessageData(event, [p1], new Map([["p1", 2]]));

    expect(result.movieEmbeds[0].title).toBe(`${NUMBER_EMOJIS[0]} 🏆 The Matrix`);
    expect(result.header.description).toContain("Status: **closed**");
    expect(result.header.description).toContain("Voting closes: closed");
  });

  it("caps movie embeds at the Discord per-message limit and lists the rest as an overflow note", () => {
    const event = baseEvent();
    const proposals = Array.from({ length: MAX_MOVIE_ROW_EMBEDS + 3 }, (_, i) => proposal(`p${i}`, `Movie ${i}`, `u${i}`));
    const counts = new Map(proposals.map((p, i) => [p.id, proposals.length - i]));

    const result = buildMovieNightMessageData(event, proposals, counts);

    expect(result.movieEmbeds).toHaveLength(MAX_MOVIE_ROW_EMBEDS);
    expect(result.header.description).toMatch(/\+3 more/);
  });

  it("keeps the first proposals numbered even if a later one outvotes them, since reactions are already tied to those numbers", () => {
    const event = baseEvent();
    const proposals = Array.from({ length: MAX_MOVIE_ROW_EMBEDS + 1 }, (_, i) => proposal(`p${i}`, `Movie ${i}`, `u${i}`));
    // The overflow (11th) proposal gets by far the most votes, but it was proposed too late to
    // have a number/reaction, so it must not bump an earlier one out of the numbered rows.
    const counts = new Map(proposals.map((p, i) => [p.id, i === proposals.length - 1 ? 100 : 0]));

    const result = buildMovieNightMessageData(event, proposals, counts);

    expect(result.movieEmbeds).toHaveLength(MAX_MOVIE_ROW_EMBEDS);
    expect(result.movieEmbeds.some((row) => row.title.includes("Movie 0"))).toBe(true);
    expect(result.movieEmbeds.some((row) => row.title.includes(`Movie ${MAX_MOVIE_ROW_EMBEDS}`))).toBe(false);
    expect(result.header.description).toContain(`Movie ${MAX_MOVIE_ROW_EMBEDS}`);
  });
});
