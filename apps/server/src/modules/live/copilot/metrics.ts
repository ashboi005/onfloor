import type { Speaker, TranscriptTurn } from "@onfloor/contracts";

type Window = { start: number; end: number };
export class TalkMetrics {
  private windows: Record<Speaker, Window[]> = { agent: [], customer: [] };
  private agentSpeech: Window[] = [];
  private lastSpeech = 0;
  private add(windows: Window[], startMs: number, endMs: number): Window[] {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs) return windows;
    const sorted = [...windows, { start: startMs, end: endMs }].sort((a, b) => a.start - b.start);
    const merged: Window[] = [];
    for (const window of sorted) {
      const previous = merged.at(-1);
      if (previous && window.start <= previous.end + 200) previous.end = Math.max(previous.end, window.end);
      else merged.push({ ...window });
    }
    return merged.filter((w) => w.end >= endMs - 120_000);
  }
  note(speaker: Speaker, startMs: number, endMs: number) {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < startMs) return;
    this.lastSpeech = Math.max(this.lastSpeech, endMs);
    this.windows[speaker] = this.add(this.windows[speaker], startMs, endMs);
    if (speaker === "agent") this.agentSpeech = this.add(this.agentSpeech, startMs, endMs);
  }
  turn(turn: TranscriptTurn) {
    this.windows[turn.speaker] = this.add(this.windows[turn.speaker], turn.startMs, turn.endMs);
  }
  read(now: number): { agentTalkPct: number; currentSilenceMs: number; alert: "dead_air" | "monologue" | null } {
    const duration = (speaker: Speaker) => this.windows[speaker].reduce((sum, w) =>
      sum + Math.max(0, Math.min(now, w.end) - Math.max(now - 120_000, w.start)), 0);
    const agent = duration("agent"), customer = duration("customer");
    const agentTalkPct = agent + customer ? Math.round(agent / (agent + customer) * 100) : 0;
    const currentSilenceMs = Math.max(0, Math.round(now - this.lastSpeech));
    const window = this.agentSpeech.at(-1);
    const continuous = window && now - window.end <= 1000 && window.end - window.start > 30_000;
    return { agentTalkPct, currentSilenceMs, alert: currentSilenceMs > 6000 ? "dead_air" : continuous || agent + customer >= 30_000 && agentTalkPct > 70 ? "monologue" : null };
  }
}
