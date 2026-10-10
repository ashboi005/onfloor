import type { Language } from "@onfloor/contracts";
import { ENV } from "../../env.server";
import { AppError } from "../errors";
import { toSpokenText } from "./spoken-text";

/**
 * Text to speech. The persona's `voiceId` prefix picks the provider:
 *   "elevenlabs:<id>" → ElevenLabs (ELEVENLABS_TTS_MODEL, must be multilingual)
 *   "sarvam:<speaker>" → Sarvam bulbul:v3
 * No fallback between providers: a failed line is a retryable error, never a different voice.
 * Numerals are spelled out for the voice; the transcript keeps its digits.
 */
export interface SynthesizeInput {
  text: string;
  voiceId: string;
  language: Language;
  /** 0.7–1.2 (ElevenLabs bounds). */
  speed?: number;
}

export interface SynthesizedAudio {
  audio: Uint8Array;
  contentType: string;
}

export interface TtsService {
  synthesize(input: SynthesizeInput): Promise<SynthesizedAudio>;
}

/** Expressive at a natural pace: a business owner on the phone, not a voice-over. */
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };

export function parseVoiceId(voiceId: string): { provider: "elevenlabs" | "sarvam"; id: string } | null {
  const trimmed = voiceId.trim();
  if (!trimmed) return null;
  const sep = trimmed.indexOf(":");
  if (sep === -1) return { provider: "elevenlabs", id: trimmed };
  const prefix = trimmed.slice(0, sep);
  const id = trimmed.slice(sep + 1);
  if (!id || (prefix !== "elevenlabs" && prefix !== "sarvam")) return null;
  return { provider: prefix, id };
}

const clampSpeed = (s: number | undefined) => Math.min(1.2, Math.max(0.7, s ?? 1));

async function elevenlabs(voice: string, { text, language, speed }: SynthesizeInput): Promise<SynthesizedAudio> {
  if (!ENV.ELEVENLABS_API_KEY) throw new AppError("VOICE_UNAVAILABLE");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ENV.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        text: toSpokenText(text, language),
        model_id: ENV.ELEVENLABS_TTS_MODEL,
        language_code: language === "en" ? "en" : "hi",
        voice_settings: { ...VOICE_SETTINGS, speed: clampSpeed(speed) },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  ).catch((cause) => {
    throw new AppError("VOICE_FAILED", { cause });
  });
  if (!res.ok) {
    throw new AppError("VOICE_FAILED", {
      cause: new Error(`ElevenLabs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`),
    });
  }
  return { audio: new Uint8Array(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

const SARVAM_LANG: Record<Language, string> = { en: "en-IN", hi: "hi-IN", hinglish: "hi-IN" };

async function sarvam(speaker: string, { text, language, speed }: SynthesizeInput): Promise<SynthesizedAudio> {
  if (!ENV.SARVAM_API_KEY) throw new AppError("VOICE_UNAVAILABLE", { message: "Sarvam isn't configured." });
  const spoken = toSpokenText(text, language);
  if (spoken.length > 2500) throw new AppError("VOICE_FAILED", { cause: new Error("line over Sarvam's 2500 chars") });
  const res = await fetch("https://api.sarvam.ai/text-to-speech/stream", {
    method: "POST",
    headers: { "api-subscription-key": ENV.SARVAM_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      text: spoken,
      model: ENV.SARVAM_TTS_MODEL,
      speaker,
      target_language_code: SARVAM_LANG[language],
      pace: clampSpeed(speed),
      temperature: 0.6,
      output_audio_codec: "mp3",
      speech_sample_rate: 22050,
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch((cause) => {
    throw new AppError("VOICE_FAILED", { cause });
  });
  if (!res.ok) {
    throw new AppError("VOICE_FAILED", {
      cause: new Error(`Sarvam ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`),
    });
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  if (!audio.byteLength) throw new AppError("VOICE_FAILED", { cause: new Error("Sarvam returned no audio") });
  return { audio, contentType: "audio/mpeg" };
}

export function createTtsService(): TtsService {
  return {
    async synthesize(input) {
      const parsed = parseVoiceId(input.voiceId) ?? (ENV.ELEVENLABS_VOICE_ID ? parseVoiceId(ENV.ELEVENLABS_VOICE_ID) : null);
      if (!parsed) throw new AppError("VOICE_UNAVAILABLE", { message: "This persona's voice isn't recognised." });
      return parsed.provider === "sarvam" ? sarvam(parsed.id, input) : elevenlabs(parsed.id, input);
    },
  };
}
