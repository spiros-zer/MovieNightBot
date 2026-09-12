export interface Scheduler {
  /** Schedules `callback` to run at `when`, replacing any job previously scheduled under `id`. */
  scheduleAt(id: string, when: Date, callback: () => void): void;
  /** Cancels the job scheduled under `id`, if any. */
  cancel(id: string): void;
}
