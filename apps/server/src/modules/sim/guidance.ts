import {
  type Campaign,
  type CrmRequest,
  DISPOSITION_TEMPLATE,
  DISPOSITIONS,
  type Disposition,
  type DispositionSuggestion,
  GUIDANCE_STEPS,
  type GuidanceState,
  type GuidanceStepId,
  type GuidanceTip,
  MAX_GROW,
  type Merchant,
  resolveRequest,
  type Scenario,
  spokenDate,
  spokenTime,
  type TranscriptTurn,
  addMonths,
} from "@onfloor/contracts";
import { z } from "zod";
import { services } from "../../core/services";
import { formatSnippets, groundingFacts } from "../knowledge";

/**
 * "Guidance on": a coach that follows the call and tells the agent the one thing to do next
 * (with the UI element to highlight), plus short tips when the customer asks something.
 *
 * Tool steps (lookup, campaign, disposition) are ticked by workspace actions, instantly.
 * Script steps (greeting, verification, pitch, dates, closing) are ticked by a fast LLM read of
 * the transcript (job "copilot", one in flight per call, re-run if turns arrive meanwhile).
 * The next step itself is deterministic, so it's instant and always consistent.
 */

const SCRIPT_STEPS = ["greeting", "verify_identity", "verify_owner", "confirm_details", "pitch", "dictate_timeline", "closing"] as const;
const NON_OWNER_SKIPS: GuidanceStepId[] = ["lookup", "confirm_details", "pitch", "campaign", "dictate_timeline"];

const reviewSchema = z.object({
  /** Script steps the agent has completed so far (cumulative). */
  done: z.array(z.enum(SCRIPT_STEPS)),
  customerAgreed: z.boolean(),
  tip: z.object({ kind: z.enum(["answer", "objection", "warning"]), text: z.string() }).nullable(),
});

