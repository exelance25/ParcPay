/**
 * useSplitPay — wagmi hooks for the SplitPay contract.
 *
 * Flow:
 *   1. execute(amount, shares, mode) is called.
 *   2. Client-side validation (validateShares) runs first — fast fail with clear error.
 *   3. Balance check.
 *   4. If allowance < amount → request exact approval → stage='approving'.
 *   5. useEffect on approveSuccess → fires splitPay → stage='splitting'.
 *   6. useEffect on splitSuccess/splitError → stage='success'/'error'.
 *
 * All approve→split sequencing lives here, NOT in App.tsx.
 * duplicate-submit guard: pendingRef is set at execute() and cleared on reset().
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, parseAmount, usdcDecimalsFor } from '@/onchain-money'
import { type RecipientShare, type AllocationMode, validateShares, sharesFromFixed, normaliseShares, calculateAmounts, formatUsdcAmount } from '@/utils/splitpay'
import { SPLITPAY_ADDRESS, SPLITPAY_ABI } from '@/contracts/splitpay-config'
import { activityStore } from '@/store/activityStore'
import { BRAND } from '@/brand/brand'

export { SPLITPAY_ADDRESS, SPLITPAY_ABI }

// Active deployment target
const CHAIN_ID = arcTestnet.id

export type TxStage =
  | 'idle'
  | 'approving'
  | 'approve-confirming'
  | 'splitting'
  | 'split-confirming'
  | 'success'
  | 'error'

export interface SplitPayState {
  stage: TxStage
  approveTxHash?: `0x${string}`
  splitTxHash?: `0x${string}`
  error?: string
}

export function useSplitPay() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const usdcFact = getUsdc(CHAIN_ID)!
  const USDC_ADDRESS = usdcFact.address as `0x${string}`

  const [state, setState] = useState<SplitPayState>({ stage: 'idle' })

  // Duplicate-submit guard + arg stash for approve→split effect
  const pendingRef = useRef<{
    rawAmount: bigint
    contractShares: { recipient: `0x${string}`; basisPoints: number }[]
  } | null>(null)

  // ── Read allowance ────────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, SPLITPAY_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  // ── Read balance ──────────────────────────────────────────────────────────
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

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
  } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // ── SplitPay write ────────────────────────────────────────────────────────
  const {
    writeContract: writeSplit,
    data: splitTxHash,
    reset: resetSplit,
    isPending: splitWalletPending,
  } = useWriteContract()

  const {
    isLoading: splitConfirming,
    isSuccess: splitSuccess,
    isError: splitError,
  } = useWaitForTransactionReceipt({ hash: splitTxHash })

  // ── Stage transitions ─────────────────────────────────────────────────────

  useEffect(() => {
    if (approveTxHash && state.stage === 'approving') {
      setState((prev) => ({ ...prev, stage: 'approve-confirming', approveTxHash }))
    }
  }, [approveTxHash, state.stage])

  // Approval confirmed → fire splitPay
  useEffect(() => {
    if (!approveSuccess) return
    if (state.stage !== 'approve-confirming') return
    const pending = pendingRef.current
    if (!pending) return
    setState((prev) => ({ ...prev, stage: 'splitting' }))
    writeSplit({
      address: SPLITPAY_ADDRESS,
      abi: SPLITPAY_ABI,
      functionName: 'splitPay',
      args: [pending.rawAmount, pending.contractShares],
      chainId: CHAIN_ID,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  useEffect(() => {
    if (splitTxHash && state.stage === 'splitting') {
      setState((prev) => ({ ...prev, stage: 'split-confirming', splitTxHash }))
    }
  }, [splitTxHash, state.stage])

  useEffect(() => {
    if (!splitSuccess || !splitTxHash) return
    if (state.stage !== 'split-confirming' && state.stage !== 'splitting') return
    const pending = pendingRef.current
    pendingRef.current = null
    setState((prev) => ({ ...prev, stage: 'success' }))

    // Write confirmed payment to activity log
    if (pending) {
      const dec = usdcDecimalsFor(CHAIN_ID)
      const amounts = calculateAmounts(pending.rawAmount, pending.contractShares.map((s) => ({
        address: s.recipient, basisPoints: s.basisPoints,
      })))
      activityStore.add({
        type: 'split',
        status: 'confirmed',
        txHash: splitTxHash,
        explorerUrl: buildTxExplorerUrl(CHAIN_ID, splitTxHash),
        totalAmount: formatUsdcAmount(pending.rawAmount, dec),
        recipients: pending.contractShares.map((s, i) => ({
          address: s.recipient,
          amount: formatUsdcAmount(amounts[i] ?? 0n, dec),
          basisPoints: s.basisPoints,
        })),
        chainId: CHAIN_ID,
        network: BRAND.network,
        timestamp: Math.floor(Date.now() / 1000),
      })
    }
  }, [splitSuccess, splitTxHash, state.stage])

  useEffect(() => {
    if (!splitError) return
    if (state.stage !== 'split-confirming' && state.stage !== 'splitting') return
    pendingRef.current = null
    setState({ stage: 'error', error: 'Payment failed on-chain. Check shares and try again.' })
  }, [splitError, state.stage])

  // ── execute ───────────────────────────────────────────────────────────────
  const execute = useCallback(
    (amountStr: string, shares: RecipientShare[], _mode: AllocationMode = 'percent') => {
      // Duplicate-submit guard
      if (pendingRef.current) return

      if (!address) {
        setState({ stage: 'error', error: 'Wallet not connected.' })
        return
      }
      if (chainId !== CHAIN_ID) {
        switchChain({ chainId: CHAIN_ID })
        return
      }

      // ── Parse amount ──────────────────────────────────────────────────────
      let rawAmount: bigint
      try {
        rawAmount = parseAmount(CHAIN_ID, amountStr).raw
      } catch {
        setState({ stage: 'error', error: 'Invalid amount.' })
        return
      }
      if (rawAmount <= 0n) {
        setState({ stage: 'error', error: 'Amount must be greater than zero.' })
        return
      }

      // ── Validate shares (mirrors contract logic — fast fail) ───────────────
      const validationError = validateShares(shares)
      if (validationError) {
        setState({ stage: 'error', error: validationError })
        return
      }

      // ── Balance check ─────────────────────────────────────────────────────
      const bal = usdcBalance ?? 0n
      if (bal < rawAmount) {
        const dec = usdcDecimalsFor(CHAIN_ID)
        const have = Amount.fromRaw(bal, dec).toFixed(2)
        const need = Amount.fromRaw(rawAmount, dec).toFixed(2)
        setState({
          stage: 'error',
          error: `Insufficient balance. You have ${have} USDC but need ${need} USDC.`,
        })
        return
      }

      // ── Build contract args ───────────────────────────────────────────────
      const contractShares = shares.map((s) => ({
        recipient: s.address as `0x${string}`,
        basisPoints: s.basisPoints,
      }))

      // Stash for the approve→split effect; also acts as duplicate-submit lock
      pendingRef.current = { rawAmount, contractShares }

      const currentAllowance = allowance ?? 0n

      if (currentAllowance < rawAmount) {
        setState({ stage: 'approving' })
        writeApprove({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [SPLITPAY_ADDRESS, rawAmount],
          chainId: CHAIN_ID,
        })
      } else {
        setState({ stage: 'splitting' })
        writeSplit({
          address: SPLITPAY_ADDRESS,
          abi: SPLITPAY_ABI,
          functionName: 'splitPay',
          args: [rawAmount, contractShares],
          chainId: CHAIN_ID,
        })
      }
    },
    [address, chainId, allowance, usdcBalance, writeApprove, writeSplit, switchChain, USDC_ADDRESS]
  )

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    pendingRef.current = null
    resetApprove()
    resetSplit()
    setState({ stage: 'idle' })
    void refetchAllowance()
    void refetchBalance()
  }, [resetApprove, resetSplit, refetchAllowance, refetchBalance])

  const explorerUrl = (state.splitTxHash ?? splitTxHash)
    ? buildTxExplorerUrl(CHAIN_ID, (state.splitTxHash ?? splitTxHash)!)
    : undefined

  const approveExplorerUrl = (state.approveTxHash ?? approveTxHash)
    ? buildTxExplorerUrl(CHAIN_ID, (state.approveTxHash ?? approveTxHash)!)
    : undefined

  return {
    execute,
    reset,
    state,
    approveWalletPending,
    approveConfirming,
    approveSuccess,
    approveTxHash,
    splitWalletPending,
    splitConfirming,
    splitSuccess,
    splitError,
    splitTxHash,
    explorerUrl,
    approveExplorerUrl,
    usdcBalance,
    allowance,
    isWrongChain: !!chainId && chainId !== CHAIN_ID,
    usdcFact,
  }
}

/**
 * Decode a contract revert into a user-facing message.
 * Matches custom error names from the SplitPay ABI.
 */
