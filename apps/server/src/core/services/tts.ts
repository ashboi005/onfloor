import type { Language } from "@onfloor/contracts";
import { AppError } from "../errors";

/**
 * Text to speech. The persona's `voiceId` prefix picks the provider:
 *   "elevenlabs:<id>" → ElevenLabs (ELEVENLABS_TTS_MODEL, must be multilingual)
 *   "sarvam:<speaker>" → Sarvam bulbul:v3
 * No fallback between providers: a failed line is a retryable error, never a different voice.
 *
 * TODO(ashwath): ElevenLabs + Sarvam adapters, routed by the voiceId prefix.
 */
export interface SynthesizeInput {
  text: string;
  voiceId: string;
  language: Language;
  /** 0.7–1.2 (ElevenLabs bounds). */
  speed?: number;
}

export interface TtsService {
  synthesize(input: SynthesizeInput): Promise<{ audio: Uint8Array; contentType: string }>;
}

export function createTtsService(): TtsService {
  return {
    async synthesize() {
      throw new AppError("NOT_IMPLEMENTED", { message: "TTS not ported yet (see core/services/tts.ts)." });
    },
  };
}
