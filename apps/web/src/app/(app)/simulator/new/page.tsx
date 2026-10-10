"use client";

/**
 * /simulator/new?replay=<callId>: starts a sim session that replays a live call's
 * extracted persona, then forwards to the workspace. OWNER: Harnoor.
 */
import type { Route } from "next";
import { Card, CardContent } from "@onfloor/ui/components/card";
import { LoaderCircle, Radio, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

import { useReplayCall } from "@/lib/api";
import { saveSimSession } from "@/lib/sim-session";

function Replay() {
  const router = useRouter();
  const callId = useSearchParams().get("replay");
  const replay = useReplayCall();
  const fired = useRef(false);

  useEffect(() => {
    if (!callId || fired.current) return;
    fired.current = true;
    replay.mutateAsync(callId).then((session) => {
      saveSimSession(session);
      router.replace(`/simulator/${session.callId}` as Route);
    }).catch(() => {
      // The mutation error is rendered below.
    });
  }, [callId, replay, router]);

  if (!callId) return <div className="mx-auto max-w-xl p-8"><Card><CardContent className="p-6"><p className="text-sm text-red-300">Missing `?replay=&lt;callId&gt;`.</p></CardContent></Card></div>;
  if (replay.error) return <div className="mx-auto max-w-xl p-8"><Card className="border-red-400/30"><CardContent className="p-6"><div className="flex items-start gap-3"><RotateCcw className="mt-0.5 size-5 text-red-300" /><div><h1 className="font-semibold">Replay is not ready</h1><p className="mt-2 text-sm text-muted-foreground">{replay.error.message}</p><p className="mt-4 text-xs text-muted-foreground">The live call needs an extracted persona before it can be replayed.</p></div></div></CardContent></Card></div>;
  return <div className="flex min-h-[70vh] items-center justify-center p-8"><Card className="w-full max-w-md"><CardContent className="flex flex-col items-center p-8 text-center"><div className="relative mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary"><Radio className="size-6" /><LoaderCircle className="absolute -right-2 -top-2 size-5 animate-spin" /></div><h1 className="text-xl font-semibold">Preparing the replay</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Loading the customer’s extracted persona and opening a new simulator session…</p></CardContent></Card></div>;
}

export default function NewSimPage() {
  return (
    <Suspense>
      <Replay />
    </Suspense>
  );
}
