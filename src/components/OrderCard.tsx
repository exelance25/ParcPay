import { useEffect, useState } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { toast } from 'sonner'
import { Copy, Play, XCircle, ExternalLink } from 'lucide-react'
import { CHAIN_ID, txUrl } from '@/chain'
import { PARCPAY_ABI, PARCPAY_ADDRESS } from '@/contracts/parcpay'
import { orderLink, useOrderActions, type SignedOrder } from '@/hooks/useOrders'
import { fmt, memoFromBytes32, short } from '@/lib/money'
import { explainError } from '@/lib/errors'
import { useT } from '@/lib/i18n'

export function useOrderStatus(so: SignedOrder) {
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'runsExecuted', args: [so.hash] },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'cancelled', args: [so.order.payer, so.hash] },
      { chainId: CHAIN_ID, address: PARCPAY_ADDRESS, abi: PARCPAY_ABI, functionName: 'minNonce', args: [so.order.payer] },
    ],
    query: { refetchInterval: 10_000 },
  })
  const runs = q.data?.[0]?.status === 'success' ? Number(q.data[0].result) : 0
  const cancelled = q.data?.[1]?.status === 'success' ? (q.data[1].result as boolean) : false
  const minNonce = q.data?.[2]?.status === 'success' ? (q.data[2].result as bigint) : 0n
  const revoked = so.order.nonce < minNonce
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 5_000)
    return () => clearInterval(id)
  }, [])
  const now = BigInt(nowSec)
  const nextAt = so.order.start + BigInt(runs) * so.order.interval
  const finished = runs >= so.order.runs
  const expired = now > so.order.expiry
  const status: 'done' | 'cancelled' | 'expired' | 'due' | 'waiting' = cancelled || revoked ? 'cancelled' : finished ? 'done' : expired ? 'expired' : now >= nextAt ? 'due' : 'waiting'
  return { runs, status, nextAt, refetch: q.refetch }
}

export function formatDate(ts: bigint, lang: 'tr' | 'en') {
  return new Date(Number(ts) * 1000).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function OrderCard({ so, owner }: { so: SignedOrder; owner?: boolean }) {
  const T = useT()
  const lang = T.lang
  const { address } = useAccount()
  const { execute, cancel } = useOrderActions()
  const st = useOrderStatus(so)
  const [busy, setBusy] = useState<'exec' | 'cancel' | null>(null)
  const [lastTx, setLastTx] = useState<string>()
  const perRun = so.order.transfers.reduce((s, t) => s + t.amount, 0n)
  const isPayer = address?.toLowerCase() === so.order.payer.toLowerCase()
  const memo = memoFromBytes32(so.order.memo)

  const label = {
    done: [T('Tamamlandı', 'Completed'), 'pill-green'],
    cancelled: [T('İptal edildi', 'Cancelled'), 'pill-red'],
    expired: [T('Süresi doldu', 'Expired'), 'pill-grey'],
    due: [T('Ödemeye hazır', 'Ready to pay'), 'pill-blue'],
    waiting: [T('Bekliyor', 'Waiting'), 'pill-warn'],
  }[st.status]

  const run = async () => {
    setBusy('exec')
    try {
      const h = await execute(so)
      setLastTx(h)
      toast.success(T('Ödeme yapıldı', 'Payment executed'))
      void st.refetch()
    } catch (e) {
      toast.error(explainError(e, lang))
    } finally {
      setBusy(null)
    }
  }
  const stop = async () => {
    setBusy('cancel')
    try {
      await cancel(so)
      toast.success(T('Emir iptal edildi', 'Order cancelled'))
      void st.refetch()
    } catch (e) {
      toast.error(explainError(e, lang))
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-2 truncate">{so.label || memo || T('Planlı ödeme', 'Scheduled payment')}</h3>
          <p className="small faint m-0 num">{T('Ödeyen', 'Payer')} {short(so.order.payer)} · {so.order.transfers.length} {T('alıcı', 'recipients')}</p>
        </div>
        <span className={`pill ${label[1]}`}>{label[0]}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div className="inset p-3"><span className="block small faint">{T('Her ödeme', 'Per run')}</span><span className="num font-semibold">{fmt(perRun, lang)} USDC</span></div>
        <div className="inset p-3"><span className="block small faint">{T('İlerleme', 'Progress')}</span><span className="num font-semibold">{st.runs} / {so.order.runs}</span></div>
        <div className="inset p-3"><span className="block small faint">{st.status === 'waiting' || st.status === 'due' ? T('Sıradaki', 'Next') : T('Bitiş', 'Ends')}</span><span className="num font-semibold small">{formatDate(st.status === 'waiting' || st.status === 'due' ? st.nextAt : so.order.expiry, lang)}</span></div>
      </div>
      <details className="mt-3">
        <summary className="small muted cursor-pointer">{T('Alıcılar', 'Recipients')}</summary>
        <ul className="mt-2 p-0 list-none space-y-1">
          {so.order.transfers.map((t) => (
            <li key={t.to} className="flex justify-between small num"><span>{short(t.to)}</span><span>{fmt(t.amount, lang)}</span></li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" className="btn btn-blue btn-sm" disabled={st.status !== 'due' || !address || !!busy} onClick={run}>
          <Play size={14} /> {busy === 'exec' ? T('İşleniyor…', 'Processing…') : T('Şimdi öde', 'Pay now')}
        </button>
        {owner && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(orderLink(so)); toast.success(T('Link kopyalandı', 'Link copied')) }}>
            <Copy size={14} /> {T('Linki kopyala', 'Copy link')}
          </button>
        )}
        {isPayer && (st.status === 'waiting' || st.status === 'due') && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={stop}>
            <XCircle size={14} /> {busy === 'cancel' ? T('İptal ediliyor…', 'Cancelling…') : T('İptal et', 'Cancel')}
          </button>
        )}
        {lastTx && <a className="btn btn-ghost btn-sm" href={txUrl(lastTx)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Explorer</a>}
      </div>
    </article>
  )
}
