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
  expect(detectViolations("Kal tak activation ho jayega").map((p) => p.id)).toContain("pol_activation");
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