export interface CoachContext {
  merchant: Merchant;
  scenario: Scenario;
  agentName: string;
  callDate: string;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export class Coach {
  private status = new Map<GuidanceStepId, "todo" | "done" | "skipped">(GUIDANCE_STEPS.map((s) => [s.id, "todo"]));
  private tips: GuidanceTip[] = [];
  private agreed = false;
  private campaign: Campaign | null = null;
  private email: string;
  private startDate: string;
  private months = 1;
  private dashboardOpen = false;
  private running = false;
  private dirty = false;
  private lastTurns: TranscriptTurn[] = [];
  private tipSeq = 0;
  private ended = false;

  constructor(
    private ctx: CoachContext,
    private emit: (g: GuidanceState) => void,
    private now: () => number,
  ) {
    this.email = ctx.merchant.email;
    this.startDate = ctx.callDate;
  }

  get nonOwner() {
    return !this.ctx.merchant.answerer.isDecisionMaker && this.status.get("verify_owner") === "done";
  }

  state(): GuidanceState {
    return {
      steps: GUIDANCE_STEPS.map((s) => ({ id: s.id, status: this.status.get(s.id)! })),
      next: this.next(),
      tips: this.tips.slice(0, 3),
    };
  }

  private publish() {
    if (this.nonOwner) for (const id of NON_OWNER_SKIPS) if (this.status.get(id) === "todo") this.status.set(id, "skipped");
    this.emit(this.state());
  }

  private tip(kind: GuidanceTip["kind"], text: string) {
    this.tips.unshift({ id: `tip_${++this.tipSeq}`, atMs: this.now(), kind, text });
    this.tips = this.tips.slice(0, 3);
  }

  start() {
    this.publish();
  }

  markTool(step: "lookup" | "campaign" | "disposition") {
    this.status.set(step, "done");
    this.publish();
  }

  dashboardOpened() {
    if (this.dashboardOpen) return;
    this.dashboardOpen = true;
    this.publish();
  }

  setCampaign(c: Campaign) {
    this.campaign = c;
    this.status.set("campaign", "done");
    this.publish();
  }

  /** The customer asked for something the tools must reflect: surface it as a tip right away. */
  noteRequest(r: CrmRequest) {
    const v = resolveRequest(r, this.ctx.callDate);
    if (r.kind === "email_update") {
      this.email = v.email!;
      this.tip("info", `New email: ${v.email}. Use it in Ad Studio, not the one on the dashboard.`);
    } else if (r.kind === "start_date") {
      this.startDate = v.date!;
      this.tip("info", `Start date: ${spokenDate(v.date!)} (not today). Set it in Ad Studio and say it back.`);
    } else if (r.kind === "duration") {
      this.months = v.months!;
      this.tip("info", `Run it for ${v.months} months: end date ${spokenDate(addMonths(this.startDate, v.months!))}.`);
    } else {
      this.tip("info", `Callback requested: ${spokenDate(v.date!)} at ${spokenTime(v.time!)}. Use it in the disposition.`);
    }
    this.publish();
  }

  callEnded() {
    this.ended = true;
    this.publish();
  }

  private next(): GuidanceState["next"] {
    const m = this.ctx.merchant;
    const script = this.ctx.scenario.script;
    const todo = GUIDANCE_STEPS.find((s) => this.status.get(s.id) === "todo")?.id;
    if (!todo) return null;
    const end = addMonths(this.startDate, Math.max(this.months, MAX_GROW.minDurationMonths));
    switch (todo) {
      case "greeting":
        return { stepId: todo, text: script.greeting.replace("{agentName}", this.ctx.agentName), target: "nugget.ticket" };
      case "verify_identity":
        return { stepId: todo, text: `Confirm: am I speaking with ${m.ownerName}, from ${m.restaurantName}?`, target: "nugget.ticket" };
      case "verify_owner":
        return { stepId: todo, text: script.nonOwnerQuestion, target: null };
      case "lookup":
        return this.dashboardOpen
          ? { stepId: todo, text: `Paste UID ${m.uid} into Merchant Dashboard and search.`, target: "dashboard.search" }
          : { stepId: todo, text: `Copy UID ${m.uid} from Nugget into Merchant Dashboard.`, target: "nugget.uid" };
      case "confirm_details":
        return { stepId: todo, text: "Confirm their email and phone from the dashboard.", target: "dashboard.contact" };
      case "pitch":
        return {
          stepId: todo,
          text: `Pitch Max Grow: top of search for ${m.topItems[0]?.name ?? "their dishes"}; ${MAX_GROW.commissionPct}% only on sales above ${rupees(m.drr)}/day.`,
          target: "calculator",
        };
      case "campaign":
        return this.agreed
          ? {
              stepId: todo,
              text: `They said yes. Ad Studio: UID ${m.uid}, ${this.email}, Max Grow, ${spokenDate(this.startDate)} → ${spokenDate(end)}.`,
              target: "tab.ad_studio",
            }
          : { stepId: todo, text: "Answer their questions, then ask if they'd like to go ahead with Max Grow.", target: null };
      case "dictate_timeline": {
        const c = this.campaign;
        const text = c
          ? `Your campaign starts ${c.startDate === this.ctx.callDate ? "today, " : ""}${spokenDate(c.startDate)}, and runs through ${spokenDate(c.endDate)}.`
          : script.timeline;
        return { stepId: todo, text, target: null };
      }
      case "closing":
        return this.nonOwner
          ? {
              stepId: todo,
              text: m.answerer.ownerAvailability
                ? `Not the decision maker: confirm the callback time for ${m.ownerName}, then close.`
                : `Not the decision maker and they don't know when ${m.ownerName} is free: propose a callback slot yourself, then close.`,
              target: null,
            }
          : { stepId: todo, text: script.closing, target: null };
      case "disposition":
        return this.ended
          ? { stepId: todo, text: "Pick the email template, send it, then dispose before the timer runs out.", target: "disposition.email" }
          : { stepId: todo, text: "When the call ends: send the email template and dispose within 90 seconds.", target: null };
    }
  }

  /** New transcript turns: re-read the call (single-flight; coalesces bursts). */
  onTurns(turns: TranscriptTurn[]) {
    this.lastTurns = turns;
    if (this.running) {
      this.dirty = true;
      return;
    }
    void this.review();
  }

  private async review() {
    this.running = true;
    try {
      do {
        this.dirty = false;
        const turns = this.lastTurns;
        if (!turns.length) break;
        const lastCustomer = turns.filter((t) => t.speaker === "customer").at(-1)?.text ?? "";
        const facts = lastCustomer ? formatSnippets(await groundingFacts(lastCustomer, 3), 1200) : "";
        const r = await services.llm.json({
          job: "copilot",
          schemaName: "sim_coach",
          schema: reviewSchema,
          temperature: 0.1,
          maxTokens: 400,
          timeoutMs: 12_000,
          messages: [{ role: "user", content: this.prompt(turns, facts) }],
        });
        if (this.ended) break;
        for (const id of r.done) if (this.status.get(id) === "todo") this.status.set(id, "done");
        // A step only counts once the tool step before it is done (e.g. confirm needs the lookup).
        if (this.status.get("lookup") !== "done" && this.status.get("confirm_details") === "done" && !this.nonOwner) {
          this.status.set("confirm_details", "todo");
        }
        if (this.status.get("campaign") !== "done" && this.status.get("dictate_timeline") === "done") this.status.set("dictate_timeline", "todo");
        if (r.customerAgreed) this.agreed = true;
        if (r.tip && !this.tips.some((t) => t.text === r.tip!.text)) this.tip(r.tip.kind, r.tip.text);
        this.publish();
      } while (this.dirty && !this.ended);
    } catch (err) {
      console.error("[guidance] review failed", (err as Error).message);
    } finally {
      this.running = false;
    }
  }

  private prompt(turns: TranscriptTurn[], facts: string): string {
    const m = this.ctx.merchant;
    const s = this.ctx.scenario.script;
    const done = SCRIPT_STEPS.filter((id) => this.status.get(id) === "done");
    return `You are a real-time coach for a Tomato sales agent on an outbound call pitching Max Grow to a restaurant partner. Read the call so far and return JSON.

# Max Grow (the only facts you may use)
- Shows the restaurant at the top of search and top-selling lists for the dishes it sells.
- Commission: exactly ${MAX_GROW.commissionPct}%, ONLY on incremental sales above the merchant's DRR (current average daily sales). Non-negotiable.
- If sales stay at or below the DRR: zero deduction. Billed weekly, settled from the Tomato payout. The merchant can stop it whenever they want. Minimum campaign: 1 month.
- To increase visibility on Tomato: improve menu quality, add pictures to the menu, don't reject too many orders.
- Empathy lines when they complain: ${s.empathy.map((e) => `"${e}"`).join(", ")}.

# This merchant
${m.restaurantName} (UID ${m.uid}), owner on record ${m.ownerName}. DRR ${rupees(m.drr)}/day. Menu: ${m.menu.itemsWithPhotos} of ${m.menu.items} items have photos. Order rejection last 30 days: ${m.orderRejectionPct}%. Top items: ${m.topItems.map((i) => i.name).join(", ")}.
${facts ? `\n# From the Tomato knowledge base\n${facts}\n` : ""}
# Script steps (the AGENT's lines)
greeting: "${s.greeting.replace("{agentName}", this.ctx.agentName)}" (any time-of-day greeting + name + calling from Tomato)
verify_identity: confirmed the person's name and the restaurant name
verify_owner: asked whether they are the owner / can make financial decisions
confirm_details: confirmed the email and/or phone on record with the merchant
pitch: explained Max Grow, including the 20% on incremental sales
dictate_timeline: said the campaign's start and end dates out loud
closing: thanked them and asked if there is anything else they can help with
Already done: ${done.join(", ") || "none"}.

# Return
- done: every script step the agent has completed so far (include the already-done ones).
- customerAgreed: true once the customer has clearly agreed to go ahead with Max Grow.
- tip: null unless the customer's LAST line asked a question or raised an objection that the agent hasn't answered yet (kind "answer" or "objection": what to say, from the facts above, max 25 words, use this merchant's numbers), or the agent's last line got a Max Grow fact wrong (kind "warning": the correct fact). Never repeat a tip already given: ${this.tips.map((t) => `"${t.text}"`).join(", ") || "none"}.

# Transcript
${turns.slice(-14).map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n")}`;
  }
}

// --- Disposition suggestion (after hang-up) -----------------------------------------------------

const suggestionSchema = z.object({
  outcome: z.enum(DISPOSITIONS),
  callbackDate: z.string().nullable(),
  callbackTime: z.string().nullable(),
  reason: z.string(),
});

/** The AI's read of how the call went: which outcome, template and (for callbacks) slot. */
export async function suggestDisposition(input: {
  merchant: Merchant;
  callDate: string;
  turns: TranscriptTurn[];
  campaign: Campaign | null;
  fallback: Disposition | null;
}): Promise<DispositionSuggestion> {
  const fallback = (): DispositionSuggestion => {
    const outcome = input.fallback ?? (input.campaign ? "accepted" : "not_interested");
    return { outcome, template: DISPOSITION_TEMPLATE[outcome], callback: null, reason: "Based on how the call ended." };
  };
  try {
    const r = await services.llm.json({
      job: "copilot",
      schemaName: "disposition_suggestion",
      schema: suggestionSchema,
      temperature: 0.1,
      maxTokens: 300,
      timeoutMs: 10_000,
      messages: [
        {
          role: "user",
          content: `A Tomato sales call to ${input.merchant.restaurantName} just ended. Today is ${input.callDate}. Decide the Nugget disposition.
Outcomes: accepted (agreed to Max Grow) | rejected (clear no) | not_interested (not interested or not sure, wants details / to think) | callback (asked to be called later, or the person wasn't the decision maker).
Campaign launched in Ad Studio: ${input.campaign ? `yes, ${input.campaign.startDate} to ${input.campaign.endDate}` : "no"}.
For callback: callbackDate (YYYY-MM-DD) and callbackTime (HH:MM, 24h) from what was agreed; if no time was agreed, pick the next working day at 11:00. Otherwise null.
reason: one sentence for the agent, naming the email template to send.

${input.turns.slice(-16).map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n")}`,
        },
      ],
    });
    const callback =
      r.outcome === "callback" && r.callbackDate && /^\d{4}-\d{2}-\d{2}$/.test(r.callbackDate)
        ? { date: r.callbackDate, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.callbackTime ?? "") ? r.callbackTime! : "11:00" }
        : null;
    return { outcome: r.outcome, template: DISPOSITION_TEMPLATE[r.outcome], callback, reason: r.reason };
  } catch (err) {
    console.error("[guidance] suggestion failed", (err as Error).message);
    return fallback();
  }
}
