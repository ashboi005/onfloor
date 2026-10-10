import type { Call, CallKind, CallStatus, CallWithTranscript, CrmAction, Language, TranscriptTurn } from "@onfloor/contracts";
import { calls as callsTable, crmActions, crmRequestsVoiced, transcriptTurns } from "@onfloor/db/schema";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { db } from "../services";
import { AppError } from "./errors";

/**
 * The shared calls repository. Used by sim (Ashwath), live (Tushar) and scoring.
 * All call/transcript SQL lives here.
 */

type CallRow = typeof callsTable.$inferSelect;
type TurnRow = typeof transcriptTurns.$inferSelect;

export function toCall(r: CallRow): Call {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    agentId: r.agentId,
    scenarioId: r.scenarioId,
    personaId: r.personaId,
    replayOfCallId: r.replayOfCallId,
    language: r.language,
    customerLabel: r.customerLabel,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    recordingUrl: r.recordingUrl,
    overallScore: r.overallScore,
  };
}

export function toTurn(r: TurnRow): TranscriptTurn {
  return {
    id: r.id,
    callId: r.callId,
    seq: r.seq,
    speaker: r.speaker,
    text: r.text,
    ...(r.language && { language: r.language }),
    startMs: r.startMs,
    endMs: r.endMs,
    ...(r.translation !== null && { translation: r.translation }),
  };
}

export interface CreateCallInput {
  kind: CallKind;
  agentId: string;
  language: Language;
  customerLabel: string;
  scenarioId?: string | null;
  personaId?: string | null;
  replayOfCallId?: string | null;
  externalCustomerId?: string | null;
}

export const calls = {
  async create(input: CreateCallInput): Promise<Call> {
    const [row] = await db.insert(callsTable).values(input).returning();
    return toCall(row!);
  },

  async get(id: string): Promise<Call> {
    const [row] = await db.select().from(callsTable).where(eq(callsTable.id, id));
    if (!row) throw new AppError("NOT_FOUND", { message: "No such call." });
    return toCall(row);
  },

  /** Throws FORBIDDEN unless the call is the agent's own (managers see everything). */
  async getOwned(id: string, agent: { id: string; role: string }): Promise<Call> {
    const call = await calls.get(id);
    if (agent.role !== "manager" && call.agentId !== agent.id) throw new AppError("FORBIDDEN");
    return call;
  },

  async getWithTranscript(id: string): Promise<CallWithTranscript> {
    const call = await calls.get(id);
    return { ...call, transcript: await calls.transcript(id) };
  },

  async list(agent: { id: string; role: string }, kind?: CallKind): Promise<Call[]> {
    const conds = [
      ...(agent.role === "manager" ? [] : [eq(callsTable.agentId, agent.id)]),
      ...(kind ? [eq(callsTable.kind, kind)] : []),
    ];
    const rows = await db
      .select()
      .from(callsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(callsTable.startedAt))
      .limit(100);
    return rows.map(toCall);
  },

  /** The most recent active live call, for the HUD's auto-attach. */
  async activeLive(): Promise<Call | null> {
    const [row] = await db
      .select()
      .from(callsTable)
      .where(and(eq(callsTable.kind, "live"), eq(callsTable.status, "active")))
      .orderBy(desc(callsTable.startedAt))
      .limit(1);
    return row ? toCall(row) : null;
  },

  async transcript(callId: string): Promise<TranscriptTurn[]> {
    const rows = await db
      .select()
      .from(transcriptTurns)
      .where(eq(transcriptTurns.callId, callId))
      .orderBy(asc(transcriptTurns.seq));
    return rows.map(toTurn);
  },

  /**
   * Appends with the next seq. English turns get their own text as the translation right away;
   * Hindi/Hinglish turns are translated in the background (modules/translation).
   */
  async appendTurn(callId: string, turn: Omit<TranscriptTurn, "id" | "callId" | "seq">): Promise<TranscriptTurn> {
    const [agg] = await db
      .select({ seq: max(transcriptTurns.seq) })
      .from(transcriptTurns)
      .where(eq(transcriptTurns.callId, callId));
    const [row] = await db
      .insert(transcriptTurns)
      .values({
        ...turn,
        callId,
        seq: (agg?.seq ?? 0) + 1,
        translation: turn.translation ?? (turn.language === "en" ? turn.text : null),
      })
      .returning();
    return toTurn(row!);
  },

  /** Corrects a turn's end once the real value is known (sim persona playback finished / was cut off). */
  async setTurnTranslation(turnId: string, translation: string) {
    await db.update(transcriptTurns).set({ translation }).where(eq(transcriptTurns.id, turnId));
  },

  async setTurnEnd(turnId: string, endMs: number) {
    await db.update(transcriptTurns).set({ endMs }).where(eq(transcriptTurns.id, turnId));
  },

  /** Live calls: the Telegram user id, the key for that customer's memory. */
  async externalCustomerId(callId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: callsTable.externalCustomerId })
      .from(callsTable)
      .where(eq(callsTable.id, callId));
    return row?.id ?? null;
  },

  async end(callId: string, status: CallStatus = "scoring"): Promise<Call> {
    const call = await calls.get(callId);
    const endedAt = new Date();
    const [row] = await db
      .update(callsTable)
      .set({ status, endedAt, durationMs: endedAt.getTime() - new Date(call.startedAt).getTime() })
      .where(eq(callsTable.id, callId))
      .returning();
    return toCall(row!);
  },

  async setStatus(callId: string, status: CallStatus, overallScore?: number) {
    await db
      .update(callsTable)
      .set({ status, ...(overallScore !== undefined && { overallScore }) })
      .where(eq(callsTable.id, callId));
  },

  async setPersona(callId: string, personaId: string) {
    await db.update(callsTable).set({ personaId }).where(eq(callsTable.id, callId));
  },

  async setRecording(callId: string, recordingUrl: string) {
    await db.update(callsTable).set({ recordingUrl }).where(eq(callsTable.id, callId));
  },

  // --- Sim CRM tracking --------------------------------------------------------

  async recordCrmAction(callId: string, action: CrmAction) {
    await db.insert(crmActions).values({ callId, ...action });
  },

  async recordCrmRequestVoiced(callId: string, requestId: string, atMs: number) {
    await db.insert(crmRequestsVoiced).values({ callId, requestId, atMs });
  },

  async crmLog(callId: string) {
    const [actions, voiced] = await Promise.all([
      db.select().from(crmActions).where(eq(crmActions.callId, callId)).orderBy(asc(crmActions.atMs)),
      db.select().from(crmRequestsVoiced).where(eq(crmRequestsVoiced.callId, callId)),
    ]);
    return { actions, voiced };
  },
};
