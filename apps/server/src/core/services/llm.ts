import { z } from "zod";
import { ENV } from "../../env.server";
import { AppError } from "../errors";
import { cooldownFor, KeyPool, type PooledKey } from "./key-pool";

/**
 * LLM access with a provider toggle.
 *
 * Merge Gateway and Gemini both speak OpenAI-compatible chat completions, so this is
 * one adapter whose base URL / key / model are chosen per job:
 *
 *   LLM_PROVIDER=merge|gemini          default for every job
 *   LLM_PROVIDER_<JOB>=merge|gemini    optional per-job override
 *   LLM_FALLBACK=true                  on 429/5xx, retry once on the other provider
 *
 * Suggested for the Gemini track: scoring + persona on Gemini (few calls, long
 * context, structured JSON), roleplay + copilot on Merge (high frequency).
 */

export type LlmJob = "roleplay" | "copilot" | "scoring" | "persona";
export type LlmProvider = "merge" | "gemini";
/** "fast" is for latency-bound work (copilot hints, sentiment, captions). */
export type ModelTier = "roleplay" | "fast" | "scoring";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatInput {
  job: LlmJob;
  messages: ChatMessage[];
  /** Defaults per job: roleplay → roleplay, copilot → fast, scoring/persona → scoring. */
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface JsonInput<T> extends ChatInput {
  schema: z.ZodType<T>;
  schemaName: string;
}

export interface LlmService {
  chat(input: ChatInput): Promise<string>;
  /** Strict JSON validated by `schema`. One repair retry if the model's JSON doesn't validate. */
  json<T>(input: JsonInput<T>): Promise<T>;
  // TODO(ashwath): stream(input) for roleplay first-token latency.
}

const DEFAULT_TIER: Record<LlmJob, ModelTier> = {
  roleplay: "roleplay",
  copilot: "fast",
  scoring: "scoring",
  persona: "scoring",
};

interface ProviderConfig {
  baseUrl: string;
  models: Record<ModelTier, string>;
}

function providers(): Record<LlmProvider, ProviderConfig> {
  return {
    merge: {
      baseUrl: ENV.MERGE_BASE_URL,
      models: { roleplay: ENV.MERGE_MODEL_ROLEPLAY, fast: ENV.MERGE_MODEL_FAST, scoring: ENV.MERGE_MODEL_SCORING },
    },
    gemini: {
      baseUrl: ENV.GEMINI_BASE_URL,
      models: { roleplay: ENV.GEMINI_MODEL_ROLEPLAY, fast: ENV.GEMINI_MODEL_FAST, scoring: ENV.GEMINI_MODEL_SCORING },
    },
  };
}

let keyPools: Record<LlmProvider, KeyPool> | null = null;
/** One pool per provider, built once. Gemini rotates up to 4 keys; Merge has one. */
function pools(): Record<LlmProvider, KeyPool> {
  keyPools ??= {
    merge: new KeyPool("merge", [ENV.MERGE_API_KEY]),
    gemini: new KeyPool("gemini", [ENV.GEMINI_API_KEY, ENV.GEMINI_API_KEY_2, ENV.GEMINI_API_KEY_3, ENV.GEMINI_API_KEY_4]),
  };
  return keyPools;
}

const hasKeys = (p: LlmProvider) => pools()[p].size > 0;

/** Key health per provider, for /health and llm:check. Labels only, never the keys. */
export function llmKeyStatus() {
  const p = pools();
  return { merge: p.merge.status(), gemini: p.gemini.status() };
}

export function providerFor(job: LlmJob): LlmProvider {
  const override = {
    roleplay: ENV.LLM_PROVIDER_ROLEPLAY,
    copilot: ENV.LLM_PROVIDER_COPILOT,
    scoring: ENV.LLM_PROVIDER_SCORING,
    persona: ENV.LLM_PROVIDER_PERSONA,
  }[job];
  return override || ENV.LLM_PROVIDER;
}

const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullish() }))
    .min(1),
});

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`LLM HTTP ${status}: ${body.slice(0, 500)}`);
  }
}

