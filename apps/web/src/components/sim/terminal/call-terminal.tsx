"use client";

import type { Persona } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@onfloor/ui/components/card";
import { AlertTriangle, Clock3, Globe, Headphones, Languages, Mic, MicOff, Phone, RotateCcw, Signal, Sparkles, UserRound, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { SimCall } from "@/hooks/use-sim-call";
import { subtitleText, useSubtitleMode } from "@/lib/subtitles";

type CallTerminalProps = {
  persona: Persona;
  call: SimCall;
  onEnd: () => void;
  onScorecard: () => void;
  onRetry: () => void;
};

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusLabel(call: SimCall) {
  if (call.status === "connecting") return "Connecting to customer";
  if (call.status === "ending") return "Wrapping up";
  if (call.status === "ended") return call.endReason === "persona_hung_up" ? "Customer ended the call" : "Call ended";
  if (call.personaState === "thinking") return "Customer is thinking";
  if (call.personaState === "speaking") return "Customer is speaking";
  return "Live call";
}

function Waveform({ level, color }: { level: number; color: string }) {
  return (
    <div className="flex h-8 items-center gap-0.5" aria-label={`${Math.round(level * 100)} percent audio level`}>
      {Array.from({ length: 18 }, (_, index) => {
        const distance = Math.abs(index - 8.5) / 8.5;
        const height = Math.max(3, 5 + level * 25 * (1 - distance * 0.55) * (0.65 + ((index * 13) % 7) / 10));
        return <span key={index} className="w-1 rounded-full transition-all duration-100" style={{ height, backgroundColor: color, opacity: level > 0.02 ? 0.4 + (1 - distance) * 0.6 : 0.2 }} />;
      })}
    </div>
  );
}

export function CallTerminal({ persona, call, onEnd, onScorecard, onRetry }: CallTerminalProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lastPatience = useRef(call.patience);
  const patienceDropped = call.patience < lastPatience.current;
  lastPatience.current = call.patience;
  const [subtitleMode, setSubtitleMode] = useSubtitleMode();

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [call.turns.length, call.partialAgentText]);

  const patienceTone = call.patience > 60 ? "bg-success" : call.patience > 30 ? "bg-warning" : "bg-destructive";
  const micDenied = call.mic === "denied";
  const hasRetryableError = Boolean(call.error?.retryable);

  return (
    <Card className="flex h-full min-h-0 flex-col border-0 bg-transparent ring-0">
      <CardHeader className="border-b border-border bg-card px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground">
              <UserRound className="size-5" />
              {call.status === "live" && <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-success ring-2 ring-card" />}
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{persona.name}</CardTitle>
              <p className="truncate text-xs text-muted-foreground">{persona.role}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{persona.business.city ?? "India"}</span><span>·</span><span>{persona.archetype.replaceAll("_", " ")}</span>
              </div>
            </div>
          </div>
          <span className={`shrink-0 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${call.status === "ended" ? "border-warning bg-card text-warning" : call.status === "error" ? "border-destructive bg-card text-destructive" : "border-success bg-card text-success"}`}>
            {call.status === "live" ? "Live" : call.status}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="border border-border bg-card p-2"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Elapsed</span><strong className="mt-1 block font-mono text-sm">{formatTime(call.elapsedMs)}</strong></div>
          <div className="border border-border bg-card p-2"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Remaining</span><strong className="mt-1 block font-mono text-sm">{formatTime(call.remainingMs)}</strong></div>
          <div className="border border-border bg-card p-2"><span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Language</span><strong className="mt-1 block text-sm uppercase">{persona.language}</strong></div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-hidden p-5">
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className={`border border-border bg-card p-4 ${patienceDropped ? "animate-pulse" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-warning" /> Customer patience</div>
              <span className={`font-mono text-sm font-semibold ${call.patience <= 30 ? "text-destructive" : call.patience <= 60 ? "text-warning" : "text-success"}`}>{Math.round(call.patience)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden bg-muted"><div className={`h-full transition-all duration-500 ${patienceTone}`} style={{ width: `${call.patience}%` }} /></div>
            <p className="mt-2 text-[10px] text-muted-foreground">{call.patience <= 30 ? "You are close to losing this customer." : call.patience <= 60 ? "Stay direct and keep the conversation moving." : "Good pace. Keep listening for the next ask."}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border bg-card p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Agent mic</span><Mic className="size-3.5 text-info" /></div>
              <Waveform level={call.micLevel} color="var(--foreground)" />
              <p className="text-[10px] text-muted-foreground">{call.mic === "listening" ? "Listening" : call.mic}</p>
            </div>
            <div className="border border-border bg-card p-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Customer voice</span><Volume2 className="size-3.5 text-muted-foreground" /></div>
              <Waveform level={call.personaLevel} color="var(--foreground)" />
              <p className="text-[10px] text-muted-foreground">{statusLabel(call)}</p>
            </div>
          </div>

          {micDenied && (
            <div className="flex items-start gap-3 border border-destructive bg-card p-3 text-xs text-destructive">
              <MicOff className="mt-0.5 size-4 shrink-0" />
              <div><strong>Microphone access is blocked.</strong><p className="mt-1 text-destructive">Allow microphone access in your browser, then retry the workspace.</p></div>
            </div>
          )}
          {call.error && (
            <div className="flex items-start gap-3 border border-destructive bg-card p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1"><strong>{call.error.message}</strong>{hasRetryableError && <p className="mt-1 text-destructive">You can retry the voice connection without leaving the call.</p>}</div>
              {hasRetryableError && <Button type="button" size="xs" variant="outline" onClick={onRetry}><RotateCcw className="size-3" /> Retry</Button>}
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Languages className="size-3" /> Subtitles</span>
              <div className="flex overflow-hidden border border-border text-[10px]">
                <button type="button" onClick={() => setSubtitleMode("raw")} className={`px-2.5 py-1 font-medium transition ${subtitleMode === "raw" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Original</button>
                <button type="button" onClick={() => setSubtitleMode("english")} className={`px-2.5 py-1 font-medium transition ${subtitleMode === "english" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>English</button>
              </div>
            </div>
            <div ref={transcriptRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {call.turns.length === 0 && <div className="flex h-full min-h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground"><Signal className="mb-3 size-5 animate-pulse" /><p>Waiting for the customer to speak…</p></div>}
              {call.turns.map((turn) => {
                const { text, pending } = subtitleText(turn, subtitleMode);
                return (
                  <div key={turn.id} className={`flex gap-3 ${turn.speaker === "agent" ? "flex-row-reverse text-right" : ""}`}>
                    <div className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${turn.speaker === "agent" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>{turn.speaker === "agent" ? "A" : "C"}</div>
                    <div className={`max-w-[85%] ${turn.speaker === "agent" ? "items-end" : "items-start"}`}>
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><span>{turn.speaker === "agent" ? "You" : persona.name.split(" ")[0]}</span><span>{formatTime(turn.startMs)}</span></div>
                      <p className={`border px-3 py-2 text-sm leading-relaxed ${turn.speaker === "agent" ? "border-primary bg-card" : "border-input/20 bg-card"} ${pending ? "italic opacity-60" : ""}`}>
                        {text}
                        {pending && <span className="ml-2 text-[10px] not-italic text-muted-foreground">translating…</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
              {call.partialAgentText && <div className="flex flex-row-reverse gap-3 text-right opacity-60"><div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-[9px] font-bold text-info">A</div><p className="max-w-[85%] border border-dashed border-primary px-3 py-2 text-sm italic">{call.partialAgentText}…</p></div>}
            </div>
          </div>

          {call.status === "ended" && (
            <div className="flex items-center justify-between gap-3 border border-warning bg-card p-3 text-xs">
              <div><strong>{call.endReason === "persona_hung_up" ? `${persona.name.split(" ")[0]} hung up 😬` : "Call ended"}</strong><p className="mt-1 text-muted-foreground">Review your performance while the scorecard is prepared.</p></div>
              <Button type="button" size="sm" onClick={onScorecard}>View scorecard</Button>
            </div>
          )}
        </div>
      </CardContent>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> {statusLabel(call)}</div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={call.status === "ended" || call.status === "ending"} onClick={() => call.setMuted(!call.muted)}>{call.muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}{call.muted ? "Unmute" : "Mute"}</Button>
          <Button type="button" size="sm" variant="destructive" disabled={call.status === "ended" || call.status === "ending"} onClick={onEnd}><Phone className="size-3.5" /> End call</Button>
        </div>
      </div>
    </Card>
  );
}
