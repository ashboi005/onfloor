import type { Timed } from "@onfloor/contracts";

/**
 * Replays a scripted fixture timeline in real time. Used by the STUB_ENGINES path of
 * /ws/sim and /ws/live so the frontend can integrate against the real server before
 * the engines exist. `rewrite` lets the caller swap fixture ids for real ones.
 * Returns a cancel function.
 */
export function replayTimeline<T>(
  timeline: Timed<T>[],
  send: (event: T) => void,
  opts: { speed?: number; rewrite?: (event: T) => T; onDone?: () => void } = {},
): () => void {
  const speed = opts.speed ?? 1;
  const timers = timeline.map(({ atMs, event }) =>
    setTimeout(() => send(opts.rewrite ? opts.rewrite(event) : event), atMs / speed),
  );
  const last = Math.max(0, ...timeline.map((t) => t.atMs));
  const done = setTimeout(() => opts.onDone?.(), last / speed + 50);
  return () => {
    for (const t of timers) clearTimeout(t);
    clearTimeout(done);
  };
}

/** Deep-replaces a fixture id string everywhere in an event. Crude but fine for stubs. */
export function swapId<T>(event: T, from: string, to: string): T {
  if (from === to) return event;
  return JSON.parse(JSON.stringify(event).replaceAll(from, to)) as T;
}
