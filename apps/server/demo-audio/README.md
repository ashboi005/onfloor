# Real teammate demo recordings

This directory is reserved for the two real demo calls required by the live spec.
No real recordings were available in this development session; none are fabricated.

Record on the demo laptop with a headset using the bridge's spike mode, or export
separated tracks from an audio editor. Keep 16 kHz PCM16LE, stereo left=agent/right=customer,
or two mono WAVs with equal sample counts. Maximum duration is ten minutes.

## Recording A: pricing objection

Suggested sequence: recording disclosure, customer commission/price objection,
agent compliant reach response, agent offers 15% discount without approval,
customer explicitly requests a campaign pause, agent closes.

Expected signals: pricing hint, discount critical warning, partial/final transcript
labels, sentiment, scorecard event and persona quoting the customer pause request.
Use the shared playbook wording where possible. Do not expect exact LLM sentiment
numbers or a particular score. A real scoring engine is an independent team gate.

## Recording B: trust and interruption

Suggested sequence: disclosure, skeptical Hinglish objection, compliant agent
response, caller interruption, >6 seconds silence, agent guarantee of orders/refund,
customer explicitly requests a numeric monthly budget, normal close.

Expected signals: relevant playbook hint, warn-level orders guarantee and
critical refund warning, dead-air metric, correctly separated overlap, persona
with genuine quotations and only supported CRM changes.

For each recording, save a neighboring Markdown note with:

- Filenames and channel mapping.
- Actual sample count, sample rate, encoding and measured duration.
- Recording date, operator and consent to use the teammate demo audio.
- Approximate time offsets, actual spoken trigger lines and expected signals.
- Replayed OnFloor callId, observed hint latency, transcript/event inspection,
  recording URLs, scorecard and persona linkage.
- Three rehearsal outcomes, including the WAV fallback.

These scripts are recording prompts, not existing assets or verification results.
Keep account/session secrets out of these notes. Upload through the authenticated
`POST /api/live/calls/replay-file` route; see the live module README for commands.
