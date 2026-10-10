import type { TranscriptTurn } from "@onfloor/contracts";
import { hub } from "../hub";
import { PLAYBOOK } from "../playbook";
import { FAST_PATHS } from "../policies";

/**
 * The copilot brain. Called by the transcription layer; emits HUD events via `hub`.
 * Budget: a hint must land within ~2s of the customer finishing.
 *
 * What's here is the keyword fast path only (instant, no LLM).
 * TODO(tushar):
 *  - LLM hint on each customer final (services.llm.json, job "copilot"; last ~8 turns + PLAYBOOK)
 *  - LLM guardrail check on agent finals
 *  - sentiment (EMA-smoothed) on customer finals
 *  - talk_metrics on a 1s tick (dead_air > 6s, monologue > 30s or agentTalkPct > 70% over 2 min)
 *  - dedupe: max 1 hint per customer turn; skip near-duplicates of the last 3
 */

const firedGuardrails = new Map<string, Set<string>>();

export function onPartial(callId: string, speaker: TranscriptTurn["speaker"], text: string) {
  if (speaker !== "agent") return;
  const fired = firedGuardrails.get(callId) ?? new Set<string>();
  firedGuardrails.set(callId, fired);
  for (const rule of FAST_PATHS) {
    if (fired.has(rule.policyId) || !rule.pattern.test(text)) continue;
    fired.add(rule.policyId);
    hub.emit(callId, {
      type: "guardrail",
      alert: {
        id: `guard_${crypto.randomUUID().slice(0, 8)}`,
        severity: "critical",
        policyId: rule.policyId,
        message: rule.message,
        triggerTurnId: null,
      },
    });
  }
}

export function onFinal(callId: string, turn: TranscriptTurn) {
  if (turn.speaker === "agent") {
    onPartial(callId, "agent", turn.text);
    return;
  }
  const play = PLAYBOOK.find((p) => p.triggers.test(turn.text));
  if (play) {
    hub.emit(callId, {
      type: "hint",
      hint: {
        id: `hint_${crypto.randomUUID().slice(0, 8)}`,
        kind: play.kind,
        title: play.title,
        body: play.body,
        triggerTurnId: turn.id,
        ttlMs: 20_000,
      },
    });
  }
}

export function endCopilot(callId: string) {
  firedGuardrails.delete(callId);
}
