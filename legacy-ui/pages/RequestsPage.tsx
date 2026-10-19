/**
 * RequestsPage — shareable payment requests.
 *
 * A payment request is a URL that encodes: amount, recipients, description.
 * Opening a request link NEVER triggers a payment automatically.
 * The payer must review and approve the transaction.
 *
 * All imported URL data is treated as untrusted and validated before use.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { Copy, Check, ExternalLink, Trash2, Plus, X } from 'lucide-react'
import { useLang } from '@/context/LangContext'
import { requestStore, type PaymentRequest } from '@/store/requestStore'
import { validateShares } from '@/utils/splitpay'
import type { RecipientShare } from '@/utils/splitpay'
import { isAddress } from 'viem'

const DEFAULT_SHARES: RecipientShare[] = [
  { address: '', basisPoints: 5000 },
  { address: '', basisPoints: 5000 },
]

function CreateRequestForm({
  createdBy,
  onCreated,
  onCancel,
  lang,
}: {
  createdBy: string
  onCreated: () => void
  onCancel: () => void
  lang: string
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [shares, setShares] = useState<RecipientShare[]>(DEFAULT_SHARES)
  const [hasExpiry, setHasExpiry] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')

  const sharesError = validateShares(shares)
  const amountNum = parseFloat(amount)
  const isValid = !isNaN(amountNum) && amountNum > 0 && !sharesError
    && shares.every((s) => isAddress(s.address) && s.basisPoints > 0)

  const handleCreate = () => {
    if (!isValid) return
    const expiresAt = hasExpiry && expiryDate
      ? Math.floor(new Date(expiryDate).getTime() / 1000)
      : undefined
    requestStore.add({
      amount,
      shares,
      description: description.slice(0, 200),
      createdBy,
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
      paid: false,
    })
    onCreated()
  }

  const updateShare = (i: number, field: 'address' | 'basisPoints', val: string) => {
    setShares((prev) => prev.map((s, idx) =>
      idx === i ? { ...s, [field]: field === 'basisPoints' ? parseInt(val) || 0 : val } : s
    ))
  }

  const addShare = () => {
    if (shares.length < 5) setShares((p) => [...p, { address: '', basisPoints: 0 }])
  }

  const removeShare = (i: number) => {
    if (shares.length > 2) setShares((p) => p.filter((_, idx) => idx !== i))
  }

  const fillRemainder = (i: number) => {
    const others = shares.reduce((acc, s, idx) => idx === i ? acc : acc + s.basisPoints, 0)
    setShares((p) => p.map((s, idx) => idx === i ? { ...s, basisPoints: 10000 - others } : s))
  }

  return (
    <div className="arc-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {lang === 'tr' ? 'Yeni Ödeme İsteği' : 'New Payment Request'}
        </h3>
        <button type="button" onClick={onCancel}><X className="size-4" style={{ color: 'var(--muted)' }} /></button>
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? 'Tutar (USDC)' : 'Amount (USDC)'}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="100.00"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
          }}
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? 'Açıklama (isteğe bağlı)' : 'Description (optional)'}
        </label>
        <input
          type="text"
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={lang === 'tr' ? 'Fatura #123 ödemesi' : 'Invoice #123 payment'}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            color: 'var(--ink)',
          }}
        />
      </div>

      {/* Recipients */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? 'Alıcılar' : 'Recipients'}
        </p>
        <div className="space-y-2">
          {shares.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="0x…"
                value={s.address}
                onChange={(e) => updateShare(i, 'address', e.target.value)}
                className="flex-1 min-w-0 rounded-xl px-3 py-2 text-xs mono outline-none"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isAddress(s.address) || !s.address ? 'var(--border)' : 'var(--danger)'}`,
                  color: 'var(--ink)',
                }}
              />
              <div className="flex gap-1 items-center">
                <input
                  type="number"
                  min="1"
                  max="9999"
                  value={s.basisPoints > 0 ? (s.basisPoints / 100).toString() : ''}
                  onChange={(e) => updateShare(i, 'basisPoints', String(Math.round(parseFloat(e.target.value || '0') * 100)))}
                  placeholder="%"
                  className="w-14 rounded-xl px-2 py-2 text-xs text-center outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  onClick={() => fillRemainder(i)}
                  className="text-xs px-2 py-1.5 rounded-lg"
                  style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)' }}
                  title={lang === 'tr' ? 'Kalanı doldur' : 'Fill remainder'}
                >
                  ↺
                </button>
                {shares.length > 2 && (
                  <button type="button" onClick={() => removeShare(i)}>
                    <X className="size-3.5" style={{ color: 'var(--danger)' }} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {shares.length < 5 && (
          <button
            type="button"
            onClick={addShare}
            className="mt-2 text-xs flex items-center gap-1"
            style={{ color: 'var(--arc-blue)' }}
          >
            <Plus className="size-3.5" />
            {lang === 'tr' ? 'Alıcı Ekle' : 'Add Recipient'}
          </button>
        )}
        {sharesError && (
          <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{sharesError}</p>
        )}
      </div>

      {/* Expiry */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="req-expiry"
          checked={hasExpiry}
          onChange={(e) => setHasExpiry(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="req-expiry" className="text-xs" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? 'Son kullanma tarihi ekle' : 'Set expiry date'}
        </label>
        {hasExpiry && (
          <input
            type="datetime-local"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="rounded-xl px-2 py-1.5 text-xs outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={!isValid}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: 'var(--arc-gradient)', boxShadow: '0 4px 16px rgba(0,82,255,0.25)' }}
      >
        {lang === 'tr' ? 'İstek Oluştur ve Linki Al' : 'Create Request & Get Link'}
      </button>
    </div>
  )
}

function RequestCard({ req, lang, onDelete, nowTs }: { req: PaymentRequest; lang: string; onDelete: () => void; nowTs: number }) {
  const [copied, setCopied] = useState(false)
  const url = requestStore.toShareUrl(req)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isExpired = req.expiresAt != null && nowTs > req.expiresAt

  return (
    <div className="arc-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              ${req.amount} USDC
            </span>
            {req.paid && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,196,140,0.12)', color: '#00C48C' }}>
                {lang === 'tr' ? 'Ödendi' : 'Paid'}
              </span>
            )}
            {isExpired && !req.paid && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,122,153,0.12)', color: '#6B7A99' }}>
                {lang === 'tr' ? 'Süresi doldu' : 'Expired'}
              </span>
            )}
          </div>
          {req.description && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{req.description}</p>
          )}
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            {req.shares.length} {lang === 'tr' ? 'alıcı' : 'recipient(s)'} · {new Date(req.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <button type="button" onClick={onDelete} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}>
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => { void copy() }}
          className="flex-1 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-1.5"
          style={{ background: copied ? 'rgba(0,196,140,0.12)' : 'rgba(0,82,255,0.08)', color: copied ? '#00C48C' : 'var(--arc-blue)', border: '1px solid transparent' }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied
            ? (lang === 'tr' ? 'Kopyalandı!' : 'Copied!')
            : (lang === 'tr' ? 'Linki Kopyala' : 'Copy Link')}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1"
          style={{ background: 'rgba(0,82,255,0.06)', color: 'var(--arc-blue)' }}
        >
          <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  )
}

interface RequestsPageProps {
  /** Called when user wants to pay an inbound request — prefills the split page */
  onNavigateToSplit?: (amount: string, shares: RecipientShare[]) => void
}

export function RequestsPage({ onNavigateToSplit }: RequestsPageProps) {
  const { lang } = useLang()
  const { address, isConnected } = useAccount()
  const [requests, setRequests] = useState(() => requestStore.getAll())
  const [showForm, setShowForm] = useState(false)
  // Parse inbound request from URL at mount time — no effect needed
  const [inboundReq, setInboundReq] = useState<ReturnType<typeof requestStore.fromShareUrl>>(
    () => requestStore.fromShareUrl(window.location.hash)
  )
  // nowTs for expiry checks — updated by effect (syncing to external clock)
  const [nowTs, setNowTs] = useState(0)
  useEffect(() => {
    const tick = () => setNowTs(Math.floor(Date.now() / 1000))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refresh = useCallback(() => setRequests(requestStore.getAll()), [])

  const handleDelete = useCallback((id: string) => {
    requestStore.remove(id)
    refresh()
  }, [refresh])

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            {lang === 'tr' ? 'Ödeme İstekleri' : 'Payment Requests'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            {lang === 'tr'
              ? 'Paylaşılabilir link oluştur. İstek asla otomatik ödeme yapmaz.'
              : 'Create a shareable link. A request never triggers a payment automatically.'}
          </p>
        </div>
        {isConnected && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'var(--arc-gradient)', boxShadow: '0 2px 10px rgba(0,82,255,0.25)' }}
          >
            <Plus className="size-3.5" />
            {lang === 'tr' ? 'Yeni İstek' : 'New Request'}
          </button>
        )}
      </div>

      {/* Inbound request banner */}
      {inboundReq && (
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(0,82,255,0.07)', border: '1px solid rgba(0,82,255,0.20)' }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--arc-blue)' }}>
            {lang === 'tr' ? 'Gelen Ödeme İsteği' : 'Incoming Payment Request'}
          </p>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            ${inboundReq.amount} USDC · {inboundReq.shares.length} {lang === 'tr' ? 'alıcı' : 'recipient(s)'}
          </p>
          {inboundReq.description && (
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{inboundReq.description}</p>
          )}
          <div className="flex gap-2 mt-2">
            {onNavigateToSplit && inboundReq && (
              <button
                type="button"
                onClick={() => {
                  onNavigateToSplit(inboundReq.amount, inboundReq.shares)
                  setInboundReq(null)
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white"
                style={{ background: 'var(--arc-gradient)' }}
              >
                {lang === 'tr' ? 'Ödemeyi Hazırla' : 'Set Up Payment'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setInboundReq(null)}
              className="text-xs px-3 py-1.5 rounded-xl"
              style={{ color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {lang === 'tr' ? 'Kapat' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="arc-card rounded-2xl p-6 text-center">
          <p style={{ color: 'var(--muted)' }}>
            {lang === 'tr' ? 'Ödeme isteği oluşturmak için cüzdanını bağla.' : 'Connect your wallet to create payment requests.'}
          </p>
        </div>
      )}

      {showForm && address && (
        <CreateRequestForm
          createdBy={address}
          lang={lang}
          onCreated={() => { setShowForm(false); refresh() }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {requests.length === 0 && !showForm ? (
        <div className="arc-card rounded-2xl p-8 text-center">
          <p style={{ color: 'var(--muted)' }}>
            {lang === 'tr' ? 'Henüz istek yok.' : 'No requests yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} req={r} lang={lang} onDelete={() => handleDelete(r.id)} nowTs={nowTs} />
          ))}
        </div>
      )}
    </div>
  )
}
