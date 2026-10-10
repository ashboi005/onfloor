import { simClientMessageSchema, startSimSchema } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard, requireAgentWs } from "../../core/auth-guard";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { attachSocket, finishSim, handleClientMessage, startSim } from "./engine";

const detach = new WeakMap<object, () => void>();

export const simRoutes = new Elysia()
  .use(authGuard)
  .post("/api/sim/sessions", ({ agent, body }) => startSim(agent, body), { authed: true, body: startSimSchema })
  .post(
    "/api/sim/sessions/:callId/end",
    async ({ agent, params }) => {
      await calls.getOwned(params.callId, agent);
      return finishSim(params.callId);
    },
    { authed: true, params: z.object({ callId: z.string() }) },
  )
  .ws("/ws/sim/:callId", {
    async open(ws) {
      const agent = await requireAgentWs(ws.data.headers);
      if (!agent) {
        ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Sign in first.", retryable: false }));
        ws.close();
        return;
      }
      try {
        const off = await attachSocket(agent, ws.data.params.callId, (msg) => ws.send(JSON.stringify(msg)));
        detach.set(ws.raw, off);
      } catch (err) {
        const e = err instanceof AppError ? err : new AppError("BAD_REQUEST");
        ws.send(JSON.stringify({ type: "error", code: e.code, message: e.message, retryable: e.retryable }));
        ws.close();
      }
    },
    async message(ws, raw) {
      const parsed = simClientMessageSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
      if (!parsed.success) {
        ws.send(JSON.stringify({ type: "error", code: "BAD_REQUEST", message: parsed.error.message, retryable: false }));
        return;
      }
      await handleClientMessage(ws.data.params.callId, parsed.data);
    },
    close(ws) {
      detach.get(ws.raw)?.();
    },
  });
