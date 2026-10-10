import { CALL_KINDS } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
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
  /** 404 while scoring: the client polls. */
  .get(
    "/:id/scorecard",
    async ({ agent, params }) => {
      await calls.getOwned(params.id, agent);
      const card = await getScorecard(params.id);
      if (!card) throw new AppError("NOT_FOUND", { message: "Still scoring." });
      return card;
    },
    { authed: true, params: idParam },
  )
  /** Replays a live call's extracted persona in the simulator. */
  .post("/:id/replay", ({ agent, params }) => replayCall(agent, params.id), { authed: true, params: idParam });
