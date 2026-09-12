import type { Scheduler } from "./scheduler";

// setTimeout delays are a signed 32-bit int of milliseconds; anything larger fires
// immediately in Node. Chain timers in chunks below that ceiling for far-future events.
const MAX_TIMEOUT_MS = 2_147_483_647;

export class TimerScheduler implements Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  scheduleAt(id: string, when: Date, callback: () => void): void {
    this.cancel(id);
    this.timers.set(id, this.armTimer(id, when.getTime(), callback));
  }

  cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private armTimer(id: string, targetMs: number, callback: () => void): NodeJS.Timeout {
    const remaining = targetMs - Date.now();

    if (remaining <= MAX_TIMEOUT_MS) {
      return setTimeout(() => {
        this.timers.delete(id);
        callback();
      }, Math.max(0, remaining));
    }

    return setTimeout(() => {
      this.timers.set(id, this.armTimer(id, targetMs, callback));
    }, MAX_TIMEOUT_MS);
  }
}
