import type { Agent, SimClientMessage, SimServerMessage, SimSessionStart, StartSim } from "@onfloor/contracts";
import { SIM_CALL_ID, simCallTimeline } from "@onfloor/contracts/fixtures";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import { replayTimeline, swapId } from "../../core/timeline";
import { ENV } from "../../env.server";
import { getPersona } from "../personas";
import { getScenario, listScenarios } from "../scenarios";
import { scoreInBackground } from "../scoring";

/**
 * Pillar 1: the simulator engine.
 *
 * STUB (STUB_ENGINES=true): a connected socket gets the fixture call replayed in real
 * time, and the fixture turns are persisted, so transcript → scoring → scorecard works
 * end to end against the real DB.
 *
 * TODO(ashwath): the real engine: persona+scenario prompt compiler,
 *   <crm_request/> / <hang_up/> control tags, patience mechanic, dead-air nudges,
 *   barge-in, TTS per line.
 */

type Send = (msg: SimServerMessage) => void;

interface LiveSession {
  callId: string;
  agentId: string;
  startedAt: number;
  sockets: Set<Send>;
  cancel: (() => void) | null;
  finished: boolean;
}

const sessions = new Map<string, LiveSession>();

export async function startSim(agent: Agent, input: StartSim): Promise<SimSessionStart> {
  const scenario = await getScenario(input.scenarioId);
  const persona = await getPersona(input.personaId ?? scenario.defaultPersonaId);
  const call = await calls.create({
    kind: "sim",
    agentId: agent.id,
    language: input.language,
    customerLabel: persona.name,
    scenarioId: scenario.id,
    personaId: persona.id,
    replayOfCallId: input.replayOfCallId ?? null,
  });
  sessions.set(call.id, {
    callId: call.id,
    agentId: agent.id,
    startedAt: Date.now(),
    sockets: new Set(),
    cancel: null,
    finished: false,
  });

  // The browser opens ElevenLabs realtime STT itself. "" when voice isn't configured.
  let sttUrl = "";
  if (ENV.ELEVENLABS_API_KEY) {
    const token = await services.stt.mintRealtimeToken();
    sttUrl = services.stt.realtimeUrl({ language: input.language }, token);
  }
  return { callId: call.id, scenario, persona, sttUrl };
}

/** Replay a (live) call's extracted persona in the simulator. */
export async function replayCall(agent: Agent, sourceCallId: string): Promise<SimSessionStart> {
  const source = await calls.getOwned(sourceCallId, agent);
  if (!source.personaId) throw new AppError("BAD_REQUEST", { message: "No persona has been extracted from that call yet." });
  const persona = await getPersona(source.personaId);
  const scenarioId = source.scenarioId ?? (await listScenarios())[0]?.id;
  if (!scenarioId) throw new AppError("NOT_FOUND", { message: "No scenarios seeded." });
  return startSim(agent, {
    scenarioId,
    personaId: persona.id,
    language: persona.language,
    replayOfCallId: source.id,
  });
}

function broadcast(session: LiveSession, msg: SimServerMessage) {
  for (const send of session.sockets) send(msg);
}

export async function attachSocket(agent: Agent, callId: string, send: Send): Promise<() => void> {
  const call = await calls.getOwned(callId, agent);
  let session = sessions.get(callId);
  if (!session) {
    if (call.status !== "active") throw new AppError("BAD_REQUEST", { message: "That call has ended." });
    session = { callId, agentId: agent.id, startedAt: Date.now(), sockets: new Set(), cancel: null, finished: false };
    sessions.set(callId, session);
  }
  session.sockets.add(send);
  const s = session;

  if (ENV.STUB_ENGINES && !s.cancel) {
    s.startedAt = Date.now();
    s.cancel = replayTimeline(
      simCallTimeline,
      (msg) => {
        broadcast(s, msg);
        void persistStubEvent(s, msg);
      },
      { rewrite: (m) => swapId(m, SIM_CALL_ID, callId), speed: ENV.STUB_SPEED },
    );
  }
  return () => s.sockets.delete(send);
}

async function persistStubEvent(session: LiveSession, msg: SimServerMessage) {
  try {
    if (msg.type === "turn") {
      const { speaker, text, language, startMs, endMs } = msg.turn;
      await calls.appendTurn(session.callId, { speaker, text, language, startMs, endMs });
    } else if (msg.type === "crm_request") {
      await calls.recordCrmRequestVoiced(session.callId, msg.request.id, msg.atMs);
    } else if (msg.type === "ended") {
      await finishSim(session.callId);
    }
  } catch (err) {
    console.error("[sim stub] persist failed", err);
  }
}

export async function handleClientMessage(callId: string, msg: SimClientMessage) {
  const session = sessions.get(callId);
  if (!session || session.finished) return;
  switch (msg.type) {
    case "crm_action":
      await calls.recordCrmAction(callId, msg.action);
      return;
    case "agent_turn":
      if (ENV.STUB_ENGINES) return; // the fixture already contains the agent lines
      // TODO(ashwath): real engine: append turn, run persona reply, TTS, broadcast.
      await calls.appendTurn(callId, { speaker: "agent", text: msg.text, startMs: msg.startMs, endMs: msg.endMs });
      return;
    case "interrupt":
      // TODO(ashwath): stop synthesis/playback of the current persona line.
      return;
    case "end":
      await finishSim(callId);
      broadcast(session, { type: "ended", reason: "agent", callId });
      return;
  }
}

/** Idempotent. Ends the call, then scores it in the background. */
export async function finishSim(callId: string): Promise<{ callId: string; status: string }> {
  const session = sessions.get(callId);
  if (session?.finished) return { callId, status: "scoring" };
  if (session) {
    session.finished = true;
    session.cancel?.();
  }
  const turns = await calls.transcript(callId);
  const agentTurns = turns.filter((t) => t.speaker === "agent").length;
  // Fewer than 2 agent turns isn't enough conversation to judge fairly.
  if (agentTurns < 2) {
    await calls.end(callId, "abandoned");
    sessions.delete(callId);
    return { callId, status: "abandoned" };
  }
  await calls.end(callId, "scoring");
  sessions.delete(callId);
  scoreInBackground(callId);
  return { callId, status: "scoring" };
}
