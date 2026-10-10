"use client";

import type { TranscriptTurn } from "@onfloor/contracts";
import { useCallback, useEffect, useState } from "react";

/**
 * Raw transcript vs English subtitles, shared by the simulator, live dashboard and scorecard.
 * The choice is remembered per browser (localStorage, best-effort).
 *
 *   const [mode, setMode] = useSubtitleMode();
 *   const { text, pending } = subtitleText(turn, mode);
 */
export type SubtitleMode = "raw" | "english";
const KEY = "onfloor:subtitle-mode";

export function useSubtitleMode(): [SubtitleMode, (mode: SubtitleMode) => void] {
  const [mode, setModeState] = useState<SubtitleMode>("raw");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "raw" || saved === "english") setModeState(saved);
    } catch {}
  }, []);
  const setMode = useCallback((next: SubtitleMode) => {
    setModeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);
  return [mode, setMode];
}

/**
 * What to show for a turn. In English mode a Hindi/Hinglish turn whose translation hasn't arrived
 * yet shows its raw text with `pending: true` (render it dimmed / with "translating…").
 */
export function subtitleText(turn: TranscriptTurn, mode: SubtitleMode): { text: string; pending: boolean } {
  if (mode === "raw") return { text: turn.text, pending: false };
  return turn.translation ? { text: turn.translation, pending: false } : { text: turn.text, pending: true };
}
