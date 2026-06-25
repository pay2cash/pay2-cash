# pay2 Cash

**Payments infrastructure for AI agents.** pay2 Cash lets an AI agent pay on a
user's behalf — over **UPI (₹)** in India or a **virtual card (€)** in the EU —
within a limit the user authorises once. It's two-sided: consumers whose agents
spend, and merchants who get paid via split settlement.

It ships as an **MCP server** any agent can call, a zero-dependency **TypeScript
SDK**, and a website.

- 🌐 Site — **https://pay2.cash**
- 🔌 MCP server — **https://mcp.pay2.cash** (`POST /mcp`, JSON-RPC 2.0)
- 📦 SDK — **[`@pay2cash/sdk`](https://www.npmjs.com/package/@pay2cash/sdk)**
- 🤖 Agent manifest — https://pay2.cash/agent.txt

---

## Why

AI agents can browse and decide, but they can't safely hold your money. Hand an
agent your card and a retry loop can drain it; a misread "$29/mo" becomes a
yearly charge. pay2 Cash gives the agent a **scoped, single-purpose spend
credential** instead of your account:

- **Hard limits, not promises** — the rail itself declines over-spend. The
  blast radius of a ₹1,500 mandate is ₹1,500.
- **Single-use cards** — a virtual card is issued for one purchase and
  **cancelled after capture**. Nothing to leak, nothing to reuse.
- **Propose → confirm** — the agent proposes a specific purchase; money only
  moves on an explicit human (or pre-authorised mandate) yes.
- **Multi-rail, multi-currency** — UPI for India, Stripe Issuing cards for the
  EU, behind one `agent_pay` interface.

---

## Architecture

```
  model / agent
       │  (MCP, JSON-RPC over HTTPS)
       ▼
  pay2 Cash MCP  ──────────────┐
   • demand side: mandates,     │ split-settles
     single-use cards, intents  ▼
   • supply side: merchants   PayU (UPI Reserve Pay + Split Settlement)
                              Stripe Issuing (single-use virtual cards, EU/€)
```

- **Demand side** — `onboard_user`, then either a **UPI Reserve Pay mandate**
  (authorise a spend limit once, agent spends within it) or a **virtual card**
  the agent presents at any card checkout.
- **Supply side** — `onboard_merchant` registers an operator; when an agent
  pays them, the payment **split-settles** into the operator's share plus a
  platform fee (in basis points).
- **Money safety** — amounts are always integer **paise**; the propose →
  confirm flow keeps a human (or an explicit mandate) in the loop.

---

## MCP tools

| Tool | Side | Purpose |
|---|---|---|
| `onboard_user` | demand | Register a user by UPI VPA |
| `create_mandate` | demand | UPI Reserve Pay — authorise a spend limit once |
| `issue_card` | demand | Issue a scoped virtual card token |
| `agent_pay` | demand | Spend against an active mandate (splits if a merchant is named) |
| `mandate_status` | demand | Limit / spent / remaining |
| `onboard_merchant` | supply | Register an operator for split settlement |
| `merchant_status` | supply | Merchant state + fee |
| `create_payment_intent` | both | Propose a specific purchase (`upi_mandate` / `upi_intent` / `card`) |
| `confirm_payment_intent` | both | Capture it (single-use cards are cancelled here) |

Full contract: [`worker/src/contract.ts`](worker/src/contract.ts).

---

## Quickstart

### Connect an agent (Claude Code / Cursor / any MCP client)

```bash
claude mcp add --transport http pay2cash https://mcp.pay2.cash/mcp
```

Then ask your agent to onboard you and authorise a spend limit. The tools above
become available automatically. For non-MCP setups, see
https://pay2.cash/get-started.

### Use the SDK

```bash
npm install @pay2cash/sdk
```

```ts
import { Pay2Cash, toPaise } from "@pay2cash/sdk";

const p2c = new Pay2Cash(); // defaults to https://mcp.pay2.cash

const user = await p2c.onboardUser({ vpa: "alice@okhdfcbank" });

// authorise ₹1000 once
const mandate = await p2c.createMandate({
  userId: user.userId,
  limitPaise: toPaise(1000),
});

// agent spends within the limit, paying an onboarded merchant
const pay = await p2c.agentPay({
  mandateId: mandate.mandateId,
  amountPaise: toPaise(499),
  merchantId: "<merchant-id>",
});
console.log(pay.split); // { operatorSharePaise, platformFeePaise, merchantId }
```

Full SDK docs: [`packages/sdk/README.md`](packages/sdk/README.md).

---

## Repository layout

```
src/app/             Next.js site (home, personal, companies, merchant, about, get-started)
src/components/       Shared site nav + footer (shadcn / Tailwind v4)
worker/src/
  contract.ts        Tool contract + types (source of truth)
  mcp.ts             JSON-RPC server + tool registry
  service.ts         Business logic
  cards.ts           Stripe Issuing (issue + cancel single-use cards)
  payu.ts            PayU integration (UPI / split settlement)
  db/schema.ts       Drizzle schema (Cloudflare D1)
worker/drizzle/      Hand-written migrations
packages/sdk/        @pay2cash/sdk (zero-dependency TS SDK)
public/agent.txt     Agent-facing manifest
```

Stack: **Next.js 16** (static export) + **Cloudflare Workers / D1** + **Drizzle**,
deployed via **Wrangler**.

---

## Develop

```bash
# Site
npm run dev                                   # http://localhost:3000

# Worker (MCP server)
cd worker && npx wrangler dev
```

## Deploy

```bash
# Worker
cd worker && npx wrangler deploy
cd worker && npx wrangler d1 migrations apply pay2cash --remote

# Site (run from repo root — Next static export → out/)
npm run build && npx wrangler deploy -c wrangler.site.jsonc
```

Secrets are set with `npx wrangler secret put NAME` and live in a gitignored
`.env` — never commit credentials.

---

## Status

| Capability | State |
|---|---|
| MCP server, all 9 tools, split math, payment-intent flow | ✅ live |
| Stripe Issuing single-use virtual cards (EU/€) — issue **and** cancel | ✅ real |
| PayU payment links (India/₹) | ✅ real |
| UPI Reserve Pay mandates, UPI intent/collect, child-merchant settlement | 🚧 stubbed (pending PayU keys + Reserve Pay / Split Settlement scopes) |

## Markets

**EU (€)** via Stripe Issuing and **India (₹)** via UPI/PayU today; **US** later
via a US entity. Unlike single-rail, US-card-only competitors, pay2 Cash is built
multi-rail and multi-currency from the start — and UPI mandates are a real,
regulated, in-production agent-payment primitive no card-only platform can match.

## License

Proprietary — © pay2 Cash. All rights reserved.
