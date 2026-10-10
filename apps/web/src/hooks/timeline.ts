import type { Timed } from "@onfloor/contracts";

/** Plays a fixture timeline on timers (mock mode). Returns a cancel function. */
export function playTimeline<T>(timeline: Timed<T>[], onEvent: (event: T) => void, startDelayMs = 0): () => void {
  const timers = timeline.map(({ atMs, event }) => setTimeout(() => onEvent(event), startDelayMs + atMs));
  return () => timers.forEach(clearTimeout);
}
