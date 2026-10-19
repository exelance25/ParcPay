import { useState } from 'react'
import { useAccount, useConfig } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { DeployCard } from '@/components/DeployCard'
import { toast } from 'sonner'
import { Page } from '@/components/Shell'
import { useUsdc } from '@/hooks/useUsdc'
import { PARCPAY_ABI, PARCPAY_ADDRESS, TREASURY } from '@/contracts/parcpay'
import { addressUrl, CHAIN_ID, NETWORK_LABEL, USDC_ADDRESS } from '@/chain'
import { fmt, toRaw } from '@/lib/money'
import { explainError } from '@/lib/errors'
import { useT } from '@/lib/i18n'

export function ContractPage() {
  const T = useT()
  const lang = T.lang
  const config = useConfig()
  const { address } = useAccount()
  const u = useUsdc()
  const isOwner = !!address && !!u.owner && address.toLowerCase() === u.owner.toLowerCase()
  const [newFee, setNewFee] = useState('0.001')

  const send = async (fn: 'pause' | 'unpause' | 'setFee', args?: readonly [bigint]) => {
    try {
      const hash = await writeContract(config, { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: fn, args } as never)
      await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
      toast.success(T('Güncellendi', 'Updated'))
      void u.refetch()
    } catch (e) {
      toast.error(explainError(e, lang))
    }
  }

  const rows: [string, React.ReactNode][] = [
    [T('Ağ', 'Network'), NETWORK_LABEL],
    ['ParcPay', <a className="num break-all" href={addressUrl(PARCPAY_ADDRESS)} target="_blank" rel="noreferrer">{PARCPAY_ADDRESS}</a>],
    ['USDC', <span className="num break-all">{USDC_ADDRESS}</span>],
    [T('Kasa (ücret alıcısı)', 'Treasury (fee receiver)'), <a className="num break-all" href={addressUrl(u.treasury ?? TREASURY)} target="_blank" rel="noreferrer">{u.treasury ?? TREASURY}</a>],
    [T('Ödeme başına ücret', 'Fee per payment'), `${fmt(u.fee, lang, 6)} USDC${u.feeLoaded ? '' : T(' (varsayılan)', ' (default)')}`],
    [T('Ücret tavanı', 'Fee ceiling'), '0,10 USDC'],
    [T('Durum', 'Status'), u.contractLive ? (u.paused ? T('Durduruldu', 'Paused') : T('Aktif', 'Active')) : T('Bu ağda bulunamadı', 'Not found on this network')],
  ]

  return (
    <Page title={T('Kontrat', 'Contract')} intro={T('ParcPay’in zincirdeki ayarları. Herkes doğrulayabilir.', 'ParcPay’s onchain settings, verifiable by anyone.')}>
      <dl className="panel p-0 m-0 overflow-hidden max-w-3xl">
        {rows.map(([k, v]) => (
          <div key={k} className="grid sm:grid-cols-[220px_1fr] gap-1 p-4" style={{ borderBottom: '1px solid var(--line)' }}>
            <dt className="muted small">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
      {!u.contractLive && !u.isLoading && <div className="mt-6 max-w-3xl"><DeployCard onDeployed={() => void u.refetch()} /></div>}
      {isOwner && (
        <section className="panel p-5 mt-6 max-w-3xl space-y-4">
          <h2 className="t-2">{T('Yönetim', 'Admin')}</h2>
          <p className="small muted m-0">{T('Yönetici ücreti 0,10 USDC’ye kadar değiştirebilir ve ödemeleri durdurabilir. Kullanıcı fonlarına erişimi yoktur.', 'The owner can set the fee up to 0.10 USDC and pause payments. It has no access to user funds.')}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <input className="field num" style={{ maxWidth: 160 }} value={newFee} onChange={(e) => setNewFee(e.target.value)} aria-label={T('Yeni ücret', 'New fee')} />
            <button type="button" className="btn btn-primary" onClick={() => { const r = toRaw(newFee); if (r !== null) void send('setFee', [r]) }}>{T('Ücreti ayarla', 'Set fee')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => void send(u.paused ? 'unpause' : 'pause')}>{u.paused ? T('Devam ettir', 'Unpause') : T('Durdur', 'Pause')}</button>
          </div>
        </section>
      )}
    </Page>
  )
}
