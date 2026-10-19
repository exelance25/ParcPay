import { useAccount, useReadContracts } from 'wagmi'
import { erc20Abi } from 'viem'
import { CHAIN_ID, USDC_ADDRESS } from '@/chain'
import { PARCPAY_ADDRESS, PARCPAY_ABI, DEFAULT_FEE } from '@/contracts/parcpay'

/** Balance, allowance to ParcPay, current fee, treasury and pause state in one multicall. */
export function useUsdc() {
  const { address } = useAccount()
  const owner = address ?? '0x0000000000000000000000000000000000000000'
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [owner] },
      { chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [owner, PARCPAY_ADDRESS] },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'fee' },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'treasury' },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'paused' },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'owner' },
    ],
    query: { refetchInterval: 12_000 },
  })
  const d = q.data
  const val = <T,>(i: number) => (d?.[i]?.status === 'success' ? (d[i].result as T) : undefined)
  const fee = val<bigint>(2)
  return {
    balance: address ? val<bigint>(0) : undefined,
    allowance: address ? val<bigint>(1) ?? 0n : 0n,
    fee: fee ?? DEFAULT_FEE,
    feeLoaded: fee !== undefined,
    contractLive: fee !== undefined,
    treasury: val<`0x${string}`>(3),
    paused: val<boolean>(4) ?? false,
    owner: val<`0x${string}`>(5),
    refetch: q.refetch,
    isLoading: q.isLoading,
  }
}
