import { useEffect, useState } from 'react'
import { useAccount, useBalance, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { burnerAddress, burnerConnector, burnerEnabled } from '@/lib/burner'
import { CHAIN_ID, USDC_ADDRESS } from '@/chain'
import { fmt } from '@/lib/money'
import { Page } from '@/components/Shell'
import { CHAIN } from '@/chain'
import { PARCPAY_ADDRESS } from '@/contracts/parcpay'

type Row = { url: string; ok: boolean; ms: number; out: string }

async function rpc(url: string, method: string, params: unknown[] = []) {
  const t = performance.now()
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const j = await r.json()
    return { ok: r.ok && !j.error, ms: Math.round(performance.now() - t), out: JSON.stringify(j.result ?? j.error).slice(0, 80) }
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t), out: String(e) }
  }
}

export function DebugPage() {
  const { address, connector, chainId } = useAccount()
  const [rows, setRows] = useState<Row[]>([])
  const [wallet, setWallet] = useState<string>('…')
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const bAddr = burnerAddress()
  const bNative = useBalance({ address: bAddr ?? undefined, chainId: CHAIN_ID, query: { enabled: !!bAddr, refetchInterval: 5000 } })
  const bUsdc = useReadContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: bAddr ? [bAddr] : undefined, chainId: CHAIN_ID, query: { enabled: !!bAddr, refetchInterval: 5000 } })
  void burnerConnector

  useEffect(() => {
    void (async () => {
      const out: Row[] = []
      for (const url of CHAIN.rpcUrls.default.http) {
        const r = await rpc(url, 'eth_chainId')
        out.push({ url, ...r })
        setRows([...out])
      }
      const r = await rpc(CHAIN.rpcUrls.default.http[0], 'eth_getCode', [PARCPAY_ADDRESS, 'latest'])
      out.push({ url: 'getCode ParcPay', ...r })
      setRows([...out])
      // Read-only Arc MAINNET checks (no transactions)
      const M = 'https://rpc.mainnet.arc.io'
      const checks: [string, string, unknown[]][] = [
        ['MAINNET eth_chainId', 'eth_chainId', []],
        ['MAINNET CREATE2 deployer code', 'eth_getCode', ['0x4e59b44847b379578588920cA78FbF26c0B4956C', 'latest']],
        ['MAINNET USDC decimals()', 'eth_call', [{ to: '0x3600000000000000000000000000000000000000', data: '0x313ce567' }, 'latest']],
        ['MAINNET USDC symbol()', 'eth_call', [{ to: '0x3600000000000000000000000000000000000000', data: '0x95d89b41' }, 'latest']],
        ['MAINNET ParcPay code (should be 0x before deploy)', 'eth_getCode', [PARCPAY_ADDRESS, 'latest']],
        ['MAINNET Multicall3 code', 'eth_getCode', ['0xcA11bde05977b3631167028862bE2a173976CA11', 'latest']],
        ['MAINNET gasPrice', 'eth_gasPrice', []],
      ]
      for (const [label, method, params] of checks) {
        const c = await rpc(M, method, params)
        out.push({ url: label, ...c, out: c.out.length > 60 ? `${c.out.slice(0, 40)}… (${c.out.length} chars)` : c.out })
        setRows([...out])
      }
    })()
  }, [])

  useEffect(() => {
    if (!connector) return
    void (async () => {
      try {
        const p = (await connector.getProvider()) as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
        const id = await p.request({ method: 'eth_chainId' })
        const bal = address ? await p.request({ method: 'eth_getBalance', params: [address, 'latest'] }) : '-'
        setWallet(`chainId ${id} · balance ${bal}`)
      } catch (e) {
        setWallet(String(e))
      }
    })()
  }, [connector, address])

  return (
    <Page title="Tanı" intro="Tarayıcının Arc sunucularına ve cüzdana erişimi.">
      <div className="panel p-5 space-y-2 small num">
        {rows.map((r) => (
          <div key={r.url} className="flex flex-wrap gap-2">
            <span style={{ color: r.ok ? 'var(--settle)' : 'var(--danger)' }}>{r.ok ? 'OK' : 'HATA'}</span>
            <span>{r.url}</span>
            <span className="faint">{r.ms} ms</span>
            <span className="faint break-all">{r.out}</span>
          </div>
        ))}
        <hr className="rule-dash" />
        <div>Cüzdan: {connector?.name ?? 'bağlı değil'} · hesap {address ?? '-'} · ağ {chainId ?? '-'}</div>
        <div>Cüzdan RPC: {wallet}</div>
      </div>
      {burnerEnabled && bAddr && (
        <div className="panel p-5 mt-4 space-y-3 small">
          <h2 className="t-2">Test cüzdanı (yalnız Arc Testnet)</h2>
          <div className="num break-all">Adres: <b id="burner-address">{bAddr}</b></div>
          <div className="num">Bakiye: {bUsdc.data !== undefined ? fmt(bUsdc.data as bigint, 'tr') : '…'} USDC {bNative.data ? `(gas görünümü ${bNative.data.formatted})` : ''}</div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn btn-arc btn-sm" onClick={() => { const c = connectors.find((x) => x.id === 'parcpayBurner'); if (c) connect({ connector: c }) }}>Test cüzdanını bağla</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect()}>Bağlantıyı kes</button>
          </div>
        </div>
      )}
    </Page>
  )
}
