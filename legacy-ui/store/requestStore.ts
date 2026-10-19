/**
 * requestStore — localStorage-backed shareable payment requests.
 *
 * A payment request is a URL-encodable intent: amount + recipients + optional
 * description. It does NOT trigger any transaction automatically.
 * The receiver opens the link, reviews the request, and chooses whether to pay.
 */
import type { RecipientShare } from '@/utils/splitpay'

export interface PaymentRequest {
  id: string
  amount: string           // human-readable USDC
  shares: RecipientShare[]
  description: string
  createdBy: string        // wallet address
  createdAt: number        // unix seconds
  expiresAt?: number       // optional unix seconds
  paid: boolean
  paidTxHash?: string
}

const STORAGE_KEY = 'parcpay_requests_v1'
const MAX_ENTRIES = 100

function load(): PaymentRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as PaymentRequest[]
  } catch { return [] }
}

function save(entries: PaymentRequest[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* noop */ }
}

export const requestStore = {
  getAll(): PaymentRequest[] { return load() },

  add(req: Omit<PaymentRequest, 'id'>): PaymentRequest {
    const full: PaymentRequest = { ...req, id: Math.random().toString(36).slice(2, 10).toUpperCase() }
    const updated = [full, ...load()].slice(0, MAX_ENTRIES)
    save(updated)
    return full
  },

  markPaid(id: string, txHash: string): void {
    save(load().map((r) => r.id === id ? { ...r, paid: true, paidTxHash: txHash } : r))
  },

  remove(id: string): void {
    save(load().filter((r) => r.id !== id))
  },

  /** Encode a request as a URL fragment (no server required) */
  toShareUrl(req: PaymentRequest): string {
    const payload = btoa(JSON.stringify({
      v: 1,
      id: req.id,
      amount: req.amount,
      shares: req.shares,
      description: req.description,
      expiresAt: req.expiresAt,
    }))
    return `${window.location.origin}${window.location.pathname}#pay=${payload}`
  },

  /** Parse an inbound share URL fragment — returns null if invalid */
  fromShareUrl(hash: string): Omit<PaymentRequest, 'id' | 'createdBy' | 'createdAt' | 'paid'> | null {
    try {
      const match = hash.match(/[#&]pay=([A-Za-z0-9+/=]+)/)
      if (!match) return null
      const data = JSON.parse(atob(match[1])) as {
        v: number; id?: string; amount: string; shares: RecipientShare[]
        description: string; expiresAt?: number
      }
      if (data.v !== 1 || !data.amount || !Array.isArray(data.shares)) return null
      // Validate each share minimally — treat all as untrusted input
      for (const s of data.shares) {
        if (typeof s.address !== 'string' || typeof s.basisPoints !== 'number') return null
        if (s.basisPoints <= 0 || s.basisPoints > 10000) return null
      }
      return {
        amount: String(data.amount).slice(0, 30),
        shares: data.shares,
        description: String(data.description ?? '').slice(0, 200),
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
      }
    } catch { return null }
  },
}
