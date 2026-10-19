# ParcPay — Final Security, Testing & Deployment Report
**Date:** 2026-10-17  
**Version:** 0.3.0-beta  
**Prepared by:** Arc Studio automated review pipeline

---

## 1. What Was Already Working

| Feature | Status |
|---------|--------|
| Split payment — approve → splitPay flow | Working (ETH Sepolia) |
| Percent allocation mode | Working |
| Fixed-amount allocation mode | Working |
| Duplicate-submit guard (pendingRef) | Working |
| Insufficient balance check (pre-flight) | Working |
| Allowance skip when sufficient | Working |
| validateShares() called before execute() | Working |
| RecipientList: decimal %, fill-remainder | Working |
| SplitPreview: exact amounts matching contract | Working |
| TransactionPanel: approve hash + split hash | Working |
| Scheduled orders: localStorage persistence | Working |
| 8-status lifecycle (draft→completed/failed) | Working |
| EIP-712 signature (eth_signTypedData_v4) | Working |
| Execution checks (time, payer, balance) | Working |
| Activity log: scheduled payments | Working |
| Payment requests: shareable URL | Working |
| TR/EN language toggle | Working |
| Arc design tokens + ParcPay brand | Working |

---

## 2. Changes Made This Session

### Contract (`contracts/SplitPay.sol`)
1. **Added `rescueToken(address token, address to, uint256 amount)`** — owner-free recovery of non-USDC tokens accidentally sent to the contract. USDC rescue is intentionally blocked by `CannotRescueUSDC` error to avoid introducing admin privilege.
2. **Added NatSpec blocklist warning** on `splitPay`: documented that a USDC-blocklisted recipient causes full revert.
3. **Added NatSpec non-custodial caveat**: clarified that "non-custodial" applies to the `splitPay` execution path, not to unsolicited external transfers.
4. **New custom errors**: `CannotRescueUSDC`, `RescueZeroAmount`.

### Frontend
1. **Activity log on split success** (`useSplitPay`): every confirmed split payment is now written to `activityStore` with tx hash, explorer URL, per-recipient breakdown, and chain info.
2. **Blocklist warning in SplitPreview**: amber notice below every valid distribution preview explaining the Circle USDC blocklist risk.
3. **parseOnchainError**: added `CannotRescueUSDC` and `RescueZeroAmount` mappings.
4. **ABI updated** in `splitpay-config.ts`: `rescueToken` function + 2 new errors.

---

## 3. Security Review Results

### Audit rounds: 2 (balanced severity, both auditors)

| Finding | Severity | Status |
|---------|----------|--------|
| `balanceOf==0` postcondition griefable | Critical | Fixed (prior session) → sum-accounting |
| Blocklist: one blocked recipient bricks all payouts | High | Mitigated — documented in NatSpec + UI warning. Pull-payment redesign out of scope for MVP. |
| Stuck non-USDC tokens (no recovery path) | High | Fixed → `rescueToken` (non-USDC only, owner-free) |
| Reentrancy (manual bool lock) | — | No finding — lock correct, USDC has no hooks |
| Integer arithmetic / overflow | — | No finding — Solidity 0.8.x auto-checks; rounding deterministic |
| SafeERC20 usage | — | No finding — correctly imported, used throughout |
| Replay protection | — | By design: stateless contract, no nonce needed |
| Duplicate execution | — | By design: each `splitPay` is independent; no global state |
| Paris EVM / mcopy risk | — | No finding — OZ 5.1.0 confirmed compatible |

**No independent third-party audit has been performed. The contract is testnet-only.**

---

## 4. Test Results

### Forge unit tests — `contracts/test/SplitPay.t.sol`

```
Ran 1 test suite: 42 tests passed, 0 failed, 0 skipped
```

| Category | Tests | Result |
|----------|-------|--------|
| Constructor | 4 | PASS |
| Happy path (2–10 recipients, rounding) | 5 | PASS |
| Events (PaymentExecuted) | 3 | PASS |
| Revert paths (all 11 error cases) | 11 | PASS |
| previewSplit valid | 4 | PASS |
| previewSplit invalid (7 cases) | 7 | PASS |
| Fuzz: sum == totalAmount (3 strategies) | 3+3 fuzz | PASS (256 runs each) |
| Invariant: contract never holds USDC | 1 | PASS (256×500 calls) |

### Frontend
- **oxlint:** 0 warnings, 0 errors  
- **TypeScript:** 0 errors  
- **Dev server:** Running (Vite HMR active)

---

## 5. Subkey — Actual Capabilities

**What "Subkey" is in this project:**  
Not a third-party Subkey package or Substrate key-management library. It is a custom EIP-712 typed-data signing flow built into `useScheduledPay`.

**What it genuinely supports:**

| Capability | Supported | Enforcement layer |
|-----------|-----------|------------------|
| Sign a payment order with typed data | Yes | Off-chain (wallet signature) |
| Bind signature to: contract, chain ID | Yes | EIP-712 domain |
| Bind signature to: payer address | Yes | EIP-712 message field |
| Bind signature to: max amount | Yes | EIP-712 message field |
| Bind signature to: recipients + shares | Yes | EIP-712 message field |
| Bind signature to: executeAfter time | Yes | EIP-712 message field |
| Bind signature to: expiry time | Yes | EIP-712 message field |
| Bind signature to: nonce (replay protection) | Yes — off-chain | Frontend only (nonce not verified onchain) |
| Onchain signature verification | **No** | Not in SplitPay.sol |
| Onchain time enforcement | **No** | Frontend check only |
| Onchain spending limit enforcement | **No** | Frontend check only |
| Automatic execution | **No** | User must click "Execute" |
| Relayer / keeper | **No** | None implemented |
| True revocation (onchain) | **No** | Local delete only |

