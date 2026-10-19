# ParcPay v2 — Security review & changes

Date: 2026-10-18 · Scope: `contracts/ParcPay.sol`, web app (`src/`) · Tooling: Foundry 1.5.1, solc 0.8.28

## Findings in v1 (`contracts/legacy/SplitPay.sol` + old UI)

| # | Severity | Finding | Fix in v2 |
|---|----------|---------|-----------|
| 1 | High | "Scheduled payments / Subkey" were cosmetic: the EIP-712 signature was stored in localStorage and **never verified onchain**; "cancel" only deleted it from the browser. Anyone could believe a payment was locked when it was not. | `executeOrder` verifies the payer's EIP-712 (or EIP-1271 smart-wallet) signature onchain; recipients, amounts, fee cap, start, interval, runs, expiry and nonce are all signed. `cancelOrder` / `revokeNoncesBelow` are onchain. |
| 2 | High | Frontend pointed at Arc Testnet while the only deployed contract was on ETH Sepolia → every transaction failed. | Single chain source (`src/chain.ts`), Arc Mainnet default, `VITE_ARC_NETWORK=testnet` for tests; same CREATE2 address on both networks. |
| 3 | Medium | Contract held all funds transiently (pull to contract, then push). | `splitPay` / `executeOrder` transfer **directly payer → recipient**; contract balance is always 0. Only the EIP-3009 path holds funds inside a single tx. |
| 4 | Medium | "Fixed amount" mode was converted to basis points → recipients could receive a few base units less/more than typed. | Transfers carry exact amounts; percent mode is computed in BigInt with remainder to the last recipient. |
| 5 | Medium | Permissionless `rescueToken` let anyone take any stray non-USDC token. | Owner-only `rescue`. |
| 6 | Low | No fee/treasury; fee config only in UI. | Flat fee onchain (`fee`, default 1 000 = 0.001 USDC) → treasury `0x9A5f…9858`; hard cap `MAX_FEE` = 0.10 USDC; per-call `maxFee` so a fee change can never charge more than the payer agreed to. |
| 7 | Low | Two transactions for every payment. | 1 signature when allowance suffices (optional budget approval), 1 prompt with EIP-5792 batching, or EIP-3009 `receiveWithAuthorization` path (1 signature + 1 tx, no approval). |
| 8 | Low | `dangerouslySetInnerHTML` in App.tsx. | Removed (old UI moved to `legacy-ui/`, not compiled). |
| 9 | Info | UI capped at 5 recipients, contract 10. | 1–50 recipients in both. |

## v2 design notes

- **Access control:** `Ownable2Step` (owner = treasury). `renounceOwnership` disabled. Owner can: `setFee` (≤ cap), `setTreasury`, `pause`/`unpause`, `rescue`. Owner can **not** move user funds or change signed orders.
- **Reentrancy:** `nonReentrant` on all payment paths; state (`runsExecuted`) updated before transfers.
- **Validation:** 1–50 recipients, no zero address, no self/USDC address, no zero amount, no duplicates.
- **Signatures:** OpenZeppelin `EIP712` (domain `ParcPay`/`2`, chainId, contract) + `SignatureChecker` (EOA + EIP-1271). Digest cross-checked against viem (`scripts/eip712-vector.mjs`, test `test_Order_DigestMatchesViemVector`).
- **Replay:** run counter per order hash; orders bound to chainId + contract; nonce floor for bulk revocation.
- **Front-running EIP-3009:** uses `receiveWithAuthorization` (payee must be caller) and forces `from = msg.sender`.
- **USDC blocklist:** a blocklisted recipient makes the whole payment revert (atomic, no partial payout).
- **Recurring orders:** each call executes one run; missed runs can be executed back-to-back once due ("catch-up"). The payer controls exposure via allowance and can cancel at any time.

## Known limitations

- `splitPayWithAuthorization` relies on Arc USDC supporting EIP-3009 `receiveWithAuthorization` (Arc docs document `transferWithAuthorization`; FiatToken v2 implements both). The UI does not use this path yet; test it on testnet before exposing it.
- Executing a signed order requires the payer to keep enough balance + allowance at each due date.
- No third-party audit. Run on testnet first, and keep mainnet amounts small until reviewed.

## Verification

- `forge test --match-contract ParcPayTest` → **37 passed** (incl. 256-run fuzz).
- `node scripts/e2e-local.mjs <salt>` on Anvil (chain id 5042002, USDC at `0x3600…`, canonical CREATE2 deployer) → deploy, fee to treasury, exact payouts, signed order executed by a third party, tampering rejected.
- `tsc --noEmit` clean for `src/`; `vite build` passes; headless Chromium: no runtime errors, no horizontal overflow at 390 px and 1366 px.
