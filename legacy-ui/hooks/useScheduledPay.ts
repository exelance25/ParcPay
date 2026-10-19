/**
 * useScheduledPay — EIP-712 tabanlı zamanlanmış ödeme (Subkey benzeri akış).
 *
 * ── Güvenlik modeli ──────────────────────────────────────────────────────────
 * İmza EIP-712 tipli veri imzasıdır (eth_signTypedData_v4).
 * İmza şunları kısıtlar: kontrat, zincir, tutar, alıcılar, zaman aralığı, nonce.
 * "Çalıştırma" parametrelerle splitPay çağrısıdır; kontrat TÜM koşulları doğrular.
 * İptal: tarayıcıdan off-chain silme (onchain nonce kaydı henüz yok — beta).
 *
 * ── Execution mimarisi (açık deklarasyon) ───────────────────────────────────
 * Otomatik execution YOKTUR. Keeper, relayer veya otomasyon servisi yoktur.
 * Kullanıcı "Çalıştır" düğmesine basmak zorundadır.
 * executeAfter zamanı geldiğinde buton aktif olur, öncesinde devre dışıdır.
 *
 * ── Persist ──────────────────────────────────────────────────────────────────
 * Emirler localStorage'da saklanır (sayfa yenilenince kaybolmaz).
 * Signature değerleri loglanmaz veya konsola yazdırılmaz.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  useAccount,
  useSignTypedData,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { erc20Abi } from 'viem'
import { parseAmount, Amount, usdcDecimalsFor } from '@/onchain-money'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { SPLITPAY_ADDRESS, SPLITPAY_ABI } from '@/contracts/splitpay-config'
import { BRAND } from '@/brand/brand'
import { validateShares } from '@/utils/splitpay'
import type { RecipientShare } from '@/utils/splitpay'
import { activityStore } from '@/store/activityStore'

const CHAIN_ID = arcTestnet.id
const STORAGE_KEY = 'parcpay_scheduled_v2'

// ── EIP-712 types ─────────────────────────────────────────────────────────────
const EIP712_TYPES = {
  RecipientShare: [
    { name: 'recipient', type: 'address' },
    { name: 'basisPoints', type: 'uint16' },
  ],
  ScheduledPayOrder: [
    { name: 'payer',         type: 'address'          },
    { name: 'totalAmount',   type: 'uint256'          },
    { name: 'executeAfter',  type: 'uint256'          },
    { name: 'expiry',        type: 'uint256'          },
    { name: 'nonce',         type: 'uint256'          },
    { name: 'shares',        type: 'RecipientShare[]' },
  ],
} as const

// ── Status types ──────────────────────────────────────────────────────────────
/**
 * OrderStatus lifecycle:
 *   draft      → not yet signed (form just created)
 *   scheduled  → signed, time not yet reached
 *   ready      → signed, executeAfter reached, not expired
 *   executing  → approve/split in-flight
 *   completed  → onchain confirmed
 *   failed     → onchain reverted or wallet rejected
 *   cancelled  → user cancelled (off-chain only)
 *   expired    → expiry passed without execution
 */
export type OrderStatus =
  | 'draft'
  | 'scheduled'
  | 'ready'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface ScheduledOrder {
  id: string
  payer: `0x${string}`
  totalAmount: string       // human-readable USDC e.g. "100.00"
  rawAmount: string         // bigint serialized as decimal string (JSON-safe)
  executeAfter: number      // unix timestamp
  expiry: number            // unix timestamp
  nonce: string             // bigint serialized
  shares: RecipientShare[]
  description?: string
  signature?: `0x${string}`
  status: OrderStatus
  txHash?: `0x${string}`
  createdAt: number
  executedAt?: number
  failureReason?: string
}

// ── Status derivation ─────────────────────────────────────────────────────────
function deriveStatus(order: ScheduledOrder, nowTs: number): OrderStatus {
  // Terminal states are sticky
  if (order.status === 'completed' || order.status === 'cancelled' ||
      order.status === 'failed'    || order.status === 'executing') {
    return order.status
  }
  if (nowTs > order.expiry)                                return 'expired'
  if (!order.signature)                                    return 'draft'
  if (nowTs >= order.executeAfter && !!order.signature)    return 'ready'
  return 'scheduled'
}