export function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance.'
  if (msg.includes('zeroamount')) return 'Amount must be greater than zero.'
  if (msg.includes('toofewrecipients')) return 'At least 2 recipients are required.'
  if (msg.includes('toomanyrecipients')) return 'Too many recipients (max 5).'
  if (msg.includes('zeroaddressrecipient')) return 'A recipient address is invalid (zero address).'
  if (msg.includes('zerosharebasispoin')) return 'Every recipient must have a share greater than 0%.'
  if (msg.includes('duplicaterecipient')) return 'Duplicate recipient address detected.'
  if (msg.includes('invalidtotalbasispoin')) return 'Shares must total exactly 100%.'
  if (msg.includes('distributionerror')) return 'Internal distribution error — no funds moved.'
  if (msg.includes('cannotrescueusdc')) return 'Cannot rescue USDC from this contract.'
  if (msg.includes('rescuezeroamount')) return 'Rescue amount must be greater than zero.'
  if (msg.includes('rescuetomustbecaller')) return 'Rescue: destination must be your own address.'
  if (msg.includes('amounttoolarge')) return 'Amount exceeds the maximum safe payment size.'
  if (msg.includes('reverted')) {
    const match = msg.match(/reason="([^"]+)"/)
    return match ? `Transaction failed: ${match[1]}` : 'Transaction reverted. Check shares and try again.'
  }
  if (msg.includes('network') || msg.includes('timeout')) return 'Network issue. Check your connection and retry.'
  return 'Something went wrong. Please try again.'
}

// Re-export for consumers that only need these helpers
export { sharesFromFixed, normaliseShares }
