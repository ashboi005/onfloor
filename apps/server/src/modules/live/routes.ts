import { user } from "@onfloor/db/schema";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard, requireAgentWs } from "../../core/auth-guard";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { ENV } from "../../env.server";
import { db } from "../../services";
import { hub } from "./hub";
import { finishLiveCall, simulateFixtureCall, startLiveCall } from "./session";

/**
 * Pillar 2 routes (owner: Tushar).
 *   GET  /api/live/active               → Call | null
 *   WS   /ws/live/:callId | /ws/live/active  → LiveEvent stream (contracts ws-live.ts)
 *   POST /api/live/calls/replay-file    → demo fallback (stubbed to the fixture call for now)
 *   POST /api/live/dev/simulate         → plays the fixture call through the real pipeline
 *   WS   /internal/live/ingest          → the Python bridge (x-bridge-secret)
 */

async function agentIdByEmail(email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row?.id ?? null;
}

const unsubscribe = new WeakMap<object, () => void>();

const bridgeControlSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("call_started"),
    telegramCallId: z.string(),
    customer: z.object({ id: z.string(), displayName: z.string(), username: z.string().nullish() }),
    /** Which OnFloor agent is on this line. Defaults to LIVE_AGENT_EMAIL's user. */
    agentId: z.string().optional(),
  }),
  z.object({ type: z.literal("call_ended"), reason: z.string().optional() }),
]);

/** The bridge's current call, keyed by the raw socket. */
const bridgeCalls = new WeakMap<object, string>();

export const liveRoutes = new Elysia()
  .use(authGuard)
  .get("/api/live/active", async () => (hub.activeCallId ? calls.get(hub.activeCallId) : null), { authed: true })

  .post(
    "/api/live/dev/simulate",
    ({ agent }) => {
      if (!ENV.STUB_ENGINES && ENV.NODE_ENV === "production") throw new AppError("FORBIDDEN");
      return simulateFixtureCall(agent.id);
    },
    { authed: true },
  )

  .post(
    "/api/live/calls/replay-file",
    ({ agent }) => {
      // TODO(tushar): accept a stereo WAV (L=agent, R=customer), stream it in real time
      // through the same ingest → transcribe → copilot path. Until then: the fixture call.
      if (!ENV.STUB_ENGINES) throw new AppError("NOT_IMPLEMENTED");
      return simulateFixtureCall(agent.id);
    },
    { authed: true },
  )

  .ws("/ws/live/:callId", {
    async open(ws) {
      const agent = await requireAgentWs(ws.data.headers);
      if (!agent) {
        ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Sign in first.", retryable: false }));
        ws.close();
        return;
      }
      const off = hub.subscribe(ws.data.params.callId, (event) => ws.send(JSON.stringify(event)));
      unsubscribe.set(ws.raw, off);
    },
    close(ws) {
      unsubscribe.get(ws.raw)?.();
    },
  })

  .ws("/internal/live/ingest", {
    beforeHandle({ headers, status }) {
      if (!ENV.BRIDGE_SECRET || headers["x-bridge-secret"] !== ENV.BRIDGE_SECRET) return status(401);
    },
    async message(ws, raw) {
      // Binary = audio: 1-byte channel (0 agent, 1 customer) + PCM16LE 16 kHz mono.
      if (raw instanceof Uint8Array || raw instanceof ArrayBuffer || Buffer.isBuffer(raw)) {
        // TODO(tushar): route to the per-channel ChannelStream (transcribe.ts) for bridgeCalls.get(ws.raw).
        return;
      }
      const parsed = bridgeControlSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.type === "call_started") {
        const agentId = msg.agentId ?? (await agentIdByEmail(ENV.LIVE_AGENT_EMAIL));
        if (!agentId) {
          ws.send(JSON.stringify({ type: "error", message: `No user with email ${ENV.LIVE_AGENT_EMAIL}` }));
          return;
        }
        const call = await startLiveCall({
          agentId,
          customerLabel: msg.customer.displayName,
          externalCustomerId: msg.customer.id,
        });
        bridgeCalls.set(ws.raw, call.id);
        ws.send(JSON.stringify({ type: "ack", callId: call.id }));
      } else {
        const callId = bridgeCalls.get(ws.raw);
        if (callId) await finishLiveCall(callId);
        bridgeCalls.delete(ws.raw);
      }
    },
  });
