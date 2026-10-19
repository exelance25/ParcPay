/**
 * ParcPay — Fee Configuration
 *
 * IMPORTANT: Platform fees are DISABLED by default (feeBps = 0).
 * Do not activate fees or deploy a fee contract without explicit product approval.
 *
 * Fee architecture overview (for future consideration only):
 *  - feeBps: platform fee in basis points (10 = 0.10%). Currently 0.
 *  - feeRecipient: the address that receives platform revenue. Currently zero address.
 *  - maxFeeBps: hard upper limit — the contract should enforce this, not just the UI.
 *  - All fee calculations must be done in integer arithmetic using the token's decimals.
 *  - The fee must be disclosed to the user before signing.
 *  - Network gas fees are entirely separate from and unrelated to ParcPay revenue.
 *
 * Revenue model notes (hypothetical — not actual revenue):
 *  - Option A: 0.10% optional platform fee per split payment (future, off by default)
 *  - Option B: Business subscription for high-volume teams (future, not yet built)
 *  - Option C: Developer API / white-label integration fee (future, not yet built)
 *
 * Hypothetical monthly projections at 0.10% fee (ASSUMPTIONS ONLY — not actual revenue):
 *   $10,000 volume  → $10  gross revenue
 *   $100,000 volume → $100 gross revenue
 *   $1,000,000 volume → $1,000 gross revenue
 *   $10,000,000 volume → $10,000 gross revenue
 *
 * These figures are illustrative assumptions. Actual results depend on adoption,
 * costs, tax obligations, regulatory requirements, and other factors.
 */

export const FEE_CONFIG = {
  /** Platform fee in basis points. 0 = no platform fee. */
  feeBps: 0,

  /**
   * Address that receives platform revenue.
   * Zero address means fees are disabled even if feeBps > 0.
   * MUST be replaced with a real, audited address before activating fees.
   */
  feeRecipient: '0x0000000000000000000000000000000000000000' as `0x${string}`,

  /** Hard maximum fee that the UI will ever propose (safety cap). */
  maxFeeBps: 100, // 1.00%

  /** Whether to show the fee module in the Settings page. */
  showInSettings: true,
} as const

export type FeeConfig = typeof FEE_CONFIG

/**
 * Calculate the platform fee amount in raw token units.
 * Returns 0n when fees are disabled.
 */
export function calculateFee(rawAmount: bigint): bigint {
  if (FEE_CONFIG.feeBps === 0) return 0n
  if (FEE_CONFIG.feeRecipient === '0x0000000000000000000000000000000000000000') return 0n
  return (rawAmount * BigInt(FEE_CONFIG.feeBps)) / 10_000n
}

/**
 * Human-readable fee description for disclosure to the user before signing.
 */
export function feeDisclosure(lang: 'tr' | 'en'): string {
  if (FEE_CONFIG.feeBps === 0) {
    return lang === 'tr'
      ? 'Platform ücreti: Yok (MVP — şu an ücretsiz)'
      : 'Platform fee: None (MVP — currently free)'
  }
  const pct = (FEE_CONFIG.feeBps / 100).toFixed(2)
  return lang === 'tr'
    ? `Platform ücreti: %${pct} (${FEE_CONFIG.feeRecipient.slice(0, 8)}…'e gider)`
    : `Platform fee: ${pct}% (goes to ${FEE_CONFIG.feeRecipient.slice(0, 8)}…)`
}
