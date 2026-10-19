# ParcPay — Mainnet readiness audit (2026-10-19)

Scope: `contracts/ParcPay.sol`, web app `src/`, deploy tooling `deploy/`, repo hygiene.
No mainnet transaction was sent and no fee was activated during this audit.

## 1. What exists (verified, not assumed)

| Feature | Status | Evidence |
|---|---|---|
| Split payment (1–50 recipients, exact amounts or %) | **Working** | Arc Testnet txs `0xcac0395…f73e59` (5+5), `0x61033e1…205f7c` (1+1), `0x5cf7d37…25a6ab` (user's MetaMask 0xc469…AC3F) |
| Flat 0.001 USDC fee → treasury `0x9A5f…9858` | **Working** | fee transfers in the txs above |
| Scheduled / recurring orders ("Subkey"-style signed permission) | **Working onchain** | sign (EIP-712, no gas) → `executeOrder` run 1/2 `0xe9523d7…b267e` → `cancelOrder` `0xb177d71…aba3d`; UI showed run 2 locked until due, then "cancelled" |
| Execution mechanism of scheduled orders | **Manual / pull-based** | No keeper bot. Recipient, payer or anyone with the link presses "Pay now" once due. Contract enforces time, amounts, recipients, fee cap, expiry. |
| Revoke all orders | Implemented, unit-tested | `revokeNoncesBelow`; not run live |
| EIP-3009 one-signature path (`splitPayWithAuthorization`) | Contract only, unit-tested with mock | **Not exposed in UI**; Arc docs only list `transferWithAuthorization`, so `receiveWithAuthorization` is UNVERIFIED on Arc |
| EIP-5792 batched approve+pay | Implemented with automatic fallback | MetaMask rejected it on Arc ("Invalid parameters"); app falls back to approve → pay |
| Payment request links | Prefill only | Never auto-pays; a confirmation screen lists network, token, every recipient, fee and total |
| Cross-chain (Ethereum / Arbitrum / Monad → Arc) | **Not implemented** | No bridge code in the app. Disabled by absence. |
| Burner test wallet, `#/debug` | Testnet-only | Compiled out of the UI when `VITE_ARC_NETWORK=mainnet` |

## 2. Findings

| Sev | Finding | Status |
|---|---|---|
| HIGH (fixed) | v1 "Subkey" signatures were never verified onchain; cancel only deleted browser storage | Replaced by onchain-verified orders (v2) |
| HIGH (fixed) | Frontend pointed to Arc while contract lived on Sepolia | Single chain config, same CREATE2 address on both Arc networks |
| MEDIUM (fixed) | Payment request link could be confused with an auto-pay | Prefill only + explicit confirmation step |
| MEDIUM (fixed) | MetaMask "Invalid parameters" on batched call / explicit fee fields | Fallbacks; user's MetaMask tx succeeded afterwards |
| MEDIUM (fixed) | Browser could not reach a single RPC ("Failed to fetch") | 4 Arc RPCs + wallet provider fallback |
| MEDIUM (open) | **No independent third-party audit.** Internal review + 37 Foundry tests only | Keep mainnet amounts small; label as unaudited |
| MEDIUM (open) | Scheduled orders need someone to press "Pay now"; no keeper | Documented in UI copy; a keeper is future work |
| LOW (open) | Owner (= treasury EOA) can pause and change fee ≤ 0.10 USDC; owner cannot move user funds | Consider moving ownership to a multisig (Ownable2Step supports it) |
| LOW (open) | Activity history is per-browser (localStorage); explorer is source of truth | Documented |
| LOW (open) | `scripts/compass-deploy.ts` needs `@circlefin/compass-chains` (Arc Studio–only package) → `tsc` error outside Studio | Left untouched on purpose (Arc Studio tooling) |
| INFO | `scripts/e2e-local.mjs` contains Anvil's **public** default dev keys | Commented; never funded |

Secret scan of tracked files and Studio logs: no private keys, API keys or tokens found. `.env` holds only `FOO` and is git-ignored. No git history existed (fresh repo), so nothing to rotate.

## 3. Contract security checklist (ParcPay.sol)

- Access control: `Ownable2Step`, `renounceOwnership` disabled; owner limited to `setFee` (≤ `MAX_FEE` 0.10 USDC), `setTreasury`, `pause`, `rescue` (contract never holds user funds between txs).
- Reentrancy: `nonReentrant` on all payment paths; checks-effects-interactions in `executeOrder`.
- Funds flow: `transferFrom(payer → recipient)` directly; contract balance stays 0 (asserted in tests and E2E).
- Fee: payer passes `maxFee`; an owner fee change can never charge more than signed/accepted.
- Validation: 1–50 recipients, no zero/self/USDC address, no zero amounts, no duplicates.
- Rounding: amount mode = exact; percent mode computed client-side in BigInt with remainder to last recipient, sum == total (fuzz-tested conservation on the contract).
- Replay: per-order run counter, EIP-712 domain binds chainId + contract; cancel and nonce-floor revocation onchain.
- Signatures: OpenZeppelin `SignatureChecker` (EOA + EIP-1271 smart wallets); viem digest cross-checked against the contract.
- Upgradeability: none (immutable). Bytecode reproducible (`bytecode_hash = "none"`).

## 4. Networks (verified 2026-10-19, read-only RPC calls from the browser)

| Network | Chain ID | RPC | USDC | Notes |
|---|---|---|---|---|
| Arc Mainnet | 5042 (0x13b2) ✓ | rpc.mainnet.arc.io ✓ | `0x3600…0000` (ERC-20, 6 dec) ✓ responds | CREATE2 deployer `0x4e59…956C` present ✓, Multicall3 ✓, gas ≈ 20.5 gwei, ParcPay **not deployed yet** |
| Arc Testnet | 5042002 ✓ | 4 RPCs ✓ | `0x3600…0000` ✓ | ParcPay `0x000000001a03e01a185A6Ab09cd14AeE2398b55c` ✓ live |
| Ethereum | 1 | — | `0xA0b8…eB48` | CCTP V2 domain 0 (Circle docs). **No route implemented** |
| Arbitrum One | 42161 | — | `0xaf88…5831` | CCTP V2 domain 3 (Circle docs). **No route implemented** |
| Monad | — | — | — | Not listed on Circle's CCTP supported-domains page → **unsupported / unverified** |

Arc's CCTP domain is 26 according to Circle's Arc skill; it does not appear on the public supported-domains table checked today, so Arc ↔ other-chain bridging is **UNVERIFIED** and stays disabled.

## 5. Tests actually run (2026-10-19)

- `forge test --match-contract ParcPayTest` → 37 passed, 0 failed (incl. 256-run fuzz)
- `tsc --noEmit` → 0 errors in `src/` (1 pre-existing error in Arc Studio script `scripts/compass-deploy.ts`)
- `oxlint src` → 0 warnings, 0 errors
- `vite build` (mainnet) → success
- Local E2E (Anvil, chain 5042002, real CREATE2 deployer) → passed
- Live Arc Testnet: deploy, split ×3 (incl. user's MetaMask), scheduled order sign/execute/cancel → passed

## 6. GO / NO-GO

- **Arc-only mainnet launch, small amounts, same-chain split + scheduled orders: CONDITIONAL GO** once the owner deploys with their own wallet and runs a ≤ 1 USDC smoke test.
- **Cross-chain (Ethereum / Arbitrum / Monad): NO-GO** — not implemented, Arc CCTP route unverified.
- **EIP-3009 one-signature UI path: NO-GO** until `receiveWithAuthorization` is verified on Arc.
- **"Audited" claims: NO** — internal review only.

## 7. SDK (assessment only, not built)

Core logic is already isolated and could become `@parcpay/sdk`:
`buildTransfers(rows, mode, total)`, `quote(transfers)`, `pay(walletClient, transfers, memo, {budget})`,
`signOrder(walletClient, order)`, `encodeOrder/decodeOrder`, `executeOrder`, `cancelOrder`, `revokeAll`, `hashOrder`.
Needs: viem-only peer dependency, typed errors (map contract custom errors), chain registry (Arc mainnet/testnet),
unit tests for rounding and digest vectors (existing `eip712-vector.mjs`). Defer until after the grant.
