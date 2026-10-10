/** Synthesises one line per provider and writes it to .data/tts-check-*.mp3.  bun src/scripts/tts-check.ts */
import { VOICES } from "@onfloor/contracts/fixtures";
import { services } from "../core/services";

for (const voiceId of [VOICES.mahesh, VOICES.rehan]) {
  const t = performance.now();
  try {
    const { audio } = await services.tts.synthesize({ voiceId, language: "hinglish", text: "Dekho bhai, 50,000 budget theek hai, but discount kitna doge?" });
    const file = `.data/tts-check-${voiceId.split(":")[0]}.mp3`;
    await Bun.write(file, audio);
    console.log(`${voiceId.padEnd(36)} ${Math.round(performance.now() - t)}ms  ${audio.byteLength} bytes → ${file}`);
  } catch (e) {
    console.log(`${voiceId} FAILED ${(e as Error).message}`, (e as Error).cause ?? "");
  }
}
process.exit(0);
