import type { Language } from "@onfloor/contracts";
import { ENV } from "../../env.server";
import { AppError } from "../errors";

/**
 * Speech to text: ElevenLabs Scribe v2 Realtime.
 *
 * Two consumers, one protocol:
 *  - the simulator BROWSER opens the socket itself with `realtimeUrl(…, token)`;
 *  - Tushar's live module opens TWO server-side sockets per Telegram call
 *    (agent + customer) with the same URL. See docs/specs/03a §4.
 *
 * Protocol: send { message_type: "input_audio_chunk", audio_base_64, commit: false }
 * every ~100ms of PCM16LE 16 kHz mono; receive session_started / partial_transcript /
 * committed_transcript / *_error.
 */
export interface SttService {
  /** Single-use, consumed on connect. Mint one per socket; reconnect = new token. */
  mintRealtimeToken(): Promise<string>;
  realtimeUrl(input: RealtimeSessionInput, token: string): string;
}

export interface RealtimeSessionInput {
  language: Language;
  /** Product names / trade terms to bias recognition toward. Max 50. */
  keyTerms?: string[];
}

const REALTIME_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
/** Pause before the server commits a turn. 0.3–3.0s. Main lever on responsiveness vs cutting people off. */
const VAD_SILENCE_SECS = 0.6;

const STT_CODES: Record<Language, string> = { en: "en", hi: "hi", hinglish: "hi" };

export function realtimeQuery({ language, keyTerms = [] }: RealtimeSessionInput): URLSearchParams {
  const params = new URLSearchParams({
    model_id: ENV.ELEVENLABS_STT_MODEL,
    language_code: STT_CODES[language],
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(VAD_SILENCE_SECS),
  });
  // Hinglish = Hindi with English allowed alongside, so code-switched sentences keep both halves.
  if (language === "hinglish") params.append("secondary_languages", "en");
  for (const term of keyTerms.slice(0, 50)) params.append("keyterms", term);
  return params;
}

export function createSttService(): SttService {
  return {
    async mintRealtimeToken() {
      if (!ENV.ELEVENLABS_API_KEY) throw new AppError("VOICE_UNAVAILABLE");
      const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
        method: "POST",
        headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(20_000),
      }).catch((cause) => {
        throw new AppError("TRANSCRIPTION_FAILED", { cause });
      });
      if (!res.ok) {
        throw new AppError("TRANSCRIPTION_FAILED", {
          cause: new Error(`ElevenLabs token ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`),
        });
      }
      const body = (await res.json().catch(() => null)) as { token?: string } | null;
      if (!body?.token) throw new AppError("TRANSCRIPTION_FAILED", { cause: new Error("no token in response") });
      return body.token;
    },
    realtimeUrl(input, token) {
      return `${REALTIME_URL}?${realtimeQuery(input)}&token=${encodeURIComponent(token)}`;
    },
  };
}
