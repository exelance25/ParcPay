/**
 * activityStore — localStorage-backed transaction history.
 *
 * Stores confirmed and failed transactions from split pay and scheduled pay.
 * Survives page refresh (localStorage). Max 200 entries; oldest are evicted.
 *
 * ALL data is LOCAL. Onchain truth is the explorer URL.
 * Never logged or sent to any server.
 */

export type ActivityType   = 'split' | 'scheduled' | 'request'
export type ActivityStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled'

export interface ActivityEntry {
  id: string
  type:        ActivityType
  status:      ActivityStatus
  txHash?:     string
  explorerUrl?: string
  /** Human-readable USDC total, e.g. "100.00" */
  totalAmount: string
  recipients:  { address: string; amount: string; basisPoints: number }[]
  chainId:     number
  network:     string
  /** Unix seconds of local timestamp (not onchain) */
  timestamp:   number
  failureReason?: string
  /** Scheduled-payment metadata */
  orderId?:             string
  scheduleExecuteAfter?: number
  /** Payment request reference */
  requestRef?: string
}

const STORAGE_KEY = 'parcpay_activity_v1'
const MAX_ENTRIES = 200

function load(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ActivityEntry[]
  } catch { return [] }
}

function save(entries: ActivityEntry[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) }
  catch { /* storage full — silently skip */ }
}

export const activityStore = {
  getAll(): ActivityEntry[] { return load() },

  add(entry: Omit<ActivityEntry, 'id'>): ActivityEntry {
    const full: ActivityEntry = {
      ...entry,
      id: Math.random().toString(36).slice(2, 10).toUpperCase(),
    }
    const existing = load()
    const updated  = [full, ...existing].slice(0, MAX_ENTRIES)
    save(updated)
    return full
  },

  update(id: string, patch: Partial<ActivityEntry>): void {
    save(load().map((e) => (e.id === id ? { ...e, ...patch } : e)))
  },

  clear(): void { localStorage.removeItem(STORAGE_KEY) },
}