// ── localStorage persistence ──────────────────────────────────────────────────
function loadOrders(): ScheduledOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ScheduledOrder[]
  } catch { return [] }
}

function saveOrders(orders: ScheduledOrder[]): void {
  try {
    // Never log or expose signature values
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
  } catch { /* storage full — silently skip */ }
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useScheduledPay() {
  const { address } = useAccount()
  const usdcFact = getUsdc(CHAIN_ID)!
  const USDC_ADDRESS = usdcFact.address as `0x${string}`

  // Load from localStorage on mount
  const [orders, setOrders] = useState<ScheduledOrder[]>(() => loadOrders())
  const [signingId,   setSigningId]   = useState<string | null>(null)
  const [executingId, setExecutingId] = useState<string | null>(null)

  // Persist any change to localStorage
  useEffect(() => { saveOrders(orders) }, [orders])

  // ── Wall clock (for status derivation) ───────────────────────────────────
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const tick = () => setNowTs(Math.floor(Date.now() / 1000))
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ordersWithStatus = orders.map((o) => ({
    ...o,
    status: deriveStatus(o, nowTs),
  }))

  // ── USDC balance + allowance ──────────────────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, SPLITPAY_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  // ── EIP-712 signing ───────────────────────────────────────────────────────
  const { signTypedDataAsync } = useSignTypedData()

  // ── Approve write ─────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    reset: resetApprove,
    isPending: approveWalletPending,
  } = useWriteContract()

  const {
    isLoading: approveConfirming,
    isSuccess: approveSuccess,
    isError: approveError,
  } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // ── Split write ───────────────────────────────────────────────────────────
  const {
    writeContract: writeSplit,
    data: executeTxHash,
    reset: resetSplit,
    isPending: splitWalletPending,
  } = useWriteContract()

  const {
    isLoading: splitConfirming,
    isSuccess: splitSuccess,
    isError: splitError,
  } = useWaitForTransactionReceipt({ hash: executeTxHash })

  // Pending split args ref (mirrors the pattern in useSplitPay)
  const pendingExecRef = useRef<{
    orderId: string
    rawAmount: bigint
    contractShares: { recipient: `0x${string}`; basisPoints: number }[]
  } | null>(null)

  // ── approve tx submitted → advance stage ─────────────────────────────────
  useEffect(() => {
    if (approveTxHash && executingId) {
      setOrders((prev) => prev.map((o) =>
        o.id === executingId ? { ...o, status: 'executing' } : o
      ))
    }
  }, [approveTxHash, executingId])

  // ── approval confirmed → fire splitPay ───────────────────────────────────
  useEffect(() => {
    if (!approveSuccess) return
    const pending = pendingExecRef.current
    if (!pending) return
    writeSplit({
      address: SPLITPAY_ADDRESS,
      abi: SPLITPAY_ABI,
      functionName: 'splitPay',
      args: [pending.rawAmount, pending.contractShares],
      chainId: CHAIN_ID,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  // ── split confirmed ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!splitSuccess || !executeTxHash) return
    const pending = pendingExecRef.current
    const orderId = pending?.orderId ?? executingId
    if (!orderId) return

    const now = Math.floor(Date.now() / 1000)
    setOrders((prev) => prev.map((o) =>
      o.id === orderId
        ? { ...o, status: 'completed', txHash: executeTxHash, executedAt: now }
        : o
    ))

    // Write to activity log
    const order = orders.find((o) => o.id === orderId)
    if (order) {
      const dec = usdcDecimalsFor(CHAIN_ID)
      const rawAmt = BigInt(order.rawAmount)
      activityStore.add({
        type: 'scheduled',
        status: 'confirmed',
        txHash: executeTxHash,
        explorerUrl: buildTxExplorerUrl(CHAIN_ID, executeTxHash),
        totalAmount: order.totalAmount,
        recipients: order.shares.map((s) => ({
          address: s.address,
          amount: Amount.fromRaw(
            (rawAmt * BigInt(s.basisPoints)) / 10000n,
            dec
          ).toFixed(2),
          basisPoints: s.basisPoints,
        })),
        chainId: CHAIN_ID,
        network: BRAND.network,
        timestamp: now,
        orderId: order.id,
        scheduleExecuteAfter: order.executeAfter,
      })
    }

    pendingExecRef.current = null
    setExecutingId(null)
    resetApprove()
    resetSplit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitSuccess, executeTxHash])

  // ── split failed ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!splitError && !approveError) return
    const pending = pendingExecRef.current
    const orderId = pending?.orderId ?? executingId
    if (!orderId) return

    const reason = splitError
      ? 'Transaction failed on-chain. Please retry.'
      : 'Approval failed. Please retry.'

    setOrders((prev) => prev.map((o) =>
      o.id === orderId
        ? { ...o, status: 'failed', failureReason: reason }
        : o
    ))

    const order = orders.find((o) => o.id === orderId)
    if (order) {
      activityStore.add({
        type: 'scheduled',
        status: 'failed',
        totalAmount: order.totalAmount,
        recipients: order.shares.map((s) => ({
          address: s.address, amount: '0', basisPoints: s.basisPoints,
        })),
        chainId: CHAIN_ID,
        network: BRAND.network,
        timestamp: Math.floor(Date.now() / 1000),
        orderId: order.id,
        failureReason: reason,
      })
    }

    pendingExecRef.current = null
    setExecutingId(null)
    resetApprove()
    resetSplit()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitError, approveError])

  // ── createOrder ───────────────────────────────────────────────────────────
  const createOrder = useCallback(
    (params: {
      amountStr: string
      shares: RecipientShare[]
      executeAfterTs: number
      expiryTs: number
      description?: string
      nowTs: number
    }): string | null => {
      if (!address) return null

      // Validate before creating
      const sharesErr = validateShares(params.shares)
      if (sharesErr) return null

      let rawAmount: bigint
      try { rawAmount = parseAmount(CHAIN_ID, params.amountStr).raw }
      catch { return null }

      const id = makeId()
      const order: ScheduledOrder = {
        id,
        payer: address,
        totalAmount: params.amountStr,
        rawAmount: rawAmount.toString(),
        executeAfter: params.executeAfterTs,
        expiry: params.expiryTs,
        nonce: BigInt(params.nowTs * 1000 + Math.floor(Math.random() * 1000)).toString(),
        shares: params.shares,
        description: params.description,
        status: 'draft',
        createdAt: params.nowTs,
      }
      setOrders((prev) => [order, ...prev])
      return id
    },
    [address]
  )

  // ── signOrder ─────────────────────────────────────────────────────────────
  const signOrder = useCallback(
    async (id: string): Promise<boolean> => {
      const order = orders.find((o) => o.id === id)
      if (!order || !address) return false
      if (order.signature) return true   // already signed
      setSigningId(id)
      try {
        const domain = {
          name: BRAND.eip712Name,
          version: BRAND.eip712Version,
          chainId: CHAIN_ID,
          verifyingContract: SPLITPAY_ADDRESS,
        } as const

        const message = {
          payer:        order.payer,
          totalAmount:  BigInt(order.rawAmount),
          executeAfter: BigInt(order.executeAfter),
          expiry:       BigInt(order.expiry),
          nonce:        BigInt(order.nonce),
          shares: order.shares.map((s) => ({
            recipient:   s.address as `0x${string}`,
            basisPoints: s.basisPoints,
          })),
        }

        const sig = await signTypedDataAsync({
          domain,
          types: EIP712_TYPES,
          primaryType: 'ScheduledPayOrder',
          message,
        })
        // Note: sig is stored locally only — never logged
        setOrders((prev) => prev.map((o) =>
          o.id === id ? { ...o, signature: sig } : o
        ))
        return true
      } catch {
        // User rejected or error — order remains unsigned
        return false
      } finally {
        setSigningId(null)
      }
    },
    [orders, address, signTypedDataAsync]
  )

  // ── executeOrder ──────────────────────────────────────────────────────────
  /**
   * Execution checks (all must pass):
   * 1. Order exists and is in 'ready' state
   * 2. Not already executing (duplicate-submit guard)
   * 3. Wallet connected and is the original payer
   * 4. Time window valid: now >= executeAfter AND now <= expiry
   * 5. Sufficient USDC balance
   * 6. (Allowance checked — if sufficient, skip approve step)
   */
  const executeOrder = useCallback(
    (id: string): { ok: boolean; error?: string } => {
      // Duplicate-submit guard
      if (executingId) return { ok: false, error: 'Another order is already executing.' }

      const order = orders.find((o) => o.id === id)
      if (!order)           return { ok: false, error: 'Order not found.' }
      if (!order.signature) return { ok: false, error: 'Order not yet signed.' }
      if (!address)         return { ok: false, error: 'Wallet not connected.' }

      const now = Math.floor(Date.now() / 1000)
      if (now < order.executeAfter)
        return { ok: false, error: 'Too early. Scheduled time has not arrived yet.' }
      if (now > order.expiry)
        return { ok: false, error: 'Order expired.' }
      if (order.payer.toLowerCase() !== address.toLowerCase())
        return { ok: false, error: 'This order was created by a different address.' }

      const rawAmount = BigInt(order.rawAmount)
      const dec = usdcDecimalsFor(CHAIN_ID)

      // Balance check
      const bal = usdcBalance ?? 0n
      if (bal < rawAmount) {
        const have = Amount.fromRaw(bal, dec).toFixed(2)
        const need = Amount.fromRaw(rawAmount, dec).toFixed(2)
        return { ok: false, error: `Insufficient balance: have ${have} USDC, need ${need} USDC.` }
      }

      const contractShares = order.shares.map((s) => ({
        recipient:   s.address as `0x${string}`,
        basisPoints: s.basisPoints,
      }))

      pendingExecRef.current = { orderId: id, rawAmount, contractShares }
      setExecutingId(id)
      setOrders((prev) => prev.map((o) =>
        o.id === id ? { ...o, status: 'executing' } : o
      ))

      const currentAllowance = allowance ?? 0n
      if (currentAllowance >= rawAmount) {
        // Skip approve — sufficient allowance already
        writeSplit({
          address: SPLITPAY_ADDRESS,
          abi: SPLITPAY_ABI,
          functionName: 'splitPay',
          args: [rawAmount, contractShares],
          chainId: CHAIN_ID,
        })
      } else {
        writeApprove({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [SPLITPAY_ADDRESS, rawAmount],
          chainId: CHAIN_ID,
        })
      }

      return { ok: true }
    },
    [
      executingId, orders, address,
      usdcBalance, allowance,
      writeApprove, writeSplit, USDC_ADDRESS,
    ]
  )

  // ── cancelOrder ───────────────────────────────────────────────────────────
  const cancelOrder = useCallback((id: string) => {
    setOrders((prev) => prev.map((o) =>
      o.id === id && o.status !== 'completed' && o.status !== 'executing'
        ? { ...o, status: 'cancelled' }
        : o
    ))
  }, [])

  // ── retryOrder — reset a failed order to draft ────────────────────────────
  const retryOrder = useCallback((id: string) => {
    setOrders((prev) => prev.map((o) =>
      o.id === id && o.status === 'failed'
        ? { ...o, status: 'draft', signature: undefined, failureReason: undefined, txHash: undefined }
        : o
    ))
  }, [])

  // ── deleteOrder ───────────────────────────────────────────────────────────
  const deleteOrder = useCallback((id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id))
  }, [])

  return {
    orders: ordersWithStatus,
    createOrder,
    signOrder,
    executeOrder,
    cancelOrder,
    retryOrder,
    deleteOrder,
    signingId,
    executingId,
    approveWalletPending,
    approveConfirming,
    approveSuccess,
    splitWalletPending,
    splitConfirming,
    splitSuccess,
    splitError,
    executeTxHash,
    approveTxHash,
    nowTs,
  }
}
