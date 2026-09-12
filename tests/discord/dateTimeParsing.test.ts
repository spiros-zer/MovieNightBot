import { describe, expect, it } from "vitest";
import { parseEventDateTime } from "../../src/discord/dateTimeParsing";

describe("parseEventDateTime", () => {
  it("parses a valid date and time as UTC by default", () => {
    const result = parseEventDateTime("2026-02-01", "20:00");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-02-01T20:00:00.000Z");
  });

  it("converts a wall-clock time in a named time zone to the correct UTC instant", () => {
    // 2026-01-15 is outside DST for America/New_York (EST, UTC-5).
    const result = parseEventDateTime("2026-01-15", "20:00", "America/New_York");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-01-16T01:00:00.000Z");
  });

  it("accounts for daylight saving time when the zone observes it", () => {
    // 2026-07-15 is inside DST for America/New_York (EDT, UTC-4).
    const result = parseEventDateTime("2026-07-15", "20:00", "America/New_York");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toISOString()).toBe("2026-07-16T00:00:00.000Z");
  });

  it("rejects a malformed date string", () => {
    const result = parseEventDateTime("02/01/2026", "20:00");
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const result = parseEventDateTime("2026-02-01", "8pm");
    expect(result.ok).toBe(false);
  });

  it("rejects a calendar date that doesn't exist", () => {
    const result = parseEventDateTime("2026-02-30", "20:00");
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range time", () => {
    const result = parseEventDateTime("2026-02-01", "25:61");
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized time zone name", () => {
    const result = parseEventDateTime("2026-02-01", "20:00", "Not/AZone");
    expect(result.ok).toBe(false);
  });
});
