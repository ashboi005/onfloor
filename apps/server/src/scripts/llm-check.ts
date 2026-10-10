/**
 * Pings every LLM job on its configured provider/model and prints latency.
 *   bun run llm:check
 */
import { z } from "zod";
import { services } from "../core/services";
import { type LlmJob, providerFor } from "../core/services/llm";
import { ENV } from "../env.server";

for (const [name, base, key] of [
  ["merge", ENV.MERGE_BASE_URL, ENV.MERGE_API_KEY],
  ["gemini", ENV.GEMINI_BASE_URL, ENV.GEMINI_API_KEY],
] as const) {
  if (!key) {
    console.log(`${name}: no key`);
    continue;
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${key}` } });
  const body = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  console.log(`${name}: /models ${res.status}, ${body?.data?.length ?? "?"} models`);
}

for (const job of ["roleplay", "copilot", "scoring", "persona"] as LlmJob[]) {
  const t = performance.now();
  try {
    const out =
      job === "scoring" || job === "persona"
        ? JSON.stringify(
            await services.llm.json({
              job,
              schemaName: "ping",
              schema: z.object({ ok: z.boolean() }),
              messages: [{ role: "user", content: 'Return {"ok": true}.' }],
            }),
          )
        : await services.llm.chat({ job, maxTokens: 30, messages: [{ role: "user", content: "Say hi in 3 words." }] });
    console.log(`${job.padEnd(9)} ${providerFor(job).padEnd(7)} ${Math.round(performance.now() - t)}ms  ${out.slice(0, 60)}`);
  } catch (e) {
    console.log(`${job.padEnd(9)} ${providerFor(job).padEnd(7)} FAILED ${(e as Error).message}`, (e as Error).cause ?? "");
  }
}
process.exit(0);
