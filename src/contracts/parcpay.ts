/**
 * ParcPay contract wiring.
 *
 * The contract is deployed with CREATE2 through the canonical deterministic deployer
 * (0x4e59b44847b379578588920cA78FbF26c0B4956C, present on Arc Mainnet and Testnet), so the
 * address is identical on both networks and starts with zeros (short & recognisable).
 * Init code: deploy/ParcPay.initcode.hex — salt: deploy/README.md.
 */
import { CHAIN_ID } from '@/chain'
export { PARCPAY_ABI } from './parcpay.abi'

const DEFAULT_ADDRESS = '0x000000001a03e01a185A6Ab09cd14AeE2398b55c'

export const PARCPAY_ADDRESS = ((import.meta.env.VITE_PARCPAY_ADDRESS as string | undefined) ||
  DEFAULT_ADDRESS) as `0x${string}`

/** Protocol treasury (fee receiver) — also the contract owner. */
export const TREASURY = '0x9A5f2d1066D2a265EeB82baa7D6038Ca92469858' as const

/** Fee used before the onchain value is loaded (0.001 USDC). */
export const DEFAULT_FEE = 1_000n

export const MAX_RECIPIENTS = 50

export interface Transfer {
  to: `0x${string}`
  amount: bigint
}

export interface Order {
  payer: `0x${string}`
  transfers: Transfer[]
  maxFee: bigint
  start: bigint
  interval: bigint
  runs: number
  expiry: bigint
  nonce: bigint
  memo: `0x${string}`
}

export const EIP712_DOMAIN = {
  name: 'ParcPay',
  version: '2',
  chainId: CHAIN_ID,
  verifyingContract: PARCPAY_ADDRESS,
} as const

export const ORDER_TYPES = {
  Transfer: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  Order: [
    { name: 'payer', type: 'address' },
    { name: 'transfers', type: 'Transfer[]' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'start', type: 'uint64' },
    { name: 'interval', type: 'uint64' },
    { name: 'runs', type: 'uint32' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'memo', type: 'bytes32' },
  ],
} as const
