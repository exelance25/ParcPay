/**
 * Testnet-only "burner" wallet that lives in this browser's localStorage.
 * Used for hands-free end-to-end testing on Arc Testnet. Never enabled on mainnet.
 */
import { injected } from 'wagmi/connectors'
import { createPublicClient, createWalletClient, http, numberToHex, hexToBigInt, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { CHAIN, CHAIN_ID, NETWORK, RPC_URL } from '@/chain'

const KEY = 'parcpay_burner_key_testnet'

function loadKey(): Hex {
  try {
    const k = localStorage.getItem(KEY)
    if (k && /^0x[0-9a-f]{64}$/i.test(k)) return k as Hex
    const n = generatePrivateKey()
    localStorage.setItem(KEY, n)
    return n
  } catch {
    return generatePrivateKey()
  }
}

export const burnerEnabled = NETWORK === 'testnet'

export function burnerAddress(): `0x${string}` | null {
  if (!burnerEnabled) return null
  return privateKeyToAccount(loadKey()).address
}

function makeProvider() {
  const account = privateKeyToAccount(loadKey())
  const pub = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) })
  const wallet = createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) })
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {}
  const big = (v?: string) => (v ? hexToBigInt(v as Hex) : undefined)
  return {
    isBurner: true,
    on: (e: string, f: (...a: unknown[]) => void) => { (listeners[e] ??= []).push(f) },
    removeListener: (e: string, f: (...a: unknown[]) => void) => { listeners[e] = (listeners[e] ?? []).filter((x) => x !== f) },
    async request({ method, params }: { method: string; params?: unknown[] }) {
      const p = (params ?? []) as Record<string, string>[]
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [account.address]
        case 'eth_chainId':
          return numberToHex(CHAIN_ID)
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
        case 'wallet_requestPermissions':
          return null
        case 'wallet_getCapabilities':
          return {}
        case 'eth_sendTransaction': {
          const t = p[0]
          return wallet.sendTransaction({
            to: t.to as Hex, data: t.data as Hex | undefined, value: big(t.value), gas: big(t.gas),
            maxFeePerGas: big(t.maxFeePerGas), maxPriorityFeePerGas: big(t.maxPriorityFeePerGas),
          } as never)
        }
        case 'personal_sign':
          return account.signMessage({ message: { raw: (params as Hex[])[0] } })
        case 'eth_signTypedData_v4': {
          const td = JSON.parse((params as string[])[1])
          const { EIP712Domain: _d, ...types } = td.types
          void _d
          return account.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message })
        }
        default:
          return pub.request({ method, params } as never)
      }
    },
  }
}

export const burnerConnector = injected({
  target: () => ({ id: 'parcpayBurner', name: 'Test cüzdanı (burner)', provider: makeProvider() as never }),
})
