/**
 * usePay — the 1–2 signature payment flow.
 *
 *  • Allowance already covers total + fee → 1 signature (splitPay).
 *  • Wallet supports atomic batching (EIP-5792, e.g. smart accounts) → 1 prompt: approve + splitPay.
 *  • Otherwise → 2 signatures: approve, then splitPay. With "allow future payments" the approval
 *    covers a budget, so every later payment is a single signature.
 */
import { useCallback, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
  sendCalls,
  waitForCallsStatus,
} from '@wagmi/core'
import { encodeFunctionData, erc20Abi } from 'viem'
import { CHAIN_ID, USDC_ADDRESS } from '@/chain'
import { PARCPAY_ADDRESS, PARCPAY_ABI, type Transfer } from '@/contracts/parcpay'
import { explainError } from '@/lib/errors'
import { addActivity } from '@/lib/activity'
import { ensureArc, arcFees } from '@/lib/network'
import { useUsdc } from './useUsdc'

export type StepState = 'idle' | 'wallet' | 'pending' | 'done' | 'error'
export interface PayState {
  approve: StepState
  pay: StepState
  hash?: `0x${string}`
  approveHash?: `0x${string}`
  error?: string
  batched?: boolean
}

const IDLE: PayState = { approve: 'idle', pay: 'idle' }

function isUserRejection(e: unknown) {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase()
  return m.includes('user rejected') || m.includes('user denied') || (e as { code?: number })?.code === 4001
}

/** Some wallets reject explicit EIP-1559 fee fields ("Invalid parameters"); retry letting the wallet pick fees. */
async function withFeeFallback<T>(withFees: () => Promise<T>, plain: () => Promise<T>): Promise<T> {
  try {
    return await withFees()
  } catch (e) {
    if (isUserRejection(e)) throw e
    const m = String((e as { message?: string; details?: string })?.message ?? '').toLowerCase() + String((e as { details?: string })?.details ?? '').toLowerCase()
    if (m.includes('invalid param') || m.includes('-32602') || m.includes('fee')) return plain()
    throw e
  }
}

export function usePay(lang: 'tr' | 'en') {
  const config = useConfig()
  const { address, chainId } = useAccount()
  const usdc = useUsdc()
  const [state, setState] = useState<PayState>(IDLE)

  // EIP-5792 batching is disabled: MetaMask offers a smart-account upgrade for it, which is not
  // available on Arc and shows a blocking alert. Approve → pay (2 prompts, or 1 with a budget) works everywhere.
  const atomic = false as boolean

  const reset = useCallback(() => setState(IDLE), [])

  const pay = useCallback(
    async (transfers: Transfer[], memo: `0x${string}`, budget?: bigint) => {
      if (!address) return
      const fee = usdc.fee
      const total = transfers.reduce((s, t) => s + t.amount, 0n)
      const needed = total + fee
      const approveAmount = budget && budget > needed ? budget : needed
      const args = [transfers, fee, memo] as const
      try {
        if (chainId !== CHAIN_ID) await ensureArc(config)
        const fees = await arcFees(config)
        if (usdc.balance !== undefined && usdc.balance < needed) {
          throw new Error(lang === 'tr' ? 'USDC bakiyesi yetersiz.' : 'Not enough USDC.')
        }
        const needsApproval = usdc.allowance < needed

        // Try one-prompt batching (EIP-5792) when the wallet advertises it; if the wallet refuses
        // for this chain (MetaMask does on some networks), silently fall back to approve → pay.
        if (needsApproval && atomic) {
          try {
            setState({ approve: 'wallet', pay: 'wallet', batched: true })
            const { id } = await sendCalls(config, {
              chainId: CHAIN_ID,
              calls: [
                { to: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PARCPAY_ADDRESS, approveAmount] }) },
                { to: PARCPAY_ADDRESS, data: encodeFunctionData({ abi: PARCPAY_ABI, functionName: 'splitPay', args }) },
              ],
            })
            setState({ approve: 'pending', pay: 'pending', batched: true })
            const res = await waitForCallsStatus(config, { id })
            const hash = res.receipts?.[res.receipts.length - 1]?.transactionHash
            if (res.status !== 'success' || !hash) throw new Error('batch failed')
            setState({ approve: 'done', pay: 'done', hash, batched: true })
            addActivity({ kind: 'split', hash, total: total.toString(), fee: fee.toString(), recipients: transfers.map((t) => ({ to: t.to, amount: t.amount.toString() })), memo })
            void usdc.refetch()
            return
          } catch (e) {
            if (isUserRejection(e)) throw e
            console.warn('[parcpay] batched call unavailable, falling back to approve → pay', e)
            setState({ approve: 'idle', pay: 'idle' })
          }
        }

        if (needsApproval) {
          setState({ approve: 'wallet', pay: 'idle' })
          const approveReq = { chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [PARCPAY_ADDRESS, approveAmount] } as const
          const approveHash = await withFeeFallback(
            () => writeContract(config, { ...approveReq, ...fees }),
            () => writeContract(config, approveReq),
          )
          setState({ approve: 'pending', pay: 'idle', approveHash })
          await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash: approveHash })
          setState((s) => ({ ...s, approve: 'done' }))
        } else {
          setState({ approve: 'done', pay: 'idle' })
        }

        setState((s) => ({ ...s, pay: 'wallet' }))
        const { request } = await simulateContract(config, {
          chainId: CHAIN_ID, account: address, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'splitPay', args,
        })
        const { gasPrice: _gp, ...req } = request as typeof request & { gasPrice?: bigint }
        void _gp
        const hash = await withFeeFallback(
          () => writeContract(config, { ...req, ...fees } as typeof request),
          () => writeContract(config, { ...req, maxFeePerGas: undefined, maxPriorityFeePerGas: undefined } as typeof request),
        )
        setState((s) => ({ ...s, pay: 'pending', hash }))
        const receipt = await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
        if (receipt.status !== 'success') throw new Error(lang === 'tr' ? 'İşlem zincirde geri alındı.' : 'Transaction reverted.')
        setState((s) => ({ ...s, pay: 'done' }))
        addActivity({ kind: 'split', hash, total: total.toString(), fee: fee.toString(), recipients: transfers.map((t) => ({ to: t.to, amount: t.amount.toString() })), memo })
        void usdc.refetch()
      } catch (e) {
        const msg = e instanceof Error && !('shortMessage' in e) ? e.message : explainError(e, lang)
        setState((s) => ({
          ...s,
          approve: s.approve === 'done' ? 'done' : s.approve === 'idle' ? 'idle' : 'error',
          pay: s.pay === 'idle' ? 'idle' : 'error',
          error: msg,
        }))
        void usdc.refetch()
      }
    },
    [address, chainId, config, usdc, atomic, lang],
  )

  return { pay, reset, state, usdc, atomic }
}
