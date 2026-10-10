import type { LiveEvent } from "@onfloor/contracts";
import { liveEvents } from "@onfloor/db/schema";
import { db } from "../../services";

/**
 * Fan-out of HUD events. Everything the HUD sees goes through `emit()`, which also
 * appends to `live_events` so a finished call can be re-shown.
 *
 * Subscribers attach to a callId or to "active" (whichever live call is current; the
 * demo has one at a time). Late joiners get the backlog of the call so far.
 */
type Send = (event: LiveEvent) => void;

const subscribers = new Map<string, Set<Send>>();
const backlog = new Map<string, LiveEvent[]>();
const startedAt = new Map<string, number>();
let activeCallId: string | null = null;

export const hub = {
  get activeCallId() {
    return activeCallId;
  },

  /** Ms since the call started on this server; use for event `atMs`. */
  elapsed(callId: string): number {
    return Date.now() - (startedAt.get(callId) ?? Date.now());
  },

  begin(callId: string) {
    activeCallId = callId;
    startedAt.set(callId, Date.now());
    backlog.set(callId, []);
  },

  emit(callId: string, event: LiveEvent) {
    backlog.get(callId)?.push(event);
    for (const key of [callId, ...(callId === activeCallId ? ["active"] : [])]) {
      for (const send of subscribers.get(key) ?? []) send(event);
    }
    db.insert(liveEvents)
      .values({ callId, atMs: hub.elapsed(callId), type: event.type, body: event })
      .catch((err) => console.error("[live] persist event failed", err));
  },

  /** Ends "active" but keeps the backlog briefly so the HUD can show the wrap-up. */
  finish(callId: string) {
    if (activeCallId === callId) activeCallId = null;
    setTimeout(() => {
      backlog.delete(callId);
      startedAt.delete(callId);
    }, 10 * 60_000);
  },

  subscribe(key: string, send: Send): () => void {
    const set = subscribers.get(key) ?? new Set<Send>();
    set.add(send);
    subscribers.set(key, set);
    const target = key === "active" ? activeCallId : key;
    for (const event of (target && backlog.get(target)) || []) send(event);
    return () => set.delete(send);
  },
};
