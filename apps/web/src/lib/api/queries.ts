"use client";

import type { CallKind, PersonaSource, StartSim } from "@onfloor/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./instance";

/**
 * The data hooks the UI uses. Same hooks in mock and real mode.
 *   const { data, isPending, error } = useScenarios();
 */
export const queryKeys = {
  me: ["me"] as const,
  scenarios: ["scenarios"] as const,
  personas: (source?: PersonaSource) => ["personas", source ?? "all"] as const,
  persona: (id: string) => ["persona", id] as const,
  calls: (kind?: CallKind) => ["calls", kind ?? "all"] as const,
  call: (id: string) => ["call", id] as const,
  scorecard: (id: string) => ["scorecard", id] as const,
  activeLive: ["live", "active"] as const,
};

export const useMe = () => useQuery({ queryKey: queryKeys.me, queryFn: () => api.me() });
export const useScenarios = () => useQuery({ queryKey: queryKeys.scenarios, queryFn: () => api.scenarios() });
export const usePersonas = (source?: PersonaSource) =>
  useQuery({ queryKey: queryKeys.personas(source), queryFn: () => api.personas(source) });
export const usePersona = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.persona(id ?? ""), queryFn: () => api.persona(id!), enabled: !!id });
export const useCalls = (kind?: CallKind) =>
  useQuery({ queryKey: queryKeys.calls(kind), queryFn: () => api.calls(kind) });
export const useCall = (id: string | undefined) =>
  useQuery({ queryKey: queryKeys.call(id ?? ""), queryFn: () => api.call(id!), enabled: !!id });

/** `data === null` means "still scoring": it polls every 2s until the card exists. */
export const useScorecard = (callId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.scorecard(callId ?? ""),
    queryFn: () => api.scorecard(callId!),
    enabled: !!callId,
    refetchInterval: (q) => (q.state.data === null ? 2000 : false),
  });

export const useActiveLiveCall = () =>
  useQuery({ queryKey: queryKeys.activeLive, queryFn: () => api.activeLiveCall(), refetchInterval: 3000 });

export function useStartSim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSim) => api.startSim(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calls"] }),
  });
}

export function useReplayCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (callId: string) => api.replayCall(callId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calls"] }),
  });
}

export const useSimulateLiveCall = () => useMutation({ mutationFn: () => api.simulateLiveCall() });
