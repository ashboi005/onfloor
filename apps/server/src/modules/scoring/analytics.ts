import {
  addMonths,
  type CallbackSlot,
  type CampaignDraft,
  type CrmAuditRow,
  type CrmRequest,
  type Disposition,
  DISPOSITION_TEMPLATE,
  type EmailTemplateId,
  MAX_GROW,
  type Merchant,
  resolveRequest,
  type Scorecard,
  type TranscriptTurn,
  type WorkspaceLogEntry,
} from "@onfloor/contracts";

/**
 * Everything countable about a call, computed (never asked of the LLM), so it is
 * checkable and identical every time.
 */

const DEAD_AIR_MS = 5000;
/** Overlap below this is crosstalk jitter (and sim persona end times are estimates). */
const INTERRUPT_OVERLAP_MS = 400;

export function computeStats(turns: TranscriptTurn[], durationMs: number | null): Scorecard["stats"] {
  const sorted = [...turns].sort((a, b) => a.startMs - b.startMs);
  const dur = (t: TranscriptTurn) => Math.max(0, t.endMs - t.startMs);
  const agent = sorted.filter((t) => t.speaker === "agent");
  const agentMs = agent.reduce((s, t) => s + dur(t), 0);
  const totalMs = sorted.reduce((s, t) => s + dur(t), 0);

  let interruptions = 0;
  let deadAirCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.speaker === "agent" && prev.speaker === "customer" && prev.endMs - cur.startMs > INTERRUPT_OVERLAP_MS) interruptions++;
    if (cur.startMs - prev.endMs > DEAD_AIR_MS) deadAirCount++;
  }

  // Longest stretch of consecutive agent speech.
  let longestMonologueMs = 0;
  let runStart: number | null = null;
  let runEnd = 0;
  for (const t of sorted) {
    if (t.speaker === "agent") {
      runStart ??= t.startMs;
      runEnd = t.endMs;
      longestMonologueMs = Math.max(longestMonologueMs, runEnd - runStart);
    } else {
      runStart = null;
    }
  }

  const words = agent.reduce((s, t) => s + t.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    durationMs: durationMs ?? sorted.at(-1)?.endMs ?? 0,
    agentTalkPct: totalMs ? Math.round((agentMs / totalMs) * 100) : 0,
    interruptions,
    deadAirCount,
    longestMonologueMs,
    wpm: agentMs ? Math.round(words / (agentMs / 60_000)) : 0,
  };
}

export interface WorkspaceLog {
  actions: WorkspaceLogEntry[];
  voiced: { requestId: string; atMs: number }[];
}

export interface WorkspaceAuditInput {
  merchant: Merchant;
  requests: CrmRequest[];
  callDate: string;
  dispositionSec: number;
  log: WorkspaceLog;
}

export interface WorkspaceAudit {
  rows: CrmAuditRow[];
  wrapUp: NonNullable<Scorecard["wrapUp"]>;
  /** The successful Ad Studio launch the audit judged (the last one). */
  campaign: CampaignDraft | null;
  failedLaunches: string[];
  lateDisposition: boolean;
}

const row = (requestId: string, field: string, expected: unknown, actual: unknown, correct: boolean, latencyMs: number | null = null): CrmAuditRow => ({
  requestId,
  field,
  expected,
  actual,
  correct,
  latencyMs,
});

/**
 * Replays a sim call's workspace log against what should have happened: the customer's identity
 * and data (merchant), what they asked for (voiced requests) and what they decided (persona decision).
 * Every row is a checkable fact; nothing here is judged by the LLM.
 */
