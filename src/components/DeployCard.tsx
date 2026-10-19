import { useEffect, useState } from 'react'
import { useAccount, useBalance, useConfig, usePublicClient } from 'wagmi'
import { sendTransaction, waitForTransactionReceipt } from '@wagmi/core'
import { BaseError, concat, formatUnits, getContractAddress, keccak256 } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Rocket, Copy, Droplets } from 'lucide-react'
import initcodeHex from '../../deploy/ParcPay.initcode.hex?raw'
import saltHex from '../../deploy/salt.txt?raw'
import { CHAIN_ID, NETWORK, NETWORK_LABEL, txUrl } from '@/chain'
import { PARCPAY_ADDRESS } from '@/contracts/parcpay'
import { explainError } from '@/lib/errors'
import { ensureArc, arcFees } from '@/lib/network'
import { useT } from '@/lib/i18n'

const FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const
const INIT_HASH = '0xe11bdc1f339944e7044cfa3508957709a822e451b54bcebc3156d7adf326ad81'
const DEPLOY_GAS = 6_000_000n // measured ~4.2M on Arc for a contract of this size
const MIN_GAS_USDC = 300_000_000_000_000_000n // 0.3 USDC (native 18-dec view)

/** One-click CREATE2 deploy of ParcPay to the active Arc network. */
export function DeployCard({ onDeployed, compact }: { onDeployed?: () => void; compact?: boolean }) {
  const T = useT()
  const lang = T.lang
  const config = useConfig()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { isConnected, address, connector } = useAccount()
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 8000 } })
  const [busy, setBusy] = useState(false)
  const [hash, setHash] = useState<string>()
  const [factoryOk, setFactoryOk] = useState<boolean | null>(null)
  const [error, setError] = useState<{ short: string; detail: string } | null>(null)

  const init = `0x${initcodeHex.trim().replace(/^0x/, '')}` as `0x${string}`
  const salt = saltHex.trim() as `0x${string}`
  const predicted = getContractAddress({ opcode: 'CREATE2', from: FACTORY, salt, bytecode: init })
  const matches = predicted.toLowerCase() === PARCPAY_ADDRESS.toLowerCase() && keccak256(init) === INIT_HASH

  useEffect(() => {
    let on = true
    client?.getCode({ address: FACTORY }).then((c) => on && setFactoryOk(!!c && c !== '0x')).catch(() => on && setFactoryOk(null))
    return () => {
      on = false
    }
  }, [client])

  const native = gas.data?.value
  const noGas = native !== undefined && native < MIN_GAS_USDC

  const deploy = async () => {
    setBusy(true)
    setError(null)
    try {
      await ensureArc(config)
      // Already deployed by someone else in the meantime? Nothing to do.
      const code = await client?.getCode({ address: predicted }).catch(() => undefined)
      if (code && code !== '0x') {
        toast.success(T('Kontrat zaten kurulu.', 'Contract is already deployed.'))
        onDeployed?.()
        return
      }
      const fees = await arcFees(config)
      const base = { chainId: CHAIN_ID, to: FACTORY, data: concat([salt, init]), gas: DEPLOY_GAS } as const
      let h: `0x${string}`
      try {
        h = await sendTransaction(config, { ...base, ...fees })
      } catch (e) {
        const m = String((e as Error)?.message ?? '').toLowerCase()
        if (m.includes('user rejected') || m.includes('user denied')) throw e
        h = await sendTransaction(config, base)
      }
      setHash(h)
      const r = await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash: h })
      const after = await client?.getCode({ address: predicted })
      if (r.status !== 'success' || !after || after === '0x') throw new Error(T('İşlem zincirde başarısız oldu.', 'The transaction failed onchain.'))
      toast.success(T('ParcPay kuruldu. Artık ödeme gönderebilirsin.', 'ParcPay is live. You can send payments now.'))
      onDeployed?.()
    } catch (e) {
      const detail = e instanceof BaseError ? `${e.shortMessage}\n${e.details ?? ''}`.trim() : e instanceof Error ? e.message : String(e)
      setError({ short: explainError(e, lang), detail: `${detail}\n\nwallet: ${connector?.name ?? '?'} · chain: ${CHAIN_ID}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`deploy-card ${compact ? 'p-5' : 'p-6'}`}>
      <div className="flex items-start gap-3">
        <span className="deploy-icon"><Rocket size={18} /></span>
        <div className="min-w-0">
          <h2 className="t-2 m-0">{T(`ParcPay ${NETWORK_LABEL} üzerinde henüz kurulu değil`, `ParcPay isn't on ${NETWORK_LABEL} yet`)}</h2>
          <p className="small muted mt-1 mb-0">
            {NETWORK === 'testnet'
              ? T('Bir kereye mahsus kurulum: tek onay, yaklaşık 0,2 test USDC gas. Gerçek para gitmez.', 'One-time setup: one approval, about 0.2 test USDC gas. No real money.')
              : T('Bir kereye mahsus kurulum: tek onay, yaklaşık 0,2 USDC gas (gerçek).', 'One-time setup: one approval, about 0.2 USDC real gas.')}
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2 p-0 m-0 list-none small">
        <li className="flex items-center gap-2">
          <span className="step-dot" style={{ background: isConnected ? 'var(--settle-wash)' : 'var(--usdc-wash)', color: isConnected ? 'var(--settle)' : 'var(--usdc-deep)' }}>1</span>
          {isConnected ? T(`Cüzdan bağlı: ${connector?.name ?? ''}`, `Wallet connected: ${connector?.name ?? ''}`) : T('Cüzdan bağla (MetaMask önerilir)', 'Connect a wallet (MetaMask recommended)')}
        </li>
        <li className="flex items-center gap-2">
          <span className="step-dot" style={{ background: isConnected && !noGas && native !== undefined ? 'var(--settle-wash)' : 'var(--usdc-wash)', color: isConnected && !noGas && native !== undefined ? 'var(--settle)' : 'var(--usdc-deep)' }}>2</span>
          <span>
            {T('Gas için test USDC', 'Test USDC for gas')}
            {native !== undefined && <span className="num faint"> · {T('bakiye', 'balance')} {Number(formatUnits(native, 18)).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 4 })} USDC</span>}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="step-dot" style={{ background: 'var(--usdc-wash)', color: 'var(--usdc-deep)' }}>3</span>
          {T('Kontratı kur', 'Deploy the contract')}
        </li>
      </ol>

      {isConnected && noGas && NETWORK === 'testnet' && (
        <div className="inset p-3 mt-4 small space-y-2">
          <p className="m-0">{T('Kurulum için cüzdanında en az 0,3 test USDC olmalı. Faucet’te “Arc Testnet”i seç ve bu adresi yapıştır:', 'You need at least 0.3 test USDC. On the faucet pick “Arc Testnet” and paste this address:')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="num break-all">{address}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(address ?? ''); toast.success(T('Adres kopyalandı', 'Address copied')) }}><Copy size={14} /> {T('Kopyala', 'Copy')}</button>
            <a className="btn btn-ghost btn-sm" href="https://faucet.circle.com" target="_blank" rel="noreferrer"><Droplets size={14} /> faucet.circle.com</a>
          </div>
        </div>
      )}

      <dl className="mt-4 grid gap-1 small m-0">
        <div className="flex flex-wrap gap-x-2"><dt className="faint">{T('Adres', 'Address')}</dt><dd className="m-0 num break-all">{predicted} {matches ? '✓' : '✗'}</dd></div>
        {factoryOk === false && <div style={{ color: 'var(--danger)' }}>{T('Bu ağda CREATE2 kurucu bulunamadı.', 'CREATE2 deployer not found on this network.')}</div>}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        {!isConnected ? (
          <ConnectKitButton.Custom>{({ show }) => <button type="button" className="btn btn-arc btn-lg" onClick={show}>{T('Cüzdan bağla', 'Connect wallet')}</button>}</ConnectKitButton.Custom>
        ) : (
          <button type="button" className="btn btn-arc btn-lg" disabled={!matches || busy || factoryOk === false || noGas} onClick={deploy}>
            {busy ? T('Kuruluyor… cüzdanı onayla', 'Deploying… confirm in wallet') : T('Kontratı kur (1 onay)', 'Deploy contract (1 approval)')}
          </button>
        )}
        {hash && <a className="small" href={txUrl(hash)} target="_blank" rel="noreferrer">{T('İşlemi explorer’da gör', 'View on explorer')}</a>}
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-xl small" style={{ background: 'var(--danger-wash)', color: 'var(--danger)' }}>
          <p className="m-0 font-semibold">{error.short}</p>
          <details className="mt-2">
            <summary className="cursor-pointer">{T('Teknik ayrıntı', 'Technical details')}</summary>
            <pre className="whitespace-pre-wrap break-all mt-2 mb-2" style={{ color: 'var(--ink-2)', fontSize: '0.78rem' }}>{error.detail}</pre>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(error.detail); toast.success(T('Kopyalandı', 'Copied')) }}><Copy size={14} /> {T('Hatayı kopyala', 'Copy error')}</button>
          </details>
        </div>
      )}
    </section>
  )
}
