/** Run from apps/server: bun src/modules/live/check-integrations.ts. No DB writes/calls. */
import { z } from "zod";
import { services } from "../../core/services";
import { ENV } from "../../env.server";
import { agentIdByEmail } from "./index";
import { openChannelStream } from "./transcribe";

function failureCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN";
  const status = error.message.match(/LLM HTTP (\d{3})/);
  if (status) return `HTTP_${status[1]}`;
  const code = "code" in error && typeof error.code === "string" ? error.code : error.name;
  // Never log provider bodies/URLs: nested messages can contain account details.
  return error.cause ? `${code}/${failureCode(error.cause)}` : code;
}

async function main() {
  let failed = false;
  const checks: Array<[string, () => Promise<void>]> = [
    ["Database and configured live agent", async () => {
      if (!await agentIdByEmail(ENV.LIVE_AGENT_EMAIL)) throw new Error("Agent not seeded");
    }],
    ["Copilot structured LLM service", async () => {
      await services.llm.json({ job: "copilot", tier: "fast", schemaName: "live_service_check", schema: z.object({ ok: z.boolean() }),
        messages: [{ role: "user", content: "Return {\"ok\":true}. This is an integration connectivity check." }],
        maxTokens: 40, timeoutMs: 10_000 });
    }],
    ["Two independent ElevenLabs sessions", async () => {
      const start = performance.now();
      const results = await Promise.allSettled((["agent", "customer"] as const).map((speaker) => openChannelStream({
        callId: "connectivity-check", speaker, language: ENV.LIVE_DEFAULT_LANGUAGE,
        elapsed: () => Math.round(performance.now() - start), onPartial() {}, onCommitted() {}, onError() {},
      })));
      await Promise.allSettled(results.filter((r) => r.status === "fulfilled").map((r) => r.status === "fulfilled" ? r.value.close() : Promise.resolve()));
      if (results.some((r) => r.status === "rejected")) throw new Error("Speech handshake failed");
    }],
  ];
  for (const [name, check] of checks) {
    try { await check(); console.log(`PASS: ${name}`); }
    catch (error) { failed = true; console.log(`FAIL: ${name} [${failureCode(error)}] (check credentials, quota, network and seeded agent; no secrets logged)`); }
  }
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.main) await main();
