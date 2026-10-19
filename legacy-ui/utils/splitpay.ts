/**
 * SplitPay utility types and helpers.
 * Mirrors the contract's RecipientShare struct and calculation logic.
 *
 * Two allocation modes:
 *   'percent'  — users enter percentages; basisPoints are the source of truth.
 *   'fixed'    — users enter USDC amounts; basisPoints are derived from the total.
 *
 * The contract always receives basisPoints — this module handles the conversion
 * and ensures both modes produce identical onchain results.
 */

export type AllocationMode = 'percent' | 'fixed'

export interface RecipientShare {
  /** Wallet address */
  address: string
  /** Out of 10,000.  In 'fixed' mode this is derived from fixedAmount + total. */
  basisPoints: number
  /** Raw USDC string — only used in 'fixed' mode UI; not sent to the contract. */
  fixedAmount?: string
}

export const BASIS_POINTS = 10_000
/** Hard cap: the contract allows up to 10, but UX spec says 2–5. */
export const MAX_RECIPIENTS = 5
export const MIN_RECIPIENTS = 2

// ── Validation ────────────────────────────────────────────────────────────────

/** Validate a single recipient entry. Returns an error string or null. */
export function validateRecipient(
  share: RecipientShare,
  index: number,
  allShares: RecipientShare[]
): string | null {
  if (!share.address || share.address.trim() === '') {
    return `Recipient ${index + 1}: address is required`
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(share.address.trim())) {
    return `Recipient ${index + 1}: invalid Ethereum address`
  }
  if (share.address.toLowerCase() === '0x0000000000000000000000000000000000000000') {
    return `Recipient ${index + 1}: zero address not allowed`
  }
  if (!share.basisPoints || share.basisPoints <= 0) {
    return `Recipient ${index + 1}: share must be greater than 0%`
  }
  if (share.basisPoints > BASIS_POINTS) {
    return `Recipient ${index + 1}: share exceeds 100%`
  }
  // Duplicate check (case-insensitive)
  const dupIdx = allShares.findIndex(
    (s, i) =>
      i !== index &&
      s.address.trim().toLowerCase() === share.address.trim().toLowerCase()
  )
  if (dupIdx !== -1) {
    return `Recipient ${index + 1}: duplicate address (same as recipient ${dupIdx + 1})`
  }
  return null
}

/**
 * Validate all shares together.
 * Returns null when valid, error string otherwise.
 * This is called inside useSplitPay.execute() before the contract call.
 */
export function validateShares(shares: RecipientShare[]): string | null {
  if (shares.length < MIN_RECIPIENTS) {
    return `At least ${MIN_RECIPIENTS} recipients are required`
  }
  if (shares.length > MAX_RECIPIENTS) {
    return `Maximum ${MAX_RECIPIENTS} recipients allowed`
  }
  for (let i = 0; i < shares.length; i++) {
    const err = validateRecipient(shares[i], i, shares)
    if (err) return err
  }
  const total = shares.reduce((sum, s) => sum + s.basisPoints, 0)
  if (total !== BASIS_POINTS) {
    const diff = BASIS_POINTS - total
    const sign = diff > 0 ? `${(diff / 100).toFixed(2)}% short` : `${(Math.abs(diff) / 100).toFixed(2)}% over`
    return `Shares must total 100% (currently ${(total / 100).toFixed(2)}% — ${sign})`
  }
  return null
}

/** Validate fixed-amount inputs (before converting to basisPoints). */
export function validateFixed(
  shares: RecipientShare[],
  totalAmountStr: string
): string | null {
  const total = parseFloat(totalAmountStr)
  if (isNaN(total) || total <= 0) return 'Enter a valid total amount first'

  let sum = 0
  for (let i = 0; i < shares.length; i++) {
    const amt = parseFloat(shares[i].fixedAmount ?? '')
    if (isNaN(amt) || amt < 0) return `Recipient ${i + 1}: enter a valid amount`
    if (amt === 0) return `Recipient ${i + 1}: amount must be greater than 0`
    sum += amt
  }

  // Allow a tiny floating-point tolerance (< 0.000001 USDC)
  if (Math.abs(sum - total) > 0.000001) {
    const diff = total - sum
    const sign = diff > 0 ? `${diff.toFixed(6)} USDC short` : `${Math.abs(diff).toFixed(6)} USDC over`
    return `Fixed amounts must sum to ${total} USDC (currently ${sign})`
  }

  // Address + duplicate checks
  for (let i = 0; i < shares.length; i++) {
    const err = validateRecipient(shares[i], i, shares)
    // skip basisPoints error (not set yet in fixed mode)
    if (err && !err.includes('share must be') && !err.includes('share exceeds')) return err
  }
  return null
}

