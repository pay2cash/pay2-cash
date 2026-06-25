# @pay2cash/sdk

TypeScript SDK for the **pay2 Cash** agentic-payments MCP. Let an AI agent pay on a
user's behalf over **UPI (₹)** or a **virtual card (€)**, within a limit the user
authorises once — and onboard merchants who get paid via split settlement.

Zero dependencies. Works in Node 18+, browsers, and Cloudflare Workers.

## Install

```bash
npm install @pay2cash/sdk
```

## Usage

```ts
import { Pay2Cash, toPaise } from "@pay2cash/sdk";

const p2c = new Pay2Cash(); // defaults to https://mcp.pay2.cash

// 1. Onboard a user by their UPI VPA
const user = await p2c.onboardUser({ vpa: "alice@okhdfcbank" });

// 2. They authorise a spend limit once (UPI Reserve Pay mandate)
const mandate = await p2c.createMandate({
  userId: user.userId,
  limitPaise: toPaise(1000), // ₹1000
});
// ...user approves in their UPI app...

// 3. The agent spends within the limit, paying an onboarded merchant
const pay = await p2c.agentPay({
  mandateId: mandate.mandateId,
  amountPaise: toPaise(499),
  merchantId: "<merchant-id>",
});
console.log(pay.split); // { operatorSharePaise, platformFeePaise, merchantId }
```

### Issue a virtual card instead (EUR)

```ts
const card = await p2c.issueCard({
  userId: user.userId,
  limitPaise: 5000, // card-currency minor units
  provider: "stripe",
});
console.log(card.last4);
```

### Onboard a merchant (supply side)

```ts
const merchant = await p2c.onboardMerchant({
  name: "CiCi Label",
  settleVpa: "cicilabel@hdfcbank",
  platformFeeBps: 250, // 2.5%
});
```

## API

| Method | Returns |
|---|---|
| `onboardUser({ vpa, email? })` | `{ userId, vpa }` |
| `createMandate({ userId, limitPaise, merchant?, expiresAt? })` | `{ mandateId, status, approvalUrl? }` |
| `issueCard({ userId, limitPaise, provider? })` | `{ cardId, provider, cardToken, last4?, status, limitPaise }` |
| `agentPay({ mandateId, amountPaise, merchantId? })` | `{ paymentId, status, remainingPaise, split? }` |
| `mandateStatus(mandateId)` | `{ status, limitPaise, spentPaise, remainingPaise }` |
| `onboardMerchant({ name, settleVpa, platformFeeBps? })` | `{ merchantId, status, payuChildId?, platformFeeBps }` |
| `merchantStatus(merchantId)` | `{ name, status, platformFeeBps }` |
| `listTools()` | the MCP tool list |

All amounts are in **paise** (integer). Use `toPaise(rupees)` / `toRupees(paise)` helpers.

## Options

```ts
new Pay2Cash({
  baseUrl: "https://mcp.pay2.cash", // MCP server base URL
  fetch: customFetch,                // optional fetch implementation
});
```

## Links

- Website: https://pay2.cash
- MCP server: https://mcp.pay2.cash
- For non-SDK setups, point any MCP client at the MCP url, or use `skill.md` — see https://pay2.cash/get-started
