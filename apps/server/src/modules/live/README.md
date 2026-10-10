# modules/live (owner: Tushar)

Pillar 2 server side. Specs: `docs/specs/03-tushar-live.md`, `docs/specs/03a-telegram-voice-guide.md`.

| File | State | What |
|---|---|---|
| `routes.ts` | ✅ working | `/api/live/active`, `/ws/live/:callId\|active`, `/api/live/dev/simulate`, `/internal/live/ingest` (control msgs only) |
| `hub.ts` | ✅ working | HUD fan-out + `live_events` persistence + late-joiner backlog |
| `session.ts` | ✅ working | start → finish → `scoreCall` → persona → HUD events. `simulateFixtureCall` plays the fixture through it |
| `copilot/index.ts` | 🟡 keyword fast paths only | TODO: LLM hints, LLM guardrails, sentiment, talk metrics |
| `playbook.ts`, `policies.ts` | 🟡 starter content | grow from real calls |
| `transcribe.ts` | 🔴 TODO | per-channel ElevenLabs realtime sockets |
| `extract-persona.ts` | 🟡 draft | LLM → `createPersonaSchema` → `createPersona()` (used when `STUB_ENGINES=false`) |
| `/api/live/calls/replay-file` | 🔴 TODO | stereo WAV → same path as the bridge. Currently plays the fixture |

What you can import from core: `services.llm`, `services.stt`, `services.storage`, `calls` (core/calls.ts),
`scoreCall` (modules/scoring), `createPersona` (modules/personas).

Try it now: sign in, then `POST /api/live/dev/simulate`, and watch `/ws/live/active`. Or open `/live` in
the web app with `NEXT_PUBLIC_USE_MOCKS=false`.
