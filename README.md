# ParcPay — one payment, many recipients, one signature (Arc)

> **Built with [Arc Studio](https://studio.arc.io)** for the Arc Mainnet micro-grant. Unaudited — use small amounts.

ParcPay is a USDC payment router on **Arc**, built in Arc Studio.

- **Split & send** — pay 1–50 recipients exact amounts (or percentages) in one atomic transaction. Flat **0.001 USDC** fee to the treasury.
- **Scheduled payments ("session key")** — sign one EIP-712 order today; when it's due, the recipient (or anyone) triggers it. The contract verifies the signature onchain; recipients, amounts, dates, fee cap and expiry can't be changed.
- **Payroll & subscriptions** — the same order repeats every N days for M runs. Cancel one order or revoke all onchain.
- **Invoices** — 32-byte memo stored in the `Paid` event; shareable payment-request links.
- **Games & NFTs** — prize pools and royalty splits in one tx.
- **1 signature** — approve + pay are batched into one transaction through Arc's `Multicall3From` predeploy (wallet stays `msg.sender`; all-or-nothing).

| | |
|---|---|
| Contract | `0x000000001a03e01a185A6Ab09cd14AeE2398b55c` — Arc Testnet ✅ live · Arc Mainnet ⏳ not deployed yet (same address via CREATE2) |
| USDC | `0x3600000000000000000000000000000000000000` |
| Treasury / owner | `0x9A5f2d1066D2a265EeB82baa7D6038Ca92469858` |
| Fee | 0.001 USDC per payment (cap 0.10 USDC, payer-signed `maxFee`) |

## Run locally (Windows)

1. Double-click **`start-test.bat`** → opens http://localhost:5173 on Arc Testnet.
2. Get testnet USDC at https://faucet.circle.com (Arc Testnet).
3. If the contract isn't on testnet yet: **Contract → Deploy ParcPay** (one wallet tx), or `deploy\deploy.ps1 -Network testnet`.
4. For mainnet: `start-mainnet.bat` (real USDC).

## Tests

```bash
forge test --match-contract ParcPayTest          # 37 tests incl. fuzz, EIP-1271, EIP-3009
anvil --chain-id 5042002 &  node scripts/e2e-local.mjs $(cat deploy/salt.txt)
```

Security notes: `docs/security-audit-v2.md` · Mainnet readiness & GO/NO-GO: `docs/mainnet-readiness.md` · GitHub: `docs/github-push.md`.

## Mainnet checklist

1. `start-mainnet.bat` → Contract page → **Deploy ParcPay** with your own wallet (≈0.2 USDC gas). Address must equal `0x000000001a03e01a185A6Ab09cd14AeE2398b55c`.
2. Contract page shows: treasury `0x9A5f…9858`, fee 0,001 USDC, status Active.
3. Smoke test: split 0.5 + 0.5 USDC between two of your own addresses; check the explorer.
4. Optional: transfer ownership to a multisig (`transferOwnership` → `acceptOwnership`).
5. Host: `npm run build` → deploy `dist/` (Vercel/Netlify static, no custom domain needed).

## Not in this release

Cross-chain (CCTP) routes, EIP-3009 one-signature UI, keeper bot for scheduled orders.

*Independent project — not an official Arc or Circle product.*
