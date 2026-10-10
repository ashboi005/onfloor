/**
 * API-key rotation for providers with tight per-key quotas (Gemini free tier: requests
 * per minute AND per day, per Google Cloud project).
 *
 * Policy (cooldowns are per key AND per model, because Gemini quotas are per model per
 * project: an exhausted scoring model must not bench the key for the roleplay model):
 *  - round-robin per call across healthy keys, so load (and the per-minute quota) is
 *    spread evenly instead of burning one key until it 429s;
 *  - a key that fails cools down, and the same request retries on the next key at once:
 *      429 per-minute  → Google's RetryInfo.retryDelay, or 60s
 *      429 per-day     → 1h (re-probed hourly; the daily quota resets at midnight Pacific)
 *      401/403/invalid → 10 min (bad or revoked key; logged loudly)
 *      5xx             → 5s (usually model overload: one quick hop to another key)
 *  - when every key is cooling, the caller gets a 429 so the provider-level fallback
 *    (Merge) takes over.
 */

export interface PooledKey {
  key: string;
  /** "gemini#2", for logs. Never log the key itself. */
  label: string;
  /** model → cooldown. "*" applies to every model (e.g. an invalid key). */
  cooling: Map<string, { until: number; reason: string }>;
  uses: number;
  failures: number;
}

function coolingFor(k: PooledKey, model: string, now: number) {
  for (const key of [model, "*"]) {
    const c = k.cooling.get(key);
    if (c && c.until > now) return c;
  }
  return null;
}

export interface Cooldown {
  ms: number;
  reason: string;
  /** Whether trying another key for the same request can help. */
  rotate: boolean;
  /** Applies to every model on this key (bad key) rather than just the one that failed. */
  allModels?: boolean;
}

export class KeyPool {
  private cursor = 0;
  readonly keys: PooledKey[];

  constructor(
    readonly provider: string,
    keys: (string | undefined)[],
  ) {
    const unique = [...new Set(keys.map((k) => k?.trim()).filter((k): k is string => !!k))];
    this.keys = unique.map((key, i) => ({ key, label: `${provider}#${i + 1}`, cooling: new Map(), uses: 0, failures: 0 }));
  }

  get size() {
    return this.keys.length;
  }

  /** The next key healthy for `model`, round-robin, skipping `exclude`. null when all are cooling. */
  next(model: string, exclude: Set<PooledKey> = new Set()): PooledKey | null {
    const now = Date.now();
    for (let n = 0; n < this.keys.length; n++) {
      const idx = (this.cursor + n) % this.keys.length;
      const k = this.keys[idx]!;
      if (exclude.has(k) || coolingFor(k, model, now)) continue;
      this.cursor = (idx + 1) % this.keys.length;
      k.uses++;
      return k;
    }
    return null;
  }

  cool(k: PooledKey, model: string, c: Cooldown) {
    const scope = c.allModels ? "*" : model;
    k.cooling.set(scope, { until: Date.now() + c.ms, reason: c.reason });
    k.failures++;
    const level = c.allModels ? "error" : "warn";
    console[level](`[llm] ${k.label}${c.allModels ? "" : ` (${model})`} cooling ${Math.round(c.ms / 1000)}s: ${c.reason}`);
  }

  /** Ms until some key recovers for `model` (0 if one is healthy now). */
  soonestMs(model: string): number {
    const now = Date.now();
    return Math.min(...this.keys.map((k) => Math.max(0, (coolingFor(k, model, now)?.until ?? now) - now)));
  }

  /** Healthy = not cooling for any model. Cooling entries are listed per model. */
  status() {
    const now = Date.now();
    const active = (k: PooledKey) => [...k.cooling.entries()].filter(([, c]) => c.until > now);
    return {
      total: this.keys.length,
      healthy: this.keys.filter((k) => active(k).length === 0).length,
      keys: this.keys.map((k) => ({
        label: k.label,
        healthy: active(k).length === 0,
        cooling: active(k).map(([model, c]) => ({ model, inSec: Math.round((c.until - now) / 1000), reason: c.reason })),
        uses: k.uses,
        failures: k.failures,
      })),
    };
  }
}

/** Decide the cooldown for a failed request from its HTTP status and (Gemini) error body. */
export function cooldownFor(status: number, body: string): Cooldown | null {
  if (status === 429) {
    if (/PerDay/i.test(body)) return { ms: 60 * 60_000, reason: "daily quota exhausted", rotate: true };
    const delay = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    const ms = delay ? Math.ceil(Number(delay[1]) * 1000) + 500 : 60_000;
    return { ms: Math.min(ms, 10 * 60_000), reason: "rate limited", rotate: true };
  }
  if (status === 401 || status === 403 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body))) {
    return { ms: 10 * 60_000, reason: `auth failed (${status}), check this key`, rotate: true, allModels: true };
  }
  if (status >= 500) return { ms: 5_000, reason: `server error ${status}`, rotate: true };
  return null;
}
