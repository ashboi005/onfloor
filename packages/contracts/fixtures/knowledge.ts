import type { KnowledgeSnippet, KnowledgeSource } from "../src";

export const knowledgeSources: KnowledgeSource[] = [
  { scope: "org_docs", scopeKey: "", source: "playbook", title: "OnFloor Ads playbook", chunks: 9, updatedAt: "2026-10-10T08:00:00.000Z" },
];

export const knowledgeSnippets: KnowledgeSnippet[] = [
  {
    id: "snip_1",
    text: "## Competitor facts\n\n- **Zestify** advertises an \"8% commission\", but adds a **6% listing fee** on every order, so the real total is **about 14%**, against OnFloor's flat 12%.",
    source: "playbook",
    title: "OnFloor Ads playbook",
    score: 0.78,
    meta: { chunk: 5 },
  },
  {
    id: "snip_2",
    text: "## Activation and timelines\n\n- **Standard activation is 3 working days** from the signed upgrade.\n- **Next-day activation is not standard and needs manager approval.**",
    source: "playbook",
    title: "OnFloor Ads playbook",
    score: 0.71,
    meta: { chunk: 3 },
  },
];
