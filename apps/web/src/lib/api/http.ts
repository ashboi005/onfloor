import {
  agentSchema,
  apiErrorSchema,
  callSchema,
  callWithTranscriptSchema,
  endSimResponseSchema,
  knowledgeSnippetSchema,
  knowledgeSourceSchema,
  knowledgeStatusSchema,
  personaSchema,
  scenarioSchema,
  scorecardSchema,
  simSessionStartSchema,
} from "@onfloor/contracts";
import { z } from "zod";
import { SERVER_URL } from "../config";
import { type ApiClient, ApiClientError } from "./client";

async function request<T>(schema: z.ZodType<T>, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiClientError(
      res.status,
      parsed.success ? parsed.data.error : { code: "HTTP_" + res.status, message: res.statusText, retryable: res.status >= 500 },
    );
  }
  return schema.parse(body);
}

const post = (body?: unknown): RequestInit => ({ method: "POST", ...(body !== undefined && { body: JSON.stringify(body) }) });
const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined)).toString();
  return s ? `?${s}` : "";
};

export const httpClient: ApiClient = {
  me: () => request(agentSchema, "/api/me"),
  scenarios: () => request(z.array(scenarioSchema), "/api/scenarios"),
  personas: (source) => request(z.array(personaSchema), `/api/personas${qs({ source })}`),
  persona: (id) => request(personaSchema, `/api/personas/${id}`),
  calls: (kind) => request(z.array(callSchema), `/api/calls${qs({ kind })}`),
  call: (id) => request(callWithTranscriptSchema, `/api/calls/${id}`),
  // 202 { status } while scoring → null (the hook keeps polling).
  scorecard: (callId) =>
    request(z.union([scorecardSchema, z.object({ status: z.string() }).transform(() => null)]), `/api/calls/${callId}/scorecard`),
  startSim: (input) => request(simSessionStartSchema, "/api/sim/sessions", post(input)),
  endSim: (callId) => request(endSimResponseSchema, `/api/sim/sessions/${callId}/end`, post()),
  simSttUrl: (callId) => request(z.object({ url: z.string() }), `/api/sim/sessions/${callId}/stt`, post()),
  replayCall: (callId) => request(simSessionStartSchema, `/api/calls/${callId}/replay`, post()),
  activeLiveCall: () => request(callSchema.nullable(), "/api/live/active"),
  simulateLiveCall: () => request(z.object({ callId: z.string() }), "/api/live/dev/simulate", post()),
  knowledgeStatus: () => request(knowledgeStatusSchema, "/api/knowledge/status"),
  knowledgeDocs: () => request(z.array(knowledgeSourceSchema), "/api/knowledge/docs"),
  uploadKnowledgeDoc: (doc) => request(z.object({ source: z.string(), chunks: z.number() }), "/api/knowledge/docs", post(doc)),
  deleteKnowledgeDoc: (source) =>
    request(z.object({ removed: z.string() }), `/api/knowledge/docs/${encodeURIComponent(source)}`, { method: "DELETE" }),
  searchKnowledge: (q, scope, key) => request(z.array(knowledgeSnippetSchema), `/api/knowledge/search${qs({ q, scope, key })}`),
};
