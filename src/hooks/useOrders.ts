/**
 * Signed payment orders (scheduled one-off, recurring payroll/subscriptions).
 *
 * The payer signs ONE EIP-712 message. The contract verifies that signature onchain at
 * execution time, so nobody can change recipients, amounts, timing or fee. Anyone holding the
 * link (a recipient claiming salary, the payer, a keeper bot) can trigger a run once it is due.
 * Cancel / revoke-all are onchain and final.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { signTypedData, writeContract, waitForTransactionReceipt, simulateContract } from '@wagmi/core'
import { hashTypedData } from 'viem'
import { CHAIN_ID } from '@/chain'
import { EIP712_DOMAIN, ORDER_TYPES, PARCPAY_ABI, PARCPAY_ADDRESS, type Order } from '@/contracts/parcpay'
import { addActivity } from '@/lib/activity'

export interface SignedOrder {
  order: Order
  signature: `0x${string}`
  hash: `0x${string}`
  label: string
  createdAt: number
}

// ── JSON-safe (de)serialisation + share links ────────────────────────────────
type Wire = { o: Record<string, unknown>; s: string; l: string }

export function encodeOrder(so: SignedOrder): string {
  const o = so.order
  const wire: Wire = {
    o: {
      p: o.payer, t: o.transfers.map((x) => [x.to, x.amount.toString()]), f: o.maxFee.toString(),
      st: o.start.toString(), iv: o.interval.toString(), r: o.runs, e: o.expiry.toString(), n: o.nonce.toString(), m: o.memo,
    },
    s: so.signature,
    l: so.label,
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(wire)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeOrder(s: string): SignedOrder | null {
  try {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
    const w = JSON.parse(json) as Wire
    const o = w.o as { p: `0x${string}`; t: [`0x${string}`, string][]; f: string; st: string; iv: string; r: number; e: string; n: string; m: `0x${string}` }
    const order: Order = {
      payer: o.p, transfers: o.t.map(([to, a]) => ({ to, amount: BigInt(a) })), maxFee: BigInt(o.f),
      start: BigInt(o.st), interval: BigInt(o.iv), runs: Number(o.r), expiry: BigInt(o.e), nonce: BigInt(o.n), memo: o.m,
    }
    return { order, signature: w.s as `0x${string}`, hash: hashOrder(order), label: w.l ?? '', createdAt: 0 }
  } catch {
    return null
  }
}

export const hashOrder = (order: Order) =>
  hashTypedData({ domain: EIP712_DOMAIN, types: ORDER_TYPES, primaryType: 'Order', message: order })

export const orderLink = (so: SignedOrder) =>
  `${window.location.origin}${window.location.pathname}#/claim?o=${encodeOrder(so)}`

// ── Local store of orders I created ──────────────────────────────────────────
const KEY = 'parcpay_orders_v2'
let listeners: (() => void)[] = []
let cache: string[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
})()
function persist(next: string[]) {
  cache = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useMyOrders(payer?: string): SignedOrder[] {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.push(l)
      return () => {
        listeners = listeners.filter((x) => x !== l)
      }
    },
    () => cache,
  )
  return raw
    .map((s) => decodeOrder(s))
    .filter((x): x is SignedOrder => !!x && (!payer || x.order.payer.toLowerCase() === payer.toLowerCase()))
}

export function removeLocalOrder(hash: string) {
  persist(cache.filter((s) => decodeOrder(s)?.hash !== hash))
}

// ── Actions ──────────────────────────────────────────────────────────────────
export function useOrderActions() {
  const config = useConfig()
  const { address } = useAccount()

  const sign = useCallback(
    async (order: Omit<Order, 'payer'>, label: string): Promise<SignedOrder> => {
      if (!address) throw new Error('Wallet not connected')
      const full: Order = { ...order, payer: address }
      const signature = await signTypedData(config, {
        domain: EIP712_DOMAIN, types: ORDER_TYPES, primaryType: 'Order', message: full,
      })
      const so: SignedOrder = { order: full, signature, hash: hashOrder(full), label, createdAt: Date.now() }
      persist([encodeOrder(so), ...cache])
      return so
    },
    [address, config],
  )

  const execute = useCallback(
    async (so: SignedOrder) => {
      const { request } = await simulateContract(config, {
        chainId: CHAIN_ID, account: address, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI,
        functionName: 'executeOrder', args: [so.order, so.signature],
      })
      const hash = await writeContract(config, request)
      const r = await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
      if (r.status !== 'success') throw new Error('reverted')
      const total = so.order.transfers.reduce((s, t) => s + t.amount, 0n)
      addActivity({ kind: 'order', hash, total: total.toString(), recipients: so.order.transfers.map((t) => ({ to: t.to, amount: t.amount.toString() })), memo: so.order.memo })
      return hash
    },
    [address, config],
  )

  const cancel = useCallback(
    async (so: SignedOrder) => {
      const hash = await writeContract(config, {
        chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'cancelOrder', args: [so.hash],
      })
      await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
      addActivity({ kind: 'cancel', hash })
      return hash
    },
    [config],
  )

  /** Revoke every order signed so far (nonces are millisecond timestamps). */
  const revokeAll = useCallback(async () => {
    const hash = await writeContract(config, {
      chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'revokeNoncesBelow', args: [BigInt(Date.now())],
    })
    await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
    addActivity({ kind: 'cancel', hash })
    return hash
  }, [config])

  return { sign, execute, cancel, revokeAll }
}
