import { useMemo, useState } from 'react'
import { Plus, Trash2, Link2, ClipboardList, ExternalLink } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Page } from '@/components/Shell'
import { Step } from '@/components/Steps'
import { DeployCard } from '@/components/DeployCard'
import { useT } from '@/lib/i18n'
import { buildTransfers, fmt, memoToBytes32, toRaw, type Mode, type Row } from '@/lib/money'
import { usePay } from '@/hooks/usePay'
import { MAX_RECIPIENTS } from '@/contracts/parcpay'
import { CHAIN_ID, NETWORK_LABEL, txUrl } from '@/chain'

const EMPTY: Row = { address: '', value: '' }

export function SendPage({ params }: { params: URLSearchParams }) {
  const T = useT()
  const lang = T.lang
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongNet = isConnected && chainId !== CHAIN_ID
  const { pay, reset, state, usdc } = usePay(lang)

  // Payment request links (#/send?r=<addr>:<amount>,…&memo=…) only PREFILL the form.
  // Nothing is ever sent until the user reviews and confirms.
  const [initial] = useState(() => {
    const r = params.get('r')
    const parsed = r
      ? r.split(',').map((p) => {
          const [address, value = ''] = p.split(':')
          return { address, value }
        }).slice(0, MAX_RECIPIENTS)
      : null
    return { rows: parsed && parsed.length ? parsed : [{ ...EMPTY }, { ...EMPTY }], memo: (params.get('memo') ?? '').slice(0, 32) }
  })
  const [mode, setMode] = useState<Mode>('amount')
  const [total, setTotal] = useState('')
  const [rows, setRows] = useState<Row[]>(initial.rows)
  const [memo, setMemo] = useState(initial.memo)
  const [budgetOn, setBudgetOn] = useState(false)
  const [budget, setBudget] = useState('100')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulk, setBulk] = useState('')
  const [confirming, setConfirming] = useState(false)

  const built = useMemo(() => buildTransfers(rows, mode, total, lang), [rows, mode, total, lang])
  const filled = rows.every((r) => r.address && r.value) && (mode === 'amount' || total)
  const grand = built.error ? 0n : built.total + usdc.fee
  const budgetRaw = budgetOn ? toRaw(budget) ?? 0n : 0n
  const known = isConnected && !built.error
  const needsApproval = !known || usdc.allowance < grand
  const signatures = 1
  const busy = ['wallet', 'pending'].includes(state.approve) || ['wallet', 'pending'].includes(state.pay)
  const done = state.pay === 'done'

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))

  const applyBulk = () => {
    const parsed = bulk
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [address, value = ''] = l.split(/[,;\t ]+/)
        return { address, value }
      })
      .slice(0, MAX_RECIPIENTS)
    if (parsed.length) {
      setRows(parsed)
      setBulkOpen(false)
      setBulk('')
    }
  }

  const requestLink = () => {
    if (built.error || mode !== 'amount') return
    const r = built.transfers.map((t) => `${t.to}:${rows.find((x) => x.address.toLowerCase() === t.to.toLowerCase())?.value ?? ''}`).join(',')
    const url = `${window.location.origin}${window.location.pathname}#/send?r=${encodeURIComponent(r)}${memo ? `&memo=${encodeURIComponent(memo)}` : ''}`
    void navigator.clipboard?.writeText(url)
    toast.success(T('Ödeme talebi linki kopyalandı', 'Payment request link copied'))
  }

  const submit = () => {
    setConfirming(false)
    void pay(built.transfers, memoToBytes32(memo), budgetOn ? budgetRaw : undefined)
  }

  const newPayment = () => {
    reset()
    setRows([{ ...EMPTY }, { ...EMPTY }])
    setTotal('')
    setMemo('')
  }

  const aside = (
    <>
      <div className="panel p-5">
        <h2 className="t-2">{T('Özet', 'Summary')}</h2>
        <dl className="mt-4 space-y-2 m-0">
          <div className="flex justify-between"><dt className="muted">{T('Alıcılara', 'To recipients')}</dt><dd className="num m-0 font-semibold">{built.error ? '—' : fmt(built.total, lang)}</dd></div>
          <div className="flex justify-between"><dt className="muted">{T('ParcPay ücreti', 'ParcPay fee')}</dt><dd className="num m-0">{fmt(usdc.fee, lang)}</dd></div>
          <hr className="rule-dash" />
          <div className="flex justify-between items-baseline"><dt className="font-semibold">{T('Toplam', 'Total')}</dt><dd className="num m-0 t-2">{built.error ? '—' : `${fmt(grand, lang)} USDC`}</dd></div>
          {usdc.balance !== undefined && (
            <div className="flex justify-between small"><dt className="faint">{T('Bakiyen', 'Your balance')}</dt><dd className="num m-0 faint">{fmt(usdc.balance, lang, 2)} USDC</dd></div>
          )}
        </dl>
        <p className="small faint mt-3 mb-0">{T('Ağ ücreti (gas) de USDC ile ödenir ve cüzdanında gösterilir.', 'Network gas is also paid in USDC and shown in your wallet.')}</p>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="t-2">{T('İmzalar', 'Signatures')}</h2>
          <span className="pill pill-blue">{`${signatures} ${T('imza', 'signature')}`}</span>
        </div>
        <ul className="mt-4 space-y-3 p-0 m-0 list-none">
          {state.batched || needsApproval ? (
            <Step n={1} label={T('Onay + ödeme tek işlemde', 'Approve + pay in one transaction')} state={state.pay} hint={T('Arc Multicall3From ile', 'via Arc Multicall3From')} />
          ) : (
            <>
              <Step
                n={1}
                label={T('USDC harcama onayı', 'USDC spending approval')}
                state={needsApproval || state.approve !== 'idle' ? state.approve : 'done'}
                hint={!known ? T('Gerekirse; mevcut izin yetiyorsa atlanır', 'If needed; skipped when allowance covers it') : !needsApproval && state.approve === 'idle' ? T('Mevcut izin yeterli, atlanacak', 'Existing allowance covers it, skipped') : budgetOn ? T(`${budget} USDC bütçe`, `${budget} USDC budget`) : T('Yalnızca bu ödeme kadar', 'Exactly this payment')}
              />
              <Step n={2} label={T('Ödemeyi gönder', 'Send the payment')} state={state.pay} />
            </>
          )}
        </ul>
        {state.error && <p className="small mt-4 mb-0 p-3 rounded-xl" style={{ background: 'var(--danger-wash)', color: 'var(--danger)' }}>{state.error}</p>}
      </div>
    </>
  )

  if (done && state.hash) {
    return (
      <Page title={T('Ödeme gönderildi', 'Payment sent')}>
        <div className="panel p-6 sm:p-8 max-w-xl">
          <span className="pill pill-green">✓ {T('Kesinleşti', 'Settled')}</span>
          <p className="h-display mt-4" style={{ fontSize: '2.4rem' }}><span className="num">{fmt(built.total, lang)}</span> USDC</p>
          <p className="muted">{T(`${built.transfers.length} alıcıya tek işlemde gönderildi.`, `Sent to ${built.transfers.length} recipients in one transaction.`)}</p>
          <div className="flex flex-wrap gap-3 mt-6">
            <a className="btn btn-ghost" href={txUrl(state.hash)} target="_blank" rel="noreferrer"><ExternalLink size={16} /> {T('Explorer’da gör', 'View on explorer')}</a>
            <button type="button" className="btn btn-primary" onClick={newPayment}>{T('Yeni ödeme', 'New payment')}</button>
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page title={T('Bölerek gönder', 'Split & send')} intro={T('Her alıcıya tam tutarı ya da yüzdeyi yaz. Hepsi tek işlemde, aynı anda ödenir.', 'Enter an exact amount or share for each recipient. Everyone is paid in one transaction.')} aside={aside}>
      {!usdc.contractLive && !usdc.isLoading && <div className="mb-6"><DeployCard compact onDeployed={() => void usdc.refetch()} /></div>}
      <div className="panel p-5 sm:p-6 space-y-6">
        {usdc.paused && <p className="pill pill-warn">{T('Ödemeler geçici olarak durduruldu.', 'Payments are temporarily paused.')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg" role="group" aria-label={T('Dağıtım şekli', 'Allocation')}>
            <button type="button" aria-pressed={mode === 'amount'} onClick={() => setMode('amount')}>{T('Tutar', 'Amount')}</button>
            <button type="button" aria-pressed={mode === 'percent'} onClick={() => setMode('percent')}>{T('Yüzde', 'Percent')}</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulkOpen((v) => !v)}>
            <ClipboardList size={15} /> {T('Listeden yapıştır', 'Paste a list')}
          </button>
        </div>

        {bulkOpen && (
          <div className="inset p-4 space-y-3">
            <label className="field-label" htmlFor="bulk">{T('Her satıra: adres, tutar', 'One per line: address, amount')}</label>
            <textarea id="bulk" className="field" style={{ minHeight: 120, padding: '0.7rem 0.85rem' }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'0x7a1c…41e2, 250\n0x3be0…9d07, 120.5'} />
            <button type="button" className="btn btn-primary btn-sm" onClick={applyBulk}>{T('Listeyi ekle', 'Use this list')}</button>
          </div>
        )}

        {mode === 'percent' && (
          <div>
            <label className="field-label" htmlFor="total">{T('Toplam tutar (USDC)', 'Total amount (USDC)')}</label>
            <input id="total" className="field num" inputMode="decimal" placeholder="1000" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
        )}

        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="field-label m-0">{T('Alıcılar', 'Recipients')}</span>
            <span className="small faint">{rows.length} / {MAX_RECIPIENTS}</span>
          </div>
          <ul className="space-y-2 p-0 m-0 list-none">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_110px_40px] sm:grid-cols-[minmax(0,1fr)_140px_40px] gap-2">
                <input aria-label={T(`${i + 1}. alıcı adresi`, `Recipient ${i + 1} address`)} className="field num" placeholder="0x…" value={r.address} onChange={(e) => setRow(i, { address: e.target.value })} spellCheck={false} autoComplete="off" />
                <input aria-label={mode === 'amount' ? T('Tutar', 'Amount') : T('Yüzde', 'Percent')} className="field num text-right" inputMode="decimal" placeholder={mode === 'amount' ? 'USDC' : '%'} value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
                <button type="button" className="btn btn-ghost" style={{ padding: 0 }} disabled={rows.length <= 1} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={T('Alıcıyı kaldır', 'Remove recipient')}>
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-sm mt-3" disabled={rows.length >= MAX_RECIPIENTS} onClick={() => setRows((rs) => [...rs, { ...EMPTY }])}>
            <Plus size={15} /> {T('Alıcı ekle', 'Add recipient')}
          </button>
        </div>

        <div>
          <label className="field-label" htmlFor="memo">{T('Not (isteğe bağlı) — zincire yazılır', 'Memo (optional) — stored onchain')}</label>
          <input id="memo" className="field" maxLength={32} placeholder={T('Fatura no, dönem, sipariş…', 'Invoice no, period, order…')} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>

        <div className="inset p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={budgetOn} onChange={(e) => setBudgetOn(e.target.checked)} style={{ width: 18, height: 18, marginTop: 3 }} />
            <span>
              <span className="font-semibold">{T('Sonraki ödemeler için izin ver', 'Allow future payments')}</span>
              <span className="block small muted">{T('Bir bütçe onaylarsın; bütçe bitene kadar her ödeme tek imza olur. İstediğin an cüzdanından sıfırlayabilirsin.', 'Approve a budget once; every payment is one signature until it runs out. Reset it in your wallet anytime.')}</span>
            </span>
          </label>
          {budgetOn && (
            <div className="mt-3 flex items-center gap-2 max-w-xs">
              <input aria-label={T('Bütçe', 'Budget')} className="field num" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span className="muted">USDC</span>
            </div>
          )}
        </div>

        {confirming && !built.error && (
          <div className="deploy-card p-5 space-y-3" role="dialog" aria-label={T('Ödemeyi onayla', 'Confirm payment')}>
            <h3 className="t-2 m-0">{T('Göndermeden önce kontrol et', 'Check before sending')}</h3>
            <dl className="m-0 small space-y-1">
              <div className="flex justify-between gap-3"><dt className="faint">{T('Ağ', 'Network')}</dt><dd className="m-0">{NETWORK_LABEL} (chain {CHAIN_ID})</dd></div>
              <div className="flex justify-between gap-3"><dt className="faint">Token</dt><dd className="m-0">USDC · 0x3600…0000</dd></div>
            </dl>
            <ul className="m-0 p-0 list-none small space-y-1 num">
              {built.transfers.map((t) => (
                <li key={t.to} className="flex justify-between gap-3"><span className="break-all">{t.to}</span><span className="font-semibold">{fmt(t.amount, lang)}</span></li>
              ))}
            </ul>
            <hr className="rule-dash" />
            <div className="flex justify-between small"><span className="faint">{T('ParcPay ücreti', 'ParcPay fee')}</span><span className="num">{fmt(usdc.fee, lang)}</span></div>
            <div className="flex justify-between"><span className="font-semibold">{T('Toplam çekilecek', 'Total charged')}</span><span className="num font-semibold">{fmt(grand, lang)} USDC</span></div>
            <p className="small faint m-0">{T('İşlem geri alınamaz. Adresleri tek tek kontrol et.', 'This cannot be undone. Check every address.')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-arc" onClick={submit}>{T('Onayla ve gönder', 'Confirm and send')}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>{T('Vazgeç', 'Cancel')}</button>
            </div>
          </div>
        )}
        {filled && built.error && <p className="small m-0" style={{ color: 'var(--danger)' }}>{built.error}</p>}
        {isConnected && !wrongNet && !busy && (() => {
          const why = !usdc.contractLive
            ? T('Gönder kapalı: önce yukarıdan kontratı kur.', 'Send is off: deploy the contract above first.')
            : !filled
              ? T('Gönder kapalı: her alıcı için adres ve tutar gir.', 'Send is off: enter an address and amount for each recipient.')
              : usdc.balance !== undefined && !built.error && usdc.balance < grand
                ? T('Bakiye yetersiz: faucet.circle.com’dan test USDC al.', 'Balance too low: get test USDC at faucet.circle.com.')
                : null
          return why ? <p className="small m-0 faint">{why}</p> : null
        })()}

        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <ConnectKitButton.Custom>
              {({ show }) => <button type="button" className="btn btn-primary btn-lg" onClick={show}>{T('Cüzdan bağla', 'Connect wallet')}</button>}
            </ConnectKitButton.Custom>
          ) : wrongNet ? (
            <button type="button" className="btn btn-arc btn-lg" onClick={() => switchChain({ chainId: CHAIN_ID })}>{T(`${NETWORK_LABEL} ağına geç`, `Switch to ${NETWORK_LABEL}`)}</button>
          ) : (
            <button type="button" className="btn btn-arc btn-lg" disabled={!!built.error || busy || usdc.paused || !usdc.contractLive} onClick={() => setConfirming(true)}>
              {busy ? T('Cüzdanı onayla…', 'Confirm in wallet…') : built.error ? T('Ödemeyi gönder', 'Send payment') : T(`${fmt(grand, lang)} USDC gönder`, `Send ${fmt(grand, lang)} USDC`)}
            </button>
          )}
          {mode === 'amount' && (
            <button type="button" className="btn btn-ghost btn-lg" disabled={!!built.error} onClick={requestLink}>
              <Link2 size={16} /> {T('Ödeme talebi linki', 'Payment request link')}
            </button>
          )}
        </div>
      </div>
    </Page>
  )
}
