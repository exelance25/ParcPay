# Arc Microgrants — Built with Arc Studio: ParcPay

**One payment. Many recipients. One signature.**

| | |
|---|---|
| Live app | https://parc-pay.vercel.app |
| Arc Studio project | https://studio.arc.io/app/20fb85ad-d4bd-4d8e-9667-fbe9f4423bef |
| Repo | https://github.com/exelance25/ParcPay |
| Builder | https://github.com/exelance25 |
| Contract (Arc Mainnet) | `0x000000001a03e01a185A6Ab09cd14AeE2398b55c` — https://explorer.arc.io/address/0x000000001a03e01a185A6Ab09cd14AeE2398b55c |
| Example tx (one-signature split, 0.2 + 0.2 USDC + 0.001 fee) | https://explorer.arc.io/tx/0xe9c9c4d933c25972e57e03c34c3f6c7496ad5914f531007108d5621331a23dfb |
| Other mainnet txs | deploy `0x5af591b7fba68ecc1056c780de69a926a7c11516a853392376d40309dcf7cd5f` · split `0x7116b264d20b8a678704be10a8041fa311e7b3e66301151cfa8aa81e5950c7e6` |

## What it does
ParcPay is a USDC payment router on Arc Mainnet:
- **Split payments** — pay up to 50 recipients exact amounts or percentages in one atomic transaction; flat 0.001 USDC fee to the treasury, capped by a payer-signed `maxFee`.
- **One signature** — USDC approve + split are batched into a single transaction through Arc's `Multicall3From` predeploy (the wallet stays `msg.sender`; all-or-nothing).
- **Scheduled & recurring payments** — the payer signs one EIP-712 order (payroll, rent, subscriptions, instalments); recipients collect each run when due. The contract verifies the signature, amounts, recipients, dates and fee cap onchain; cancel / revoke-all are onchain.
- **Invoice memos** stored in the `Paid` event; shareable payment-request links that only prefill (never auto-pay).

## How Arc Studio was used
- The project started in Arc Studio: it generated the first SplitPay contract, its Foundry suite (42 tests) and the React/wagmi app (kept in `contracts/legacy/` and `legacy-ui/`).
- ParcPay v2 (scheduled orders, fee/treasury, one-signature flow, new UI) was then developed with help from an external AI coding assistant, and the repo was brought back into Arc Studio.
- In Arc Studio we compiled the contracts, ran the 37-test Foundry suite (fuzz, EIP-1271, EIP-712, recurring payroll), ran a security review (`docs/security-review.md`, 0 critical) and verified the mainnet deployment and USDC movement read-only.

## Limits
Unaudited; use small amounts. Scheduled runs are pull-based (no keeper bot yet). Cross-chain (CCTP) not in this release.
