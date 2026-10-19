/** Make sure the connected wallet knows Arc and is on it (adds the network if missing). */
import type { Config } from 'wagmi'
import { getAccount, getConnectorClient, switchChain } from '@wagmi/core'
import { numberToHex } from 'viem'
import { CHAIN, CHAIN_ID, EXPLORER, NETWORK_LABEL, RPC_URL } from '@/chain'

export async function ensureArc(config: Config) {
  const acc = getAccount(config)
  if (acc.chainId === CHAIN_ID) return
  try {
    await switchChain(config, { chainId: CHAIN_ID })
    return
  } catch {
    /* fall through to explicit add */
  }
  const client = await getConnectorClient(config)
  await client.request({
    method: 'wallet_addEthereumChain',
    params: [
      {
        chainId: numberToHex(CHAIN_ID),
        chainName: NETWORK_LABEL,
        nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
        rpcUrls: [RPC_URL],
        blockExplorerUrls: [EXPLORER],
      },
    ],
  } as never)
  if (getAccount(config).chainId !== CHAIN_ID) await switchChain(config, { chainId: CHAIN.id })
}

/** Arc enforces a 20 gwei base-fee floor; give wallets explicit, safe fee fields. */
export async function arcFees(config: Config) {
  const { getPublicClient } = await import('@wagmi/core')
  const pc = getPublicClient(config, { chainId: CHAIN_ID })
  const floor = 20_000_000_000n
  let base = floor
  try {
    const b = await pc!.getBlock()
    if (b.baseFeePerGas && b.baseFeePerGas > base) base = b.baseFeePerGas
  } catch {
    /* use floor */
  }
  const maxPriorityFeePerGas = 2_000_000_000n
  return { maxFeePerGas: base * 2n + maxPriorityFeePerGas, maxPriorityFeePerGas }
}
