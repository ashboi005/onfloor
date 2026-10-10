import { liveEventSchema, type Agent, type Call, type LiveEvent } from "@onfloor/contracts";
import { appendEvent, readEvents } from "./index";

/**
 * Fan-out of HUD events. Everything the HUD sees goes through `emit()`, which also
 * appends to `live_events` so a finished call can be re-shown.
 *
 * Subscribers attach to a callId or to "active" (whichever live call is current; the
 * demo has one at a time). Late joiners get the backlog of the call so far.
 */
type Send = (event: LiveEvent) => void;

type Subscription = { send: Send; agent: Agent };
const subscribers = new Map<string, Set<Subscription>>();
const backlog = new Map<string, LiveEvent[]>();
const startedAt = new Map<string, number>();
const owners = new Map<string, string>();
const writes = new Map<string, Promise<void>>();
const persistenceErrors = new Map<string, Error>();
let activeCallId: string | null = null;

export const hub = {
  get activeCallId() {
    return activeCallId;
  },

  /** Ms since the call started on this server; use for event `atMs`. */
  elapsed(callId: string): number {
    return Math.max(0, Math.round(performance.now() - (startedAt.get(callId) ?? performance.now())));
  },

  begin(call: Call) {
    activeCallId = call.id;
    startedAt.set(call.id, performance.now());
    owners.set(call.id, call.agentId);
    backlog.set(call.id, []);
  },

  emit(callId: string, event: LiveEvent) {
    const parsed = liveEventSchema.safeParse(event);
    if (!parsed.success) {
      console.error("[live] dropped invalid event", callId, parsed.error.issues);
      return;
    }
    backlog.get(callId)?.push(event);
    for (const key of [callId, ...(callId === activeCallId ? ["active"] : [])]) {
      for (const sub of subscribers.get(key) ?? []) {
        if (sub.agent.role !== "manager" && sub.agent.id !== owners.get(callId)) continue;
        try { sub.send(event); } catch { subscribers.get(key)?.delete(sub); }
      }
    }
    const atMs = hub.elapsed(callId);
    const write = (writes.get(callId) ?? Promise.resolve()).then(async () => {
      try { await appendEvent(callId, atMs, event); }
      catch {
        // Retry once, preserving order. A final failure remains visible to finalization.
        try { await appendEvent(callId, atMs, event); }
        catch { persistenceErrors.set(callId, new Error("Live event persistence failed.")); console.error("[live] event persistence failed", callId, event.type); }
      }
    });
    writes.set(callId, write);
  },

  async drain(callId: string) {
    await writes.get(callId);
    const error = persistenceErrors.get(callId);
    if (error) throw error;
  },

  /** Ends "active" but keeps the backlog briefly so the HUD can show the wrap-up. */
  finish(callId: string) {
    if (activeCallId === callId) activeCallId = null;
    subscribers.delete(callId);
    setTimeout(() => {
      backlog.delete(callId);
      startedAt.delete(callId);
      owners.delete(callId); writes.delete(callId); persistenceErrors.delete(callId);
    }, 10 * 60_000).unref();
  },

  async subscribe(key: string, agent: Agent, send: Send): Promise<() => void> {
    const target = key === "active" ? activeCallId : key;
    // Running/finalizing calls always have an in-memory log. Only historical calls
    // need a DB read, and those have no live producer after a process restart.
    const history = target ? (backlog.get(target) ?? await readEvents(target)) : [];
    const allowed = !target || !owners.has(target) || agent.role === "manager" || owners.get(target) === agent.id;
    if (!allowed && key !== "active") return () => {};
    if (allowed) for (const event of history) send(liveEventSchema.parse(event));
    const set = subscribers.get(key) ?? new Set<Subscription>();
    const sub = { send, agent };
    set.add(sub); subscribers.set(key, set);
    return () => { set.delete(sub); if (!set.size) subscribers.delete(key); };
  },
};
