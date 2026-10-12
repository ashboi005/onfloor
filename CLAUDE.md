# OnFloor: agent notes

Hackathon monorepo (Bun workspaces): Next 16 web, Elysia API, Drizzle/Postgres, Better Auth.
Specs live in `docs/specs/` (00 overview, 01 contracts, 02–05 per person, 06 future scope). Follow them.

Rules:
- Shared shapes come from `@onfloor/contracts` (Zod). Never redeclare a type that exists there. Don't edit
  `packages/contracts` without the owner (Ashwath) agreeing; fixtures must keep passing their schemas.
- Web UI never calls `fetch`/`WebSocket` directly: use `@/lib/api` hooks, `useSimCall`, `useLiveCall`.
  Everything must keep working with `NEXT_PUBLIC_USE_MOCKS=true`.
- Server: external calls go through `services` (`apps/server/src/core/services`); SQL lives in repos
  (`core/calls.ts`, module `index.ts` files); expected failures throw `AppError`.
- Never add a catch-all `GET /*` route to Elysia (it swallows `/api/auth/*`).
- Env vars are declared in `.env.schema` (varlock); run `bun run env:generate` after editing one.
- Stay in your owner's folders (see `docs/specs/00-overview.md` §2 and the README repo layout). No tests required; run `bun run check-types`.
