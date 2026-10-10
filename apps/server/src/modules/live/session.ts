import type { Language, LiveEvent } from "@onfloor/contracts";
import { LIVE_CALL_ID, liveCallTimeline, suresh } from "@onfloor/contracts/fixtures";
import { calls } from "../../core/calls";
import { replayTimeline, swapId } from "../../core/timeline";
import { ENV } from "../../env.server";
import { createPersona } from "../personas";
import { scoreCall } from "../scoring";
import { endCopilot } from "./copilot";
import { extractPersona } from "./extract-persona";
import { hub } from "./hub";

/**
 * Live call lifecycle: start → (transcribe + copilot) → finish → score → persona.
 * The bridge ingest (routes.ts) and the dev simulator both drive these.
 */

export async function startLiveCall(input: {
  agentId: string;
  customerLabel: string;
  externalCustomerId?: string | null;
  language?: Language;
}) {
  const call = await calls.create({
    kind: "live",
    agentId: input.agentId,
    language: input.language ?? ENV.LIVE_DEFAULT_LANGUAGE,
    customerLabel: input.customerLabel,
    externalCustomerId: input.externalCustomerId ?? null,
  });
  hub.begin(call.id);
  hub.emit(call.id, { type: "call_started", call });
  return call;
}

/** Hang-up pipeline. Each step emits its HUD event as it completes. */
export async function finishLiveCall(callId: string) {
  endCopilot(callId);
  const ended = await calls.end(callId, "scoring");
  hub.emit(callId, { type: "call_ended", callId, durationMs: ended.durationMs ?? 0 });

  try {
    await scoreCall(callId);
    hub.emit(callId, { type: "scorecard_ready", callId });
  } catch (err) {
    console.error("[live] scoring failed", err);
    hub.emit(callId, { type: "error", code: "SCORING_FAILED", message: "Scoring failed.", retryable: true });
  }

  try {
    const persona = ENV.STUB_ENGINES
      ? await createPersona({ ...swapId(suresh, LIVE_CALL_ID, callId), source: "live_call", sourceCallId: callId })
      : await extractPersona(callId);
    await calls.setPersona(callId, persona.id);
    hub.emit(callId, { type: "persona_ready", personaId: persona.id, callId });
  } catch (err) {
    console.error("[live] persona extraction failed", err);
    hub.emit(callId, { type: "error", code: "PERSONA_FAILED", message: "Persona extraction failed.", retryable: true });
  }
  hub.finish(callId);
}

/**
 * Dev/demo: plays the fixture live call through the REAL hub/DB/scoring path, as if
 * it came from Telegram. Lets the HUD integrate before the bridge exists.
 */
export async function simulateFixtureCall(agentId: string) {
  const call = await startLiveCall({ agentId, customerLabel: "Suresh Patil", language: "hinglish" });
  const passthrough = new Set<LiveEvent["type"]>([
    "transcript_partial",
    "hint",
    "guardrail",
    "sentiment",
    "talk_metrics",
  ]);
  replayTimeline(
    liveCallTimeline,
    async (event) => {
      if (event.type === "transcript_final") {
        const { speaker, text, language, startMs, endMs } = event.turn;
        const turn = await calls.appendTurn(call.id, { speaker, text, language, startMs, endMs });
        hub.emit(call.id, { type: "transcript_final", turn });
      } else if (event.type === "call_ended") {
        await finishLiveCall(call.id);
      } else if (passthrough.has(event.type)) {
        hub.emit(call.id, event);
      }
      // call_started / scorecard_ready / persona_ready come from the real pipeline instead.
    },
    { rewrite: (e) => swapId(e, LIVE_CALL_ID, call.id), speed: ENV.STUB_SPEED },
  );
  return { callId: call.id };
}
