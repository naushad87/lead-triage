# Lead Triage

A WhatsApp-style lead triage prototype that takes 5 messy inbound messages and instantly classifies each one with lead category, urgency, suggested next action, and a draft human reply — powered by OpenAI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/lead-triage run dev` — run the frontend (port 26134)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: React + Vite, TanStack Query, shadcn/ui, Tailwind CSS
- AI: OpenAI via Replit AI Integrations (no user API key needed)
- Validation: Zod (`zod/v4`)
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `artifacts/api-server/src/routes/triage.ts` — triage route (calls OpenAI)
- `artifacts/lead-triage/src/` — React frontend
- `lib/integrations-openai-ai-server/` — OpenAI SDK wrapper

## Architecture decisions

- Stateless triage: no DB needed — each request sends messages, gets results, done
- Single POST `/api/triage` endpoint accepts up to 5 messages, returns structured JSON per message
- OpenAI `gpt-5-mini` with a structured JSON system prompt ensures reliable triage output
- All CSS variables set to a dark high-contrast palette; no DB or auth required for the prototype

## Product

Users paste 5 inbound messages (pre-filled with realistic messy examples), click "Triage All", and see each message expanded with: lead category badge, urgency indicator, suggested next action, and a copyable draft reply.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Re-run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI spec change
- `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY` are auto-set by Replit — do not manually configure

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
