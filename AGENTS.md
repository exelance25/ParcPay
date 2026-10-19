# ParcPay (Arc SplitPay v2)

> Built with Arc Studio — USDC split, scheduled and recurring payments on Arc.

## Current state (2026-10-18)

- **Contract:** `contracts/ParcPay.sol` (v2). Legacy v1 kept in `contracts/legacy/` (not used by the app).
- **Address (CREATE2, identical on Arc Mainnet 5042 and Arc Testnet 5042002):** `0x000000001a03e01a185A6Ab09cd14AeE2398b55c`
  - deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C`, salt `deploy/salt.txt`, init code `deploy/ParcPay.initcode.hex`
  - constructor: USDC `0x3600…0000`, treasury = owner = `0x9A5f2d1066D2a265EeB82baa7D6038Ca92469858`, fee `1000` (0.001 USDC)
  - foundry.toml uses `bytecode_hash = "none"` + `cbor_metadata = false` so the init code is reproducible. **Any change to ParcPay.sol changes the address** — re-mine the salt (`cast create2 --starts-with 00000000 --init-code-hash …`).
  - Deploy: `deploy/deploy.ps1 -Network testnet|mainnet` (Foundry keystore account, no plaintext keys).
- **Deployed:** Arc Testnet ✅ 2026-10-18 (one-click deploy from the app). First split test: tx `0xcac039585bfe55bd9e190a47c821379ec955413a8e8c2220b93e8f8674f73e59` (5 + 5 USDC, 0.001 fee → treasury). Arc Mainnet: pending.
- **Testnet burner wallet:** `src/lib/burner.ts` (only when `VITE_ARC_NETWORK=testnet`), diagnostics at `#/debug`.
- **App:** React + wagmi/viem. Network via `VITE_ARC_NETWORK` (`mainnet` default, `testnet`). Hash routes: `#/send`, `#/schedule`, `#/claim?o=…`, `#/activity`, `#/contract`. Old UI in `legacy-ui/` (not compiled).
- **Flows:** `usePay` (approve-if-needed → splitPay, EIP-5792 batch when supported, optional budget approval), `useOrders` (EIP-712 orders, share links, executeOrder/cancelOrder/revokeNoncesBelow).
- **Tests:** `forge test --match-contract ParcPayTest` (37), `node scripts/e2e-local.mjs $(cat deploy/salt.txt)` with anvil `--chain-id 5042002`.
- **Security notes:** `docs/security-audit-v2.md` · **Mainnet readiness / GO-NO-GO:** `docs/mainnet-readiness.md` · **GitHub:** `docs/github-push.md` (keep Arc Studio files!).
- **Live tests 2026-10-19 (Arc Testnet):** scheduled order run `0xe9523d7a…b267e`, cancel `0xb177d715…aba3d`; user MetaMask split `0x5cf7d372…25a6ab`.

---

## Previous notes (v1)

# Arc SplitPay

> Built with Arc Studio — money-powered apps in minutes

An atomic USDC split-payment application. One payment, multiple recipients, onchain proof.

---

## What This App Does

A payer enters a total USDC amount and distributes it to 2–10 recipients in a single atomic transaction via a smart contract. Shares are defined in basis points (10,000 = 100%). The contract either fully succeeds or fully reverts — no partial distributions.

**Core product idea**: "One payment. Multiple recipients. Onchain proof."

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS (Arc Light theme)
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry
- Chain (active): ETH Sepolia (Chain ID: 11155111)
- Chain (target): Arc Testnet (Chain ID: 5042002) — will switch when deployer faucet cap resets
- Token (ETH Sepolia): USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (6 decimals, verified)
- Token (Arc Testnet): USDC `0x3600000000000000000000000000000000000000` (6 decimals, verified)
- Toasts: Sonner

## Contract Deployments

