import type { Speaker } from "@onfloor/contracts";
import { encodeWav, MAX_SAMPLES } from "./audio";

/** Sparse pieces avoid allocating the full ten-minute recording for every call. */
export class CallRecording {
  private pieces: Record<Speaker, Array<{ offset: number; pcm: Uint8Array }>> = { agent: [], customer: [] };
  private ends: Record<Speaker, number> = { agent: 0, customer: 0 };

  /** Ignore retransmitted samples, trim overlaps, and retain gaps as silence. */
  append(speaker: Speaker, offset: number, pcm: Uint8Array): { offset: number; pcm: Uint8Array; gap: number } | null {
    if (!Number.isInteger(offset) || offset < 0 || !pcm.length || pcm.length % 2 || offset + pcm.length / 2 > MAX_SAMPLES) {
      throw new Error("Invalid recording samples.");
    }
    const previous = this.ends[speaker];
    const trim = Math.max(0, previous - offset);
    if (trim >= pcm.length / 2) return null;
    const chunk = { offset: offset + trim, pcm: pcm.slice(trim * 2) };
    const gap = Math.max(0, chunk.offset - previous);
    this.pieces[speaker].push(chunk);
    this.ends[speaker] = chunk.offset + chunk.pcm.length / 2;
    return { ...chunk, gap };
  }

  files(durationMs: number): Record<"agent" | "customer" | "stereo" | "mixed", Uint8Array> {
    const samples = Math.min(MAX_SAMPLES, Math.max(this.ends.agent, this.ends.customer, Math.ceil(durationMs * 16)));
    const render = (speaker: Speaker) => {
      const pcm = new Uint8Array(samples * 2);
      for (const piece of this.pieces[speaker]) pcm.set(piece.pcm, piece.offset * 2);
      return pcm;
    };
    const agent = render("agent"), customer = render("customer");
    const a = new DataView(agent.buffer), c = new DataView(customer.buffer);
    const mixed = new Uint8Array(samples * 2), out = new DataView(mixed.buffer);
    for (let i = 0; i < samples; i++) out.setInt16(i * 2, Math.round((a.getInt16(i * 2, true) + c.getInt16(i * 2, true)) / 2), true);
    return { agent: encodeWav([agent]), customer: encodeWav([customer]), stereo: encodeWav([agent, customer]), mixed: encodeWav([mixed]) };
  }
}