// ── Conversion ────────────────────────────────────────────────────────────────

/**
 * Convert fixed-amount shares to basisPoint shares.
 * Uses integer arithmetic; the last recipient absorbs any rounding remainder.
 * Returns null if inputs are invalid.
 */
export function sharesFromFixed(
  shares: RecipientShare[],
  totalAmountStr: string
): RecipientShare[] | null {
  const total = parseFloat(totalAmountStr)
  if (isNaN(total) || total <= 0) return null

  let assigned = 0
  const result: RecipientShare[] = shares.map((s, i) => {
    const amt = parseFloat(s.fixedAmount ?? '')
    if (isNaN(amt)) return { ...s, basisPoints: 0 }

    if (i === shares.length - 1) {
      // Last recipient: remainder so total sums to exactly BASIS_POINTS
      return { ...s, basisPoints: Math.max(0, BASIS_POINTS - assigned) }
    }
    const bp = Math.floor((amt / total) * BASIS_POINTS)
    assigned += bp
    return { ...s, basisPoints: bp }
  })
  return result
}

/**
 * Normalise shares so they total exactly BASIS_POINTS.
 * Applies floor() to all then adds any remainder to the last recipient.
 * Use this when percent inputs might have accumulated floating-point drift.
 */
export function normaliseShares(shares: RecipientShare[]): RecipientShare[] {
  if (shares.length === 0) return shares
  let total = 0
  const normed = shares.map((s, i) => {
    if (i === shares.length - 1) {
      return { ...s, basisPoints: Math.max(0, BASIS_POINTS - total) }
    }
    const bp = Math.max(0, Math.min(BASIS_POINTS, Math.round(s.basisPoints)))
    total += bp
    return { ...s, basisPoints: bp }
  })
  return normed
}

// ── Arithmetic ────────────────────────────────────────────────────────────────

/**
 * Calculate per-recipient amounts using the same rounding policy as the contract:
 * floor division for all, remainder assigned to the last recipient.
 * This guarantees sum(amounts) === totalRaw.
 */
export function calculateAmounts(totalRaw: bigint, shares: RecipientShare[]): bigint[] {
  const amounts: bigint[] = Array.from({ length: shares.length }, () => 0n)
  let distributed = 0n
  for (let i = 0; i < shares.length; i++) {
    if (i === shares.length - 1) {
      amounts[i] = totalRaw - distributed
    } else {
      const amount = (totalRaw * BigInt(shares[i].basisPoints)) / BigInt(BASIS_POINTS)
      amounts[i] = amount
      distributed += amount
    }
  }
  return amounts
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** 0x1234…5678 */
export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Parse percentage (0–100, allows 2 decimal places) to basis points (0–10000) */
export function pctToBp(pct: number): number {
  return Math.round(pct * 100)
}

/** Format basis points to percentage string, up to 2 decimal places */
export function bpToPct(bp: number): string {
  const val = bp / 100
  // Remove trailing zeros: 50.00→"50", 33.33→"33.33"
  return val % 1 === 0 ? val.toFixed(0) : val.toFixed(2).replace(/0+$/, '')
}

/** Format a raw bigint USDC amount to a human-readable string */
export function formatUsdcAmount(raw: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals)
  const whole = raw / divisor
  const frac = raw % divisor
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr}`
}

/** Remaining basis points given current shares */
export function remainingBp(shares: RecipientShare[]): number {
  const used = shares.reduce((sum, s) => sum + (s.basisPoints || 0), 0)
  return BASIS_POINTS - used
}

/** Remaining USDC amount given fixed-amount shares and total */
export function remainingFixed(shares: RecipientShare[], totalAmountStr: string): number {
  const total = parseFloat(totalAmountStr)
  if (isNaN(total) || total <= 0) return 0
  const used = shares.reduce((sum, s) => {
    const a = parseFloat(s.fixedAmount ?? '0')
    return sum + (isNaN(a) ? 0 : a)
  }, 0)
  return Math.max(0, total - used)
}
