import { CALL_KINDS } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { calls } from "../../core/calls";
import { getScorecard } from "../scoring";
import { replayCall } from "../sim/engine";

const idParam = z.object({ id: z.string() });

export const callRoutes = new Elysia({ prefix: "/api/calls" })
  .use(authGuard)
  .get("/", ({ agent, query }) => calls.list(agent, query.kind), {
    authed: true,
    query: z.object({ kind: z.enum(CALL_KINDS).optional() }),
  })
  .get(
    "/:id",
    async ({ agent, params }) => {
      await calls.getOwned(params.id, agent);
      return calls.getWithTranscript(params.id);
    },
    { authed: true, params: idParam },
  )
  /** 202 `{ status }` while there's no scorecard yet (scoring / abandoned / failed): the client polls. */
  .get(
    "/:id/scorecard",
    async ({ agent, params, status }) => {
      const call = await calls.getOwned(params.id, agent);
      const card = await getScorecard(params.id);
      if (!card) return status(202, { status: call.status });
      return card;
    },
    { authed: true, params: idParam },
  )
  /** Replays a live call's extracted persona in the simulator. */
  .post("/:id/replay", ({ agent, params }) => replayCall(agent, params.id), { authed: true, params: idParam });
