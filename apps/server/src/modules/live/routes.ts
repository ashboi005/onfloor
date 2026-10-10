import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard, requireAgentWs } from "../../core/auth-guard";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { ENV } from "../../env.server";
import { decodeAudioFrame } from "./audio";
import { hub } from "./hub";
import { agentIdByEmail } from "./index";
import { readReplayUpload, startReplay } from "./replay";
import { attachBridge, detachBridge, finishLiveCall, getActiveLiveCall, isBridgeConnection,
  pushLiveAudio, sessionForBridge, simulateFixtureCall, startLiveCall } from "./session";

const unsubscribe = new WeakMap<object, () => void>();
const closedHudSockets = new WeakSet<object>();
const bridgeCalls = new WeakMap<object, string>();
const controlQueues = new WeakMap<object, Promise<void>>();
const queuedMessages = new WeakMap<object, number>();
const closedBridgeSockets = new WeakSet<object>();
const bridgeControlSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call_started"), protocolVersion: z.literal(1), telegramCallId: z.string().min(1).max(200),
    callId: z.string().optional(), customer: z.object({ id: z.string(), displayName: z.string().min(1).max(200), username: z.string().nullish() }) }),
  z.object({ type: z.literal("call_ended"), reason: z.string().max(200).optional() }),
]);
const errorEvent = (err: unknown) => ({ type: "error" as const,
  code: err instanceof AppError ? err.code : "BAD_REQUEST",
  message: err instanceof AppError ? err.message : "Invalid bridge message or audio frame.",
  retryable: err instanceof AppError ? err.retryable : false });

export const liveRoutes = new Elysia()
  .use(authGuard)
  .get("/api/live/active", async ({ agent }) => {
    const call = getActiveLiveCall();
    // Elysia treats a bare null as an empty response; clients require JSON null.
    return call && (agent.role === "manager" || call.agentId === agent.id) ? call : Response.json(null);
  }, { authed: true })
  .post("/api/live/dev/simulate", ({ agent }) => {
    if (!ENV.STUB_ENGINES && ENV.NODE_ENV === "production") throw new AppError("FORBIDDEN");
    return simulateFixtureCall(agent.id);
  }, { authed: true })
  .post("/api/live/calls/replay-file", async ({ agent, request }) => startReplay(agent.id, await readReplayUpload(request)),
    { authed: true, parse: "none" })
  .ws("/ws/live/:callId", {
    async open(ws) {
      try {
        const agent = await requireAgentWs(ws.data.headers);
        if (!agent) throw new AppError("UNAUTHORIZED");
        const key = ws.data.params.callId;
        if (key !== "active") await calls.getOwned(key, agent);
        const off = await hub.subscribe(key, agent, (event) => ws.send(JSON.stringify(event)));
        if (closedHudSockets.has(ws.raw)) off(); else unsubscribe.set(ws.raw, off);
      } catch (err) { ws.send(JSON.stringify(errorEvent(err))); ws.close(); }
    },
    close(ws) { closedHudSockets.add(ws.raw); unsubscribe.get(ws.raw)?.(); unsubscribe.delete(ws.raw); },
  })
  .ws("/internal/live/ingest", {
    beforeHandle({ headers, status }) {
      if (!ENV.BRIDGE_SECRET || headers["x-bridge-secret"] !== ENV.BRIDGE_SECRET) return status(401);
    },
    message(ws, raw) {
      const size = raw instanceof Uint8Array ? raw.byteLength : raw instanceof ArrayBuffer ? raw.byteLength : typeof raw === "string" ? raw.length : JSON.stringify(raw)?.length ?? 0;
      const limit = raw instanceof Uint8Array || raw instanceof ArrayBuffer ? 3205 : 4096;
      if (size > limit) { ws.send(JSON.stringify(errorEvent(new AppError("BAD_REQUEST", { message: "Bridge message exceeds its size limit." })))); return; }
      const pending = queuedMessages.get(ws.raw) ?? 0;
      if (pending >= 64) {
        ws.send(JSON.stringify({ type: "error", code: "INGEST_QUEUE_OVERFLOW", message: "Ingest queue exceeded its bound; reconnect and retain local audio.", retryable: true }));
        closedBridgeSockets.add(ws.raw); ws.close(1013); return;
      }
      queuedMessages.set(ws.raw, pending + 1);
      // Elysia may deliver JSON already parsed, while PCM is always binary.
      const queue = (controlQueues.get(ws.raw) ?? Promise.resolve()).then(async () => {
        if (closedBridgeSockets.has(ws.raw)) return;
        if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
          const callId = bridgeCalls.get(ws.raw);
          if (!callId || !isBridgeConnection(callId, ws.raw)) throw new AppError("BAD_REQUEST", { message: "Start/resume and acknowledge a call before sending audio." });
          const { channel, offset, pcm } = decodeAudioFrame(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
          pushLiveAudio(callId, channel === 0 ? "agent" : "customer", offset, pcm);
          return;
        }
        let value: unknown;
        try { value = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { throw new AppError("BAD_REQUEST", { message: "Invalid control JSON." }); }
        const result = bridgeControlSchema.safeParse(value);
        if (!result.success) throw new AppError("BAD_REQUEST", { message: "Invalid bridge control message (protocolVersion must be 1)." });
        const msg = result.data;
        if (msg.type === "call_started") {
          let call = sessionForBridge(msg.telegramCallId, msg.callId);
          if (!call) {
            const agentId = await agentIdByEmail(ENV.LIVE_AGENT_EMAIL);
            if (!agentId) throw new AppError("BAD_REQUEST", { message: "LIVE_AGENT_EMAIL must identify a seeded OnFloor agent." });
            call = await startLiveCall({ agentId, customerLabel: msg.customer.displayName, externalCustomerId: msg.customer.id, telegramCallId: msg.telegramCallId });
          }
          attachBridge(call.id, ws.raw); bridgeCalls.set(ws.raw, call.id);
          if (closedBridgeSockets.has(ws.raw)) { detachBridge(call.id, ws.raw); return; }
          ws.send(JSON.stringify({ type: "ack", protocolVersion: 1, callId: call.id }));
        } else {
          const callId = bridgeCalls.get(ws.raw);
          if (!callId || !isBridgeConnection(callId, ws.raw)) throw new AppError("BAD_REQUEST", { message: "No active call on this connection." });
          // Acknowledge promptly; scoring/persona run independently of the socket lifetime.
          const finishing = finishLiveCall(callId);
          bridgeCalls.delete(ws.raw);
          ws.send(JSON.stringify({ type: "ended", callId }));
          void finishing.catch(() => console.error("[live] bridge finalization failed", callId));
        }
      }).catch((err) => { if (!closedBridgeSockets.has(ws.raw)) ws.send(JSON.stringify(errorEvent(err))); })
        .finally(() => queuedMessages.set(ws.raw, Math.max(0, (queuedMessages.get(ws.raw) ?? 1) - 1)));
      controlQueues.set(ws.raw, queue);
    },
    close(ws) {
      closedBridgeSockets.add(ws.raw);
      const callId = bridgeCalls.get(ws.raw);
      if (callId) detachBridge(callId, ws.raw);
      bridgeCalls.delete(ws.raw); controlQueues.delete(ws.raw); queuedMessages.delete(ws.raw);
    },
  });
