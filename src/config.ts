import { http, fallback, createConfig, unstable_connector } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { CHAIN, RPC_URL } from './chain'
import { registerChain } from './tracing'
import { burnerConnector, burnerEnabled } from './lib/burner'

registerChain(CHAIN.id, RPC_URL)

// Several public Arc RPCs + the wallet's own RPC as last resort. If the browser can't reach one
// endpoint (CORS, ad-blocker, VPN, outage) the next one is used automatically.
const rpcs = [RPC_URL, ...CHAIN.rpcUrls.default.http.filter((u) => u !== RPC_URL)]

export const config = createConfig({
  chains: [CHAIN],
  multiInjectedProviderDiscovery: true,
  connectors: [injected({ target: 'metaMask' }), injected(), ...(burnerEnabled ? [burnerConnector] : [])],
  transports: {
    [CHAIN.id]: fallback([
      ...rpcs.map((u) => http(u, { timeout: 8_000, retryCount: 1 })),
      unstable_connector(injected),
    ]),
  } as Record<typeof CHAIN.id, ReturnType<typeof fallback>>,
})
