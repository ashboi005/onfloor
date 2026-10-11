import { expect, test } from "bun:test";
import { detectViolations } from "../policies";
import { TalkMetrics } from "./metrics";

test("guardrails distinguish a promise from refusal, quotes, and approval requests", () => {
  expect(detectViolations("I can offer 15% discount").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("I can offer 10.5% discount").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("I cannot offer 15% discount")).toEqual([]);
  expect(detectViolations("You said the competitor offers 15% discount")).toEqual([]);
  expect(detectViolations("I need manager approval for a 15% discount")).toEqual([]);
  expect(detectViolations("I guarantee more orders").find((p) => p.id === "pol_guarantee")?.severity).toBe("warn");
  expect(detectViolations("I guarantee a full refund").map((p) => p.id)).toContain("pol_refund");
  // [added by Ashwath] Tomato: any rate other than 20%, or on total sales, misrepresents Max Grow;
  // the correct 20% on incremental sales is never a "discount".
  expect(detectViolations("It's only 15% commission on your sales").map((p) => p.id)).toContain("pol_commission");
  expect(detectViolations("Sir, 30 percent katega bas").map((p) => p.id)).toContain("pol_commission");
  expect(detectViolations("We charge 20% on your total sales").map((p) => p.id)).toContain("pol_commission");
  expect(detectViolations("We offer Max Grow at 20% commission only on the extra sales")).toEqual([]);
  expect(detectViolations("It's not 15%, it's 20% commission on incremental sales")).toEqual([]);
  // [added by Ashwath] A discount offered with no number is still a breach; refusing one isn't.
  expect(detectViolations("Theek hai sir, main aapko discount de deta hoon").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("मैं आपको डिस्काउंट दे देता हूँ").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("Sorry sir, I cannot give any discount")).toEqual([]);
  expect(detectViolations("Customer asked for a discount but we keep it at 20%")).toEqual([]);
  expect(detectViolations("15 प्रतिशत डिस्काउंट देंगे").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("१५% छूट देंगे").map((p) => p.id)).toContain("pol_discount");
  expect(detectViolations("ऑर्डर की गारंटी देंगे").map((p) => p.id)).toContain("pol_guarantee");
  expect(detectViolations("रिफंड पक्का देंगे").map((p) => p.id)).toContain("pol_refund");
});

test("metrics handle overlaps, silence and unfinished monologues", () => {
  const metrics = new TalkMetrics();
  metrics.note("agent", 0, 10_000);
  metrics.note("agent", 5000, 15_000);
  metrics.note("customer", 10_000, 15_000);
  expect(metrics.read(15_000).agentTalkPct).toBe(75);
  expect(metrics.read(21_001).alert).toBe("dead_air");
  for (let at = 22_000; at <= 55_000; at += 100) metrics.note("agent", at, at + 100);
  expect(metrics.read(55_100).alert).toBe("monologue");
  // Rolling windows expire; silence is not a speaking interval.
  expect(metrics.read(200_000).agentTalkPct).toBe(0);
});

test("metrics wait for substantial talk and measure silence from audio rather than STT receipt", () => {
  const metrics = new TalkMetrics();
  metrics.note("agent", 0, 3500);
  expect(metrics.read(3500).alert).toBeNull();
  metrics.note("customer", 46_000, 54_700);
  metrics.turn({ id: "turn", callId: "call", seq: 1, speaker: "customer", text: "hello", startMs: 46_000, endMs: 57_400 });
  expect(metrics.read(62_200).currentSilenceMs).toBe(7500);
  expect(metrics.read(62_200).alert).toBe("dead_air");
});