export function workspaceAudit({ merchant, requests, callDate, dispositionSec, log }: WorkspaceAuditInput): WorkspaceAudit {
  const rows: CrmAuditRow[] = [];
  const of = (kind: string) => log.actions.filter((a) => a.actor === "agent" && a.kind === kind);
  const voiced = (kind: CrmRequest["kind"]) => {
    const r = requests.find((q) => q.kind === kind && log.voiced.some((v) => v.requestId === q.id));
    return r ? { request: r, at: log.voiced.find((v) => v.requestId === r.id)!.atMs, value: resolveRequest(r, callDate) } : null;
  };
  const decision = (log.actions.find((a) => a.actor === "persona" && a.kind === "decision")?.body.value as Disposition | undefined) ?? null;

  // Merchant Dashboard: the decision maker's account looked up with the ticket's UID.
  const lookups = of("dashboard_lookup");
  const hit = lookups.find((a) => a.body.matchesTicket === true);
  if (merchant.answerer.isDecisionMaker || lookups.length) {
    rows.push(row("lookup", "Merchant Dashboard · UID looked up", merchant.uid, hit ? merchant.uid : (lookups.at(-1)?.body.uid ?? "not looked up"), !!hit, hit?.atMs ?? null));
  }

  // Ad Studio: judged on the last successful launch.
  const launches = of("campaign_launch");
  const okLaunch = launches.filter((a) => a.body.ok === true).at(-1);
  const campaign = (okLaunch?.body.campaign as CampaignDraft | undefined) ?? null;
  const failedLaunches = launches.filter((a) => a.body.ok !== true).map((a) => String(a.body.error ?? "rejected"));
  if (decision === "accepted" && !campaign) rows.push(row("campaign_launched", "Ad Studio · campaign launched", "launched", "not launched", false));
  if (campaign && decision && decision !== "accepted") {
    rows.push(row("campaign_unwanted", "Ad Studio · campaign only if they agreed", `no campaign (customer: ${decision})`, "launched", false));
  }
  if (campaign) {
    const email = voiced("email_update");
    const start = voiced("start_date");
    const months = voiced("duration");
    const expectedEmail = email?.value.email ?? merchant.email.toLowerCase();
    const expectedStart = start?.value.date ?? callDate;
    rows.push(row("campaign_uid", "Ad Studio · UID", merchant.uid, campaign.uid, campaign.uid === merchant.uid));
    rows.push(
      row(
        email?.request.id ?? "campaign_email",
        email ? "Ad Studio · email (updated on the call)" : "Ad Studio · email",
        expectedEmail,
        campaign.email,
        campaign.email.toLowerCase() === expectedEmail,
        email && okLaunch ? Math.max(0, okLaunch.atMs - email.at) : null,
      ),
    );
    rows.push(row("campaign_type", "Ad Studio · campaign", "max_grow", campaign.campaignType, campaign.campaignType === "max_grow"));
    rows.push(row(start?.request.id ?? "campaign_start", start ? "Ad Studio · start date (asked on the call)" : "Ad Studio · start date", expectedStart, campaign.startDate, campaign.startDate === expectedStart));
    if (months) {
      const end = addMonths(campaign.startDate, months.value.months!);
      rows.push(row(months.request.id, `Ad Studio · end date (${months.value.months} months, asked on the call)`, end, campaign.endDate, campaign.endDate === end));
    } else {
      const min = addMonths(campaign.startDate, MAX_GROW.minDurationMonths);
      rows.push(row("campaign_end", "Ad Studio · end date (min 1 month)", `≥ ${min}`, campaign.endDate, campaign.endDate >= min));
    }
  }

  // Nugget: email template + disposition, within the window.
  const dispose = of("dispose").at(-1);
  const outcome = (dispose?.body.outcome as Disposition | undefined) ?? null;
  const callback = (dispose?.body.callback as CallbackSlot | null | undefined) ?? null;
  const secondsTaken = typeof dispose?.body.secondsTaken === "number" ? dispose.body.secondsTaken : null;
  const withinLimit = secondsTaken !== null && secondsTaken <= dispositionSec;
  const emailTemplate = (of("email_sent").at(-1)?.body.template as EmailTemplateId | undefined) ?? null;

  if (decision) rows.push(row("disposition_outcome", "Nugget · disposition", decision, outcome ?? "not disposed", outcome === decision));
  const expectedTemplate = DISPOSITION_TEMPLATE[decision ?? outcome ?? "not_interested"];
  rows.push(row("email_template", "Nugget · email template", expectedTemplate, emailTemplate ?? "none sent", emailTemplate === expectedTemplate));
  if (decision === "callback" || outcome === "callback") {
    const asked = voiced("callback");
    const want = asked ? `${asked.value.date} ${asked.value.time}` : "any slot";
    const got = callback ? `${callback.date} ${callback.time}` : "none";
    rows.push(row(asked?.request.id ?? "callback_slot", asked ? "Nugget · callback slot (asked on the call)" : "Nugget · callback slot", want, got, asked ? got === want : !!callback));
  }
  rows.push(row("disposition_time", `Nugget · disposed within ${dispositionSec}s`, `≤ ${dispositionSec}s`, secondsTaken === null ? "not disposed" : `${secondsTaken}s`, withinLimit, secondsTaken === null ? null : secondsTaken * 1000));

  return {
    rows,
    campaign,
    failedLaunches,
    lateDisposition: !withinLimit,
    wrapUp: { outcome, emailTemplate, callback, secondsTaken, withinLimit, customerDecision: decision },
  };
}

/** Share of checks done right. null when there was nothing to check. */
export function toolAccuracyScore(rows: CrmAuditRow[]): number | null {
  if (!rows.length) return null;
  return Math.round((100 * rows.filter((r) => r.correct).length) / rows.length);
}
