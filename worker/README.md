# pay2-cash worker

Cloudflare Worker that exposes the pay2-cash product to AI agents over **MCP**, backed by
**PayU UPI Reserve Pay** for the actual money movement. We never custody funds — a user
authorises a spend limit once, and an agent spends within it.

```
  AI model / agent  ──POST /mcp──▶  this Worker (MCP tools)  ──▶  PayU Reserve Pay
                                         │
                                         ▼
                                    D1 (users, mandates, payments)
```

## Layout

- `src/contract.ts` — the tool contract (product's public API surface)
- `src/mcp.ts` — MCP server (JSON-RPC over HTTP, zero deps)
- `src/service.ts` — business logic
- `src/payu.ts` — PayU client (**stubbed** — wire real keys/endpoints here)
- `src/db/` — Drizzle schema + D1 client

## MCP tools

`onboard_user` · `create_mandate` · `agent_pay` · `mandate_status`

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars      # then fill in PayU test keys

npx wrangler d1 create pay2cash     # paste the id into wrangler.jsonc
npm run db:generate                 # generate migration from the Drizzle schema
npm run db:apply:local              # apply to local D1

npm run dev                         # serves http://localhost:8787
```

Health check: `curl localhost:8787/`
List MCP tools:
```bash
curl -s localhost:8787/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## What's stubbed (next steps)

1. **`src/payu.ts`** — replace `createMandate` / `debit` stubs with real PayU Reserve Pay
   calls once agentic payments are confirmed enabled on the account.
2. **`/payu/webhook`** in `src/index.ts` — verify the PayU signature before activating a
   mandate (currently activates on any `{mandateId}` for local testing).
