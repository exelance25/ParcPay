import { useMemo, useState } from 'react'
import { Plus, Trash2, Copy, ShieldOff } from 'lucide-react'
import { useAccount, useConfig } from 'wagmi'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { erc20Abi } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Page } from '@/components/Shell'
import { OrderCard } from '@/components/OrderCard'
import { Step } from '@/components/Steps'
import type { StepState } from '@/hooks/usePay'
import { useT } from '@/lib/i18n'
import { buildTransfers, fmt, memoToBytes32, type Row } from '@/lib/money'
import { explainError } from '@/lib/errors'
import { useUsdc } from '@/hooks/useUsdc'
import { orderLink, useMyOrders, useOrderActions, type SignedOrder } from '@/hooks/useOrders'
import { CHAIN_ID, USDC_ADDRESS } from '@/chain'
import { MAX_RECIPIENTS, PARCPAY_ADDRESS } from '@/contracts/parcpay'

type Kind = 'once' | 'repeat'
const DAY = 86_400n

function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SchedulePage() {
  const T = useT()
  const lang = T.lang
  const config = useConfig()
  const { address, isConnected } = useAccount()
  const usdc = useUsdc()
  const { sign, revokeAll } = useOrderActions()
  const mine = useMyOrders(address)

  const [label, setLabel] = useState('')
  const [rows, setRows] = useState<Row[]>([{ address: '', value: '' }])
  const [kind, setKind] = useState<Kind>('once')
  const [start, setStart] = useState(defaultStart)
  const [everyDays, setEveryDays] = useState('30')
  const [runs, setRuns] = useState('12')
  const [graceDays, setGraceDays] = useState('30')
  const [approveState, setApproveState] = useState<StepState>('idle')
  const [signState, setSignState] = useState<StepState>('idle')
  const [created, setCreated] = useState<SignedOrder | null>(null)
  const [error, setError] = useState<string>()

  const built = useMemo(() => buildTransfers(rows, 'amount', '', lang), [rows, lang])
  const nRuns = kind === 'once' ? 1 : Math.max(1, Math.min(1000, parseInt(runs) || 0))
  const interval = kind === 'once' ? 0n : BigInt(Math.max(1, parseInt(everyDays) || 0)) * DAY
  const startTs = BigInt(Math.floor(new Date(start).getTime() / 1000) || 0)
  const expiry = startTs + interval * BigInt(nRuns - 1) + BigInt(Math.max(1, parseInt(graceDays) || 0)) * DAY
  const perRun = built.error ? 0n : built.total + usdc.fee
  const commitment = perRun * BigInt(nRuns)
  const needsApproval = !built.error && usdc.allowance < commitment
  const ready = !built.error && startTs > 0n && (kind === 'once' || (parseInt(runs) >= 2 && parseInt(everyDays) >= 1))

  const doApprove = async () => {
    setError(undefined)
    setApproveState('wallet')
    try {
      const hash = await writeContract(config, { chainId: CHAIN_ID, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [PARCPAY_ADDRESS, commitment] })
      setApproveState('pending')
      await waitForTransactionReceipt(config, { chainId: CHAIN_ID, hash })
      setApproveState('done')
      void usdc.refetch()
    } catch (e) {
      setApproveState('error')
      setError(explainError(e, lang))
    }
  }

  const doSign = async () => {
    setError(undefined)
    setSignState('wallet')
    try {
      const so = await sign(
        {
          transfers: built.transfers,
          maxFee: usdc.fee,
          start: startTs,
          interval,
          runs: nRuns,
          expiry,
          nonce: BigInt(Date.now()),
          memo: memoToBytes32(label),
        },
        label,
      )
      setSignState('done')
      setCreated(so)
    } catch (e) {
      setSignState('error')
      setError(explainError(e, lang))
    }
  }

  const revoke = async () => {
    if (!confirm(T('Şimdiye kadar imzaladığın bütün planlı emirler geçersiz olacak. Devam edilsin mi?', 'Every scheduled order you signed so far will stop working. Continue?'))) return
    try {
      await revokeAll()
      toast.success(T('Tüm emirler geri alındı', 'All orders revoked'))
    } catch (e) {
      toast.error(explainError(e, lang))
    }
  }

  const aside = (
    <div className="panel p-5">
      <h2 className="t-2">{T('Taahhüt', 'Commitment')}</h2>
      <dl className="mt-4 space-y-2 m-0">
        <div className="flex justify-between"><dt className="muted">{T('Her ödeme', 'Per run')}</dt><dd className="num m-0">{built.error ? '—' : fmt(perRun, lang)}</dd></div>
        <div className="flex justify-between"><dt className="muted">{T('Ödeme sayısı', 'Runs')}</dt><dd className="num m-0">{nRuns}</dd></div>
        <hr className="rule-dash" />
        <div className="flex justify-between items-baseline"><dt className="font-semibold">{T('Toplam', 'Total')}</dt><dd className="num m-0 t-2">{built.error ? '—' : `${fmt(commitment, lang)} USDC`}</dd></div>
      </dl>
      <p className="small faint mt-3">{T('Para vade gününe kadar cüzdanında kalır. Ödeme anında bakiye ve izin yeterli olmalı.', 'Funds stay in your wallet until each due date. Balance and allowance must cover each run.')}</p>
      <ul className="mt-4 space-y-3 p-0 m-0 list-none">
        <Step n={1} label={T('Harcama izni', 'Spending allowance')} state={needsApproval || approveState !== 'idle' ? approveState : 'done'} hint={!needsApproval && approveState === 'idle' ? T('Mevcut izin yeterli', 'Existing allowance is enough') : undefined} />
        <Step n={2} label={T('Emri imzala (gas yok)', 'Sign the order (no gas)')} state={signState} />
      </ul>
      {error && <p className="small mt-4 mb-0 p-3 rounded-xl" style={{ background: 'var(--danger-wash)', color: 'var(--danger)' }}>{error}</p>}
    </div>
  )

  return (
    <Page
      title={T('Ödeme planla', 'Schedule a payment')}
      intro={T('Kira, maaş, abonelik ya da taksit: bir kez imzala. Vade gelince alıcı ödemeyi kendisi tahsil eder; kontrat imzanı zincirde doğrular.', 'Rent, payroll, subscriptions or instalments: sign once. When due, the recipient collects it and the contract verifies your signature onchain.')}
      aside={aside}
    >
      {created ? (
        <div className="panel p-6 space-y-4">
          <span className="pill pill-green">✓ {T('Emir imzalandı', 'Order signed')}</span>
          <p className="muted m-0">{T('Bu linki alıcılarla paylaş. Vade geldiğinde linki açan herkes ödemeyi tetikleyebilir; para yalnızca imzaladığın adreslere gider.', 'Share this link with the recipients. When due, anyone with it can trigger the payment; money only goes to the addresses you signed.')}</p>
          <div className="inset p-3 small num break-all">{orderLink(created)}</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => { void navigator.clipboard?.writeText(orderLink(created)); toast.success(T('Link kopyalandı', 'Link copied')) }}><Copy size={16} /> {T('Linki kopyala', 'Copy link')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setCreated(null); setSignState('idle'); setApproveState('idle'); setRows([{ address: '', value: '' }]); setLabel('') }}>{T('Yeni emir', 'New order')}</button>
          </div>
        </div>
      ) : (
        <div className="panel p-5 sm:p-6 space-y-6">
          <div className="seg" role="group" aria-label={T('Tür', 'Type')}>
            <button type="button" aria-pressed={kind === 'once'} onClick={() => setKind('once')}>{T('Tek seferlik', 'One-off')}</button>
            <button type="button" aria-pressed={kind === 'repeat'} onClick={() => setKind('repeat')}>{T('Tekrarlayan (maaş, abonelik)', 'Recurring (payroll, subscription)')}</button>
          </div>

          <div>
            <label className="field-label" htmlFor="label">{T('Başlık — zincire not olarak yazılır', 'Title — stored onchain as memo')}</label>
            <input id="label" className="field" maxLength={32} placeholder={T('Ekim maaşları', 'October payroll')} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div>
            <span className="field-label">{T('Alıcılar ve her ödemedeki tutar', 'Recipients and amount per run')}</span>
            <ul className="space-y-2 p-0 m-0 list-none">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_120px_40px] gap-2">
                  <input aria-label={T(`${i + 1}. alıcı adresi`, `Recipient ${i + 1} address`)} className="field num" placeholder="0x…" value={r.address} spellCheck={false} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, address: e.target.value } : x)))} />
                  <input aria-label={T('Tutar', 'Amount')} className="field num text-right" inputMode="decimal" placeholder="USDC" value={r.value} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" className="btn btn-ghost" style={{ padding: 0 }} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={T('Kaldır', 'Remove')}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost btn-sm mt-3" disabled={rows.length >= MAX_RECIPIENTS} onClick={() => setRows((rs) => [...rs, { address: '', value: '' }])}><Plus size={15} /> {T('Alıcı ekle', 'Add recipient')}</button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="start">{kind === 'once' ? T('Ödeme tarihi', 'Payment date') : T('İlk ödeme', 'First payment')}</label>
              <input id="start" type="datetime-local" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="grace">{T('Tahsil süresi (gün)', 'Collection window (days)')}</label>
              <input id="grace" className="field num" inputMode="numeric" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
            </div>
            {kind === 'repeat' && (
              <>
                <div>
                  <label className="field-label" htmlFor="every">{T('Kaç günde bir', 'Every (days)')}</label>
                  <input id="every" className="field num" inputMode="numeric" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="runs">{T('Kaç kez', 'How many times')}</label>
                  <input id="runs" className="field num" inputMode="numeric" value={runs} onChange={(e) => setRuns(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {rows.every((r) => r.address && r.value) && built.error && <p className="small m-0" style={{ color: 'var(--danger)' }}>{built.error}</p>}

          {!isConnected ? (
            <ConnectKitButton.Custom>{({ show }) => <button type="button" className="btn btn-primary btn-lg" onClick={show}>{T('Cüzdan bağla', 'Connect wallet')}</button>}</ConnectKitButton.Custom>
          ) : needsApproval && approveState !== 'done' ? (
            <button type="button" className="btn btn-arc btn-lg" disabled={!ready || approveState === 'wallet' || approveState === 'pending' || !usdc.contractLive} onClick={doApprove}>
              {approveState === 'wallet' || approveState === 'pending' ? T('Onaylanıyor…', 'Approving…') : T(`${fmt(commitment, lang)} USDC için izin ver`, `Allow ${fmt(commitment, lang)} USDC`)}
            </button>
          ) : (
            <button type="button" className="btn btn-arc btn-lg" disabled={!ready || signState === 'wallet' || !usdc.contractLive} onClick={doSign}>
              {signState === 'wallet' ? T('İmza bekleniyor…', 'Waiting for signature…') : T('Emri imzala', 'Sign the order')}
            </button>
          )}
        </div>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="t-2">{T('Emirlerim', 'My orders')}</h2>
          {isConnected && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={revoke}><ShieldOff size={15} /> {T('Tümünü geri al', 'Revoke all')}</button>
          )}
        </div>
        {mine.length === 0 ? (
          <p className="muted">{T('Henüz emir yok. Yukarıdan ilk planlı ödemeni oluştur.', 'No orders yet. Create your first scheduled payment above.')}</p>
        ) : (
          <div className="grid gap-4">{mine.map((so) => <OrderCard key={so.hash} so={so} owner />)}</div>
        )}
      </section>
    </Page>
  )
}