async function complete(
  provider: LlmProvider,
  input: ChatInput,
  responseFormat?: { name: string; schema: unknown },
): Promise<string> {
  const cfg = providers()[provider];
  const pool = pools()[provider];
  if (!pool.size) throw new AppError("LLM_UNAVAILABLE", { message: `${provider} has no API key configured.` });
  const tier = input.tier ?? DEFAULT_TIER[input.job];
  const model = cfg.models[tier];
  const body = JSON.stringify({
    model,
    messages: input.messages,
    ...(input.temperature !== undefined && { temperature: input.temperature }),
    ...(input.maxTokens !== undefined && { max_tokens: input.maxTokens }),
    ...(tier === "scoring" && ENV.LLM_SCORING_REASONING !== "none" && { reasoning_effort: ENV.LLM_SCORING_REASONING }),
    ...(responseFormat && {
      response_format: {
        type: "json_schema",
        json_schema: { name: responseFormat.name, schema: responseFormat.schema, strict: true },
      },
    }),
  });

  // Rotate through the provider's keys: a key that 429s/503s cools down and the same
  // request moves straight on to the next healthy one (see key-pool.ts for the policy).
  const tried = new Set<PooledKey>();
  let lastError: HttpError | null = null;
  for (let attempt = 0; attempt < pool.size; attempt++) {
    const k = pool.next(model, tried);
    if (!k) break;
    tried.add(k);
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${k.key}` },
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      lastError = new HttpError(res.status, text);
      const cooldown = cooldownFor(res.status, text);
      if (!cooldown) throw lastError;
      pool.cool(k, model, cooldown);
      if (!cooldown.rotate) break;
      continue;
    }
    const parsed = completionSchema.safeParse(await res.json());
    const content = parsed.success ? parsed.data.choices[0]?.message.content : null;
    if (!content?.trim()) throw new AppError("LLM_FAILED", { cause: new Error(`${provider}/${model} returned no text`) });
    return content;
  }
  // Every key is cooling or just failed in a cooldown-worthy way: always surface it as a 429,
  // whatever the last key's own status was, so the provider-level fallback runs.
  throw new HttpError(
    429,
    `${provider}: all ${pool.size} keys cooling down (${model}; next in ${Math.round(pool.soonestMs(model) / 1000)}s)${lastError ? `; last: ${lastError.message.slice(0, 120)}` : ""}`,
  );
}

const retryable = (e: unknown) => e instanceof HttpError && (e.status === 429 || e.status >= 500);

/** Primary provider, then (optionally) the other one on rate-limit / server errors. */
async function withFallback(job: LlmJob, run: (p: LlmProvider) => Promise<string>): Promise<string> {
  const primary = providerFor(job);
  const secondary: LlmProvider = primary === "merge" ? "gemini" : "merge";
  try {
    try {
      return await run(primary);
    } catch (e) {
      // No other provider to fall back to: back off once on a rate limit / overload and retry the same one.
      if (!retryable(e) || (ENV.LLM_FALLBACK && hasKeys(secondary))) throw e;
      await Bun.sleep(1500);
      return await run(primary);
    }
  } catch (e) {
    if (ENV.LLM_FALLBACK && retryable(e) && hasKeys(secondary)) {
      console.warn(`[llm] ${job}: ${primary} failed (${(e as Error).message.slice(0, 80)}), falling back to ${secondary}`);
      return await run(secondary).catch((e2) => {
        throw new AppError("LLM_FAILED", { cause: e2 });
      });
    }
    if (e instanceof AppError) throw e;
    throw new AppError("LLM_FAILED", { cause: e });
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}

export function createLlmService(): LlmService {
  return {
    chat: (input) => withFallback(input.job, (p) => complete(p, input)),

    async json<T>(input: JsonInput<T>): Promise<T> {
      const jsonSchema = z.toJSONSchema(input.schema, { unrepresentable: "any" });
      const ask = (messages: ChatMessage[]) =>
        withFallback(input.job, (p) => complete(p, { ...input, messages }, { name: input.schemaName, schema: jsonSchema }));

      const first = await ask(input.messages);
      try {
        return input.schema.parse(extractJson(first));
      } catch (err) {
        // One repair round: show the model its own output and the validation error.
        const repaired = await ask([
          ...input.messages,
          { role: "assistant", content: first },
          {
            role: "user",
            content: `That JSON did not validate: ${String(err).slice(0, 800)}\nReturn ONLY corrected JSON matching the schema.`,
          },
        ]);
        try {
          return input.schema.parse(extractJson(repaired));
        } catch (err2) {
          throw new AppError("LLM_FAILED", { cause: err2 });
        }
      }
    },
  };
}
