import { createKnowledgeService, type KnowledgeService } from "./knowledge";
import { createLlmService, type LlmService } from "./llm";
import { createStorageService, type StorageService } from "./storage";
import { createSttService, type SttService } from "./stt";
import { createTtsService, type TtsService } from "./tts";

/**
 * The external-integration seam.
 * Everything that leaves the process goes through here. Resolved lazily; tests or
 * stubs can swap a whole provider with `overrideServices()`. No call site builds a client.
 */
export interface Services {
  llm: LlmService;
  tts: TtsService;
  stt: SttService;
  storage: StorageService;
  knowledge: KnowledgeService;
}

const factories: { [K in keyof Services]: () => Services[K] } = {
  llm: createLlmService,
  tts: createTtsService,
  stt: createSttService,
  storage: createStorageService,
  knowledge: createKnowledgeService,
};

const instances: Partial<Services> = {};
const overrides: Partial<Services> = {};

function resolve<K extends keyof Services>(key: K): Services[K] {
  const value = overrides[key] ?? instances[key] ?? factories[key]();
  instances[key] ??= value;
  return value;
}

export const services: Services = {
  get llm() {
    return resolve("llm");
  },
  get tts() {
    return resolve("tts");
  },
  get stt() {
    return resolve("stt");
  },
  get storage() {
    return resolve("storage");
  },
  get knowledge() {
    return resolve("knowledge");
  },
};

export function overrideServices(next: Partial<Services>): void {
  Object.assign(overrides, next);
}

export type { ChatMessage, LlmJob, LlmProvider } from "./llm";
export type { KnowledgeScope, Snippet } from "./knowledge";
