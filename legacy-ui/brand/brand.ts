/**
 * ParcPay — central brand configuration.
 * Change product name, tagline, or accent here; all components import from this file.
 *
 * NOTE: "ParcPay" is a provisional working name pending trademark and domain clearance.
 * This is an independent application. Not an official Arc or Circle product.
 */

export const BRAND = {
  /** Full product name */
  name: 'ParcPay',

  /**
   * Rendered as two parts so "ARC" receives a distinct visual accent.
   * "P" prefix + "ARC" accent + "Pay" suffix.
   */
  namePrefix: 'P',
  nameAccent: 'ARC',
  nameSuffix: 'Pay',

  /** Primary tagline */
  tagline: 'Payments that follow your rules.',

  /** Supporting description */
  description: 'Split USDC payments, schedule transfers, and manage delegated payment permissions on Arc.',

  /** Version shown in Settings */
  version: '0.3.0-beta',

  /** Provisional — update when domain is confirmed */
  domain: 'parcpay.app',

  /** Network display name */
  network: 'Arc Testnet',

  /** EIP-712 domain name for signatures */
  eip712Name: 'ParcPay',
  eip712Version: '1',

  /** Accent colors (CSS variables are the source of truth; these are for JS contexts) */
  colors: {
    blue: '#0052FF',
    purple: '#7B3FE4',
    teal: '#00D4C8',
    navy: '#0A0E1A',
  },
} as const

export type BrandConfig = typeof BRAND
