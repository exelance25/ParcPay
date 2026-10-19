/**
 * usePay — the 1–2 signature payment flow.
 *
 *  Always ONE wallet confirmation:
 *  • Allowance already covers total + fee → splitPay directly.
 *  • Otherwise → USDC.approve + splitPay batched in one tx via Arc's Multicall3From
 *    (msg.sender stays the user's wallet for both calls; all-or-nothing).
 */
import { useCallback, useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import {
  simulateContract,
  writeContract,
  waitForTransactionReceipt,
} from '@wagmi/core'
import { encodeFunctionData, erc20Abi, parseAbi } from 'viem'
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

/** Arc predeploy (mainnet + testnet): batches calls while keeping the user's wallet as msg.sender. */
const MULTICALL3_FROM = '0x522fAf9A91c41c443c66765030741e4AaCe147D0' as const
const MULTICALL3_FROM_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
])

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

        // One transaction: USDC.approve + ParcPay.splitPay through Arc's Multicall3From,
        // which keeps the wallet as msg.sender for both calls. If either call fails, both revert.
        if (needsApproval) {
          setState({ approve: 'wallet', pay: 'wallet', batched: true })
          const calls = [
            { target: USDC_ADDRESS, allowFailure: false, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PARCPAY_ADDRESS, approveAmount] }) },
            { target: PARCPAY_ADDRESS, allowFailure: false, callData: encodeFunctionData({ abi: PARCPAY_ABI, functionName: 'splitPay', args }) },
          ] as const
          const { request } = await simulateContract(config, {
            chainId: CHAIN_ID, account: address, address: MULTICALL3_FROM, abi: MULTICALL3_FROM_ABI, functionName: 'aggregate3', args: [calls],
          })
          const { gasPrice: _g, ...mreq } = request as typeof request & { gasPrice?: bigint }
          void _g
          const hash = await withFeeFallback(
            () => writeContract(config, { ...mreq, ...fees } as typeof request),
            () => writeContract(config, { ...mreq, maxFeePerGas: undefined, maxPriorityFeePerGas: undefined } as typeof request),
          )
          setState({ approve: 'pending', pay: 'pending', hash, batched: true })
          const receipt = await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
          if (receipt.status !== 'success') throw new Error(lang === 'tr' ? 'İşlem zincirde geri alındı.' : 'Transaction reverted.')
          setState({ approve: 'done', pay: 'done', hash, batched: true })
          addActivity({ kind: 'split', hash, total: total.toString(), fee: fee.toString(), recipients: transfers.map((t) => ({ to: t.to, amount: t.amount.toString() })), memo })
          void usdc.refetch()
          return
        }
        setState({ approve: 'done', pay: 'idle' })

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
    [address, chainId, config, usdc, lang],
  )

  return { pay, reset, state, usdc }
}