| Network | Address | Explorer | Constructor USDC | Status |
|---------|---------|----------|-----------------|--------|
| ETH Sepolia | `0x9692f54be2921ce00a02de9ee97bfb06469c6167` | [Etherscan](https://sepolia.etherscan.io/address/0x9692f54be2921ce00a02de9ee97bfb06469c6167) | `0x1c7D4B196...` | ✅ Deployed 2026-10-17 |
| Arc Testnet | _pending_ | — | `0x3600000000...` | Faucet cap — redeploy when ready |

**Deploy TX (ETH Sepolia)**: `0x914978a3cea32ad6e9cd028b0034581b2dedd7de61a0c0023b306700a4af893f`

**To switch to Arc Testnet** (when faucet resets):
1. Ask Arc Studio: "deploy the SplitPay contract to Arc Testnet"
2. `src/contracts/splitpay-config.ts` → update `SPLITPAY_ADDRESS`
3. `src/hooks/useSplitPay.ts` → change `CHAIN_ID = arcTestnet.id` (import from `viem/chains`)
4. `src/App.tsx` → change `CHAIN_ID = arcTestnet.id`
5. `src/config.ts` → reorder chains array so `arcTestnet` comes first

## Key Files

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Main app composition root |
| `src/components/Header.tsx` | Brand header + ConnectKitButton |
| `src/components/AmountInput.tsx` | USDC amount input with live balance |
| `src/components/RecipientList.tsx` | Add/remove recipients + percentage inputs |
| `src/components/SplitPreview.tsx` | Exact onchain distribution preview |
| `src/components/TransactionPanel.tsx` | Transaction state UI (pending/success/error) |
| `src/hooks/useSplitPay.ts` | wagmi hooks for approve + splitPay execution |
| `src/utils/splitpay.ts` | Validation helpers, rounding logic, formatters |
| `src/contracts/splitpay-config.ts` | Contract address + ABI (single source of truth) |
| `contracts/SplitPay.sol` | The SplitPay smart contract |
| `contracts/test/SplitPay.t.sol` | 42 Foundry unit tests (all passing) |

## Smart Contract: SplitPay

**Key functions**:
- `splitPay(uint256 totalAmount, RecipientShare[] shares)` — atomic payment distribution
- `previewSplit(uint256 totalAmount, RecipientShare[] shares)` — pure preview (no state change)

**Security properties**:
- No owner, no admin, no upgradeable proxy, no fee
- USDC held transiently only (single transaction duration)
- Manual reentrancy guard (`_locked`)
- Rounding remainder goes to last recipient (documented, deterministic)
- Post-distribution invariant: sum(distributedAmounts) == totalAmount (not griefable by external token sends)
- 42 unit tests passing, balanced security review clean, Slither: no High/Medium

**Custom errors**: `ZeroAmount`, `TooFewRecipients`, `TooManyRecipients`, `ZeroAddressRecipient`, `ZeroShareBasisPoints`, `DuplicateRecipient`, `InvalidTotalBasisPoints`, `DistributionError`

## Security Review Summary

| Round | Auditor | Finding | Status |
|-------|---------|---------|--------|
| 1 | functional-auditor | Critical: `balanceOf==0` postcondition griefable | Fixed: switched to `sum(amounts)==totalAmount` |
| 2 | solidity-auditor | No material findings | — |
| 2 | functional-auditor | No material findings | — |
| Slither | Static analysis | 5× `uninitialized-local` (false positives on numeric accumulators) | Accepted — not security issues |

## User Flow

1. Connect wallet (MetaMask or injected) → switch to ETH Sepolia (app prompts)
2. Enter total USDC amount
3. Add 2–10 recipients: wallet address + percentage each
4. Preview shows exact onchain distribution amounts
5. Click "Send Split Payment"
6. Step A: Approve USDC for exact payment amount (one wallet confirmation)
7. Step B: Execute splitPay (one wallet confirmation)
8. Transaction hash and Etherscan link shown on success

## Test Funding

For ETH Sepolia test USDC: use https://faucet.circle.com (select Ethereum Sepolia, request USDC).
For ETH Sepolia gas (ETH): use https://sepoliafaucet.com or https://faucet.quicknode.com/ethereum/sepolia.

## Subkey Integration (Future)

No Subkey repository URL was provided. When you have a confirmed GitHub URL, provide it and
it will be evaluated against: architecture compatibility, delegated payment authorization,
session keys, and security requirements (permitted contract/token, max amount, expiry, revocation, replay protection).

Subkey integration is optional and does not affect the core payment flow.

## Commands

```bash
bun run dev          # Start dev server (already running on port 5173)
bun run check        # Lint + typecheck
bun run contracts:build   # Compile SplitPay.sol
bun run contracts:test    # Run 42 Foundry unit tests
```