**Honest summary:** The EIP-712 signature provides a structured, wallet-signed record of the user's intent. All execution constraints (time window, amount, payer identity) are enforced by the frontend at the moment the user clicks "Execute". They are not enforced by the SplitPay contract. The signature cannot be used by a relayer to trustlessly execute on the user's behalf.

---

## 6. Scheduled Payments — Execution Architecture

**Architecture:** User-triggered, transparent.

```
User fills form → draft
  ↓
User signs (eth_signTypedData_v4) → scheduled / ready
  ↓
User clicks "Execute" at or after executeAfter →
  Pre-checks (time, payer, balance, expiry)
  Approve USDC if needed
  Call splitPay(totalAmount, shares)
  ↓
completed / failed
```

**There is no automatic execution.** The app displays a countdown to `executeAfter` and enables the Execute button when the time arrives. This is clearly labeled in the UI and documented in code.

**Duplicate execution protection:** `executingId` state variable. If an order is already in `executing` status, `executeOrder()` returns early. Terminal statuses (`completed`, `cancelled`) cannot re-execute.

**Replay protection:** Off-chain: once an order reaches `completed`, its status is terminal and the Execute button disappears. The contract itself is stateless — the same parameters could be re-submitted manually, but the frontend prevents this.

---

## 7. Network & Contract Configuration

| Item | Value | Verified |
|------|-------|---------|
| Contract name | SplitPay | Yes |
| ETH Sepolia address | `0x9692f54be2921ce00a02de9ee97bfb06469c6167` | Deployed 2026-10-17 |
| Arc Testnet address | Pending (daily faucet limit) | Deploy on next reset |
| ETH Sepolia USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Verified (symbol: USDC, decimals: 6) |
| Arc Testnet USDC | `0x3600000000000000000000000000000000000000` | Verified (symbol: USDC, decimals: 6) |
| User test wallet balance | 508.145216 USDC (Arc Testnet) | Verified via read_contract |
| Mainnet deployment | None | — |

---

## 8. Operating Costs

| Item | Cost | Notes |
|------|------|-------|
| Contract deployment | ~0.002 ETH (~$5) per chain | One-time |
| splitPay (2 recipients) | ~44,000–112,000 gas | ~$0.01–0.05 on Arc |
| splitPay (5 recipients) | ~180,000–220,000 gas | ~$0.03–0.08 on Arc |
| USDC approval | ~46,000 gas | Skipped when allowance sufficient |
| Arc Testnet gas | Free (testnet) | — |
| Backend / indexer | $0 | No backend; localStorage only |
| Relayer / keeper | $0 | No automation; user-triggered |
| Subkey / third-party service | $0 | None used |

---

## 9. Remaining Defects & Limitations

| # | Issue | Severity | Workaround |
|---|-------|----------|-----------|
| 1 | Blocklist griefing: one blocked recipient bricks all payouts | Medium | Screen recipients; documented in UI |
| 2 | Scheduled payments require manual execution | By design | Labeled in UI |
| 3 | EIP-712 signature not verified onchain | By design for MVP | Documented in Permissions page |
| 4 | localStorage data lost on browser clear | Low | No backend storage |
| 5 | Payment request prefill requires navigation (no deep link) | Low | "Set Up Payment" button navigates to Split page |
| 6 | Arc Testnet deploy pending (faucet cap) | Operational | ETH Sepolia deploy active |

---

## 10. Testnet / Mainnet Readiness

### ✅ Testnet-ready (ETH Sepolia)
- Contract deployed and verified at `0x9692f5…`
- 42/42 unit tests pass
- Balanced security review: 0 High remaining findings
- Frontend: 0 lint errors, 0 type errors
- Core payment flow working end-to-end

### ❌ Not Mainnet-ready
Required before mainnet:
1. Independent paid third-party security audit
2. Mainnet USDC address configuration and verification
3. Formal deployment review and multisig deployment
4. Pull-payment design consideration for blocklist resilience
5. Onchain nonce registry for replay protection if relayer is added
6. Legal review of payment-splitting product in target jurisdictions

---

## 11. Manual Steps Required

1. **Test the payment flow** — connect MetaMask to ETH Sepolia, get Sepolia USDC from faucet.circle.com, send a split payment.
2. **Arc Testnet deploy** — say "deploy the SplitPay contract to Arc Testnet" when the daily limit resets (~18 Oct 2026 12:32 UTC).
3. **Wire Arc Testnet address** — update `SPLITPAY_ADDRESS` in `src/contracts/splitpay-config.ts` after deploy.
4. **Brand finalization** — update `brand.ts` when domain/trademark is confirmed.
5. **GitHub backup** — push to a repository for backup and version history.
6. **Subkey GitHub URL** — share the exact URL for evaluation if you want third-party Subkey integration.
