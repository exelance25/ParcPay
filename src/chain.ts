/**
 * Active Arc network. Mainnet by default; set VITE_ARC_NETWORK=testnet for test runs.
 * USDC is the native gas token on Arc and also an ERC-20 (6 decimals) at 0x3600…0000.
 */
import { arc, arcTestnet } from 'viem/chains'

export const NETWORK: 'mainnet' | 'testnet' =
  import.meta.env.VITE_ARC_NETWORK === 'testnet' ? 'testnet' : 'mainnet'

export const CHAIN = NETWORK === 'testnet' ? arcTestnet : arc
export const CHAIN_ID = CHAIN.id
export const NETWORK_LABEL = NETWORK === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'
export const RPC_URL = NETWORK === 'testnet' ? 'https://rpc.testnet.arc.io' : 'https://rpc.mainnet.arc.io'
export const EXPLORER = NETWORK === 'testnet' ? 'https://explorer.testnet.arc.io' : 'https://explorer.arc.io'

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`
