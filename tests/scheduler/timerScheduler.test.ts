import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerScheduler } from "../../src/scheduler/timerScheduler";

describe("TimerScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires the callback at the scheduled time", () => {
    const scheduler = new TimerScheduler();
    const callback = vi.fn();
    scheduler.scheduleAt("job-1", new Date("2026-01-01T00:00:10.000Z"), callback);

    vi.advanceTimersByTime(9_000);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fires promptly when the scheduled time is already in the past", () => {
    const scheduler = new TimerScheduler();
    const callback = vi.fn();
    scheduler.scheduleAt("job-1", new Date("2025-12-31T00:00:00.000Z"), callback);

    vi.advanceTimersByTime(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not fire a cancelled job", () => {
    const scheduler = new TimerScheduler();
    const callback = vi.fn();
    scheduler.scheduleAt("job-1", new Date("2026-01-01T00:00:10.000Z"), callback);
    scheduler.cancel("job-1");

    vi.advanceTimersByTime(20_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("replaces a prior job scheduled under the same id", () => {
    const scheduler = new TimerScheduler();
    const first = vi.fn();
    const second = vi.fn();
    scheduler.scheduleAt("job-1", new Date("2026-01-01T00:00:10.000Z"), first);
    scheduler.scheduleAt("job-1", new Date("2026-01-01T00:00:20.000Z"), second);

    vi.advanceTimersByTime(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("handles delays longer than setTimeout's ~24.8 day maximum by chaining timers", () => {
    const scheduler = new TimerScheduler();
    const callback = vi.fn();
    const fortyDaysOut = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    scheduler.scheduleAt("job-1", fortyDaysOut, callback);

    vi.advanceTimersByTime(35 * 24 * 60 * 60 * 1000);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5 * 24 * 60 * 60 * 1000 + 1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
