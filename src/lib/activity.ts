/** Local activity log (this browser only). Onchain events remain the source of truth. */
import { useSyncExternalStore } from 'react'

export interface ActivityItem {
  id: string
  kind: 'split' | 'order' | 'cancel' | 'approve'
  hash: `0x${string}`
  total?: string // raw base units as string
  fee?: string
  recipients?: { to: string; amount: string }[]
  memo?: string
  ts: number
}

const KEY = 'parcpay_activity_v2'
let listeners: (() => void)[] = []
let cache: ActivityItem[] = read()

function read(): ActivityItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ActivityItem[]
  } catch {
    return []
  }
}

export function addActivity(item: Omit<ActivityItem, 'id' | 'ts'>) {
  cache = [{ ...item, id: crypto.randomUUID(), ts: Date.now() }, ...cache].slice(0, 200)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function clearActivity() {
  cache = []
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useActivity(): ActivityItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.push(l)
      return () => {
        listeners = listeners.filter((x) => x !== l)
      }
    },
    () => cache,
  )
}
