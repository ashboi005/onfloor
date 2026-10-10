"use client";

/**
 * /simulator/new?replay=<callId>: starts a sim session that replays a live call's
 * extracted persona, then forwards to the workspace. OWNER: Harnoor.
 */
import type { Route } from "next";
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
    });
  }, [callId, replay, router]);

  if (!callId) return <p className="p-8">Missing ?replay=&lt;callId&gt;</p>;
  if (replay.error) return <p className="p-8 text-red-500">{replay.error.message}</p>;
  return <p className="p-8">Loading the customer from that call…</p>;
}

export default function NewSimPage() {
  return (
    <Suspense>
      <Replay />
    </Suspense>
  );
}
