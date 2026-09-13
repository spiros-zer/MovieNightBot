import { describe, expect, it } from "vitest";
import { isValidTimeZone, parseEventDateTime } from "../../src/discord/dateTimeParsing";

const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("parseEventDateTime", () => {
  it("parses a valid date and time as UTC by default, assuming the current year", () => {
    const result = parseEventDateTime("02-01", "20:00", "UTC", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-02-01T20:00:00.000Z");
  });

  it("converts a wall-clock time in a named time zone to the correct UTC instant", () => {
    // 01-15 is outside DST for America/New_York (EST, UTC-5).
    const result = parseEventDateTime("01-15", "20:00", "America/New_York", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-01-16T01:00:00.000Z");
  });

  it("accounts for daylight saving time when the zone observes it", () => {
    // 07-15 is inside DST for America/New_York (EDT, UTC-4).
    const result = parseEventDateTime("07-15", "20:00", "America/New_York", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });

  it("defaults to today's real-world year when `now` isn't supplied", () => {
    const result = parseEventDateTime("02-01", "20:00");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });

  it("rejects a date that still includes a year", () => {
    const result = parseEventDateTime("2026-02-01", "20:00", "UTC", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const result = parseEventDateTime("02/01", "20:00", "UTC", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const result = parseEventDateTime("02-01", "8pm", "UTC", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects a calendar date that doesn't exist", () => {
    const result = parseEventDateTime("02-30", "20:00", "UTC", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range time", () => {
    const result = parseEventDateTime("02-01", "25:61", "UTC", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized time zone name", () => {
    const result = parseEventDateTime("02-01", "20:00", "Not/AZone", NOW);
    expect(result.ok).toBe(false);
  });
});

describe("isValidTimeZone", () => {
  it("accepts a real IANA time zone name", () => {
    expect(isValidTimeZone("Europe/Athens")).toBe(true);
  });

  it("rejects a made-up time zone name", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });
});
