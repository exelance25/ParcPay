/**
 * ScheduledPage — Zamanlanmış ödeme emirleri.
 *
 * Execution mimarisi (açıkça belgelenmiş):
 *   - Otomatik execution YOKTUR.
 *   - "Çalıştır" düğmesi executeAfter zamanı gelince aktif olur.
 *   - Kullanıcı tıkladığında: bakiye/izin kontrolleri → approve (gerekirse) → splitPay.
 *   - Tüm güvenlik kontrolleri useScheduledPay hook'unda, approve→split sıralaması hook içinde.
 */
import { useState, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import {
  Clock, Plus, Play, X, Copy, Check,
  ShieldAlert, ChevronDown, ChevronUp,
  RefreshCw, Trash2, ExternalLink, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { isAddress } from 'viem'
import { useLang } from '@/context/LangContext'
import { useScheduledPay, type ScheduledOrder, type OrderStatus } from '@/hooks/useScheduledPay'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { MAX_RECIPIENTS, MIN_RECIPIENTS, validateShares } from '@/utils/splitpay'
import type { RecipientShare } from '@/utils/splitpay'

const CHAIN_ID = arcTestnet.id

// ── Status display config ─────────────────────────────────────────────────────
const STATUS_CONFIG: Record<OrderStatus, {
  label: string; labelTr: string
  bg: string; color: string; border: string
}> = {
  draft:      { label: 'Draft',      labelTr: 'Taslak',      bg: 'rgba(107,122,153,0.10)', color: 'var(--muted)',   border: 'rgba(107,122,153,0.15)' },
  scheduled:  { label: 'Scheduled',  labelTr: 'Zamanlandı',  bg: 'rgba(0,82,255,0.10)',    color: 'var(--arc-blue)',border: 'rgba(0,82,255,0.20)'    },
  ready:      { label: 'Ready',      labelTr: 'Hazır',       bg: 'rgba(0,196,140,0.10)',   color: 'var(--success)', border: 'rgba(0,196,140,0.20)'   },
  executing:  { label: 'Executing',  labelTr: 'Çalışıyor',   bg: 'rgba(0,82,255,0.10)',    color: 'var(--arc-blue)',border: 'rgba(0,82,255,0.20)'    },
  completed:  { label: 'Completed',  labelTr: 'Tamamlandı',  bg: 'rgba(0,196,140,0.10)',   color: 'var(--success)', border: 'rgba(0,196,140,0.20)'   },
  failed:     { label: 'Failed',     labelTr: 'Başarısız',   bg: 'rgba(255,77,114,0.08)',  color: 'var(--danger)',  border: 'rgba(255,77,114,0.15)'  },
  cancelled:  { label: 'Cancelled',  labelTr: 'İptal',       bg: 'rgba(255,77,114,0.08)',  color: 'var(--danger)',  border: 'rgba(255,77,114,0.15)'  },
  expired:    { label: 'Expired',    labelTr: 'Süresi Doldu',bg: 'rgba(107,122,153,0.10)', color: 'var(--muted)',   border: 'rgba(107,122,153,0.15)' },
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function toLocalDatetimeValue(ts: number) {
  const d   = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function localDatetimeToTs(s: string): number { return Math.floor(new Date(s).getTime() / 1000) }
function fmtDatetime(ts: number, lang: string) {
  return new Date(ts * 1000).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
function timeRemaining(ts: number, nowTs: number, lang: string): string {
  const diff = ts - nowTs
  if (diff <= 0) return lang === 'tr' ? 'Şimdi' : 'Now'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 24) return lang === 'tr' ? `${Math.floor(h/24)} gün` : `${Math.floor(h/24)} days`
  if (h > 0) return lang === 'tr' ? `${h} sa ${m} dk` : `${h}h ${m}m`
  return lang === 'tr' ? `${m} dk` : `${m}m`
}

// ── New order form ────────────────────────────────────────────────────────────
const EMPTY_SHARES: RecipientShare[] = [
  { address: '', basisPoints: 5000 },
  { address: '', basisPoints: 5000 },
]

interface NewOrderFormProps {
  onSubmit: (p: {
    amountStr: string
    shares: RecipientShare[]
    executeAfterTs: number
    expiryTs: number
    description: string
  }) => void
  onCancel: () => void
  lang: string
  initNow: number
}

function NewOrderForm({ onSubmit, onCancel, lang, initNow }: NewOrderFormProps) {
  const [amount,       setAmount]       = useState('')
  const [description,  setDescription]  = useState('')
  const [shares,       setShares]       = useState<RecipientShare[]>(EMPTY_SHARES)
  const [executeAfter, setExecuteAfter] = useState(() => toLocalDatetimeValue(initNow + 3600))
  const [expiry,       setExpiry]       = useState(() => toLocalDatetimeValue(initNow + 7 * 86400))

  const sharesErr = validateShares(shares)
  const totalBp   = shares.reduce((s, r) => s + r.basisPoints, 0)
  const amountNum = parseFloat(amount)

  const executeAfterTs = localDatetimeToTs(executeAfter)
  const expiryTs       = localDatetimeToTs(expiry)
  const dateOk         = executeAfterTs > initNow && executeAfterTs < expiryTs

  const isValid =
    !isNaN(amountNum) && amountNum > 0 &&
    !sharesErr &&
    shares.every((s) => isAddress(s.address)) &&
    dateOk

  const updateShare = (i: number, f: 'address' | 'basisPoints', v: string | number) =>
    setShares((p) => p.map((s, idx) => idx === i ? { ...s, [f]: v } : s))

  const fillRemainder = (i: number) => {
    const other = shares.reduce((a, s, idx) => idx !== i ? a + s.basisPoints : a, 0)
    updateShare(i, 'basisPoints', Math.max(0, 10000 - other))
  }

  const tr = lang === 'tr'

  return (
    <div className="arc-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          {tr ? 'Yeni Zamanlanmış Ödeme' : 'New Scheduled Payment'}
        </h3>
        <button type="button" onClick={onCancel}><X className="size-4" style={{ color: 'var(--muted)' }} /></button>
      </div>

      {/* Amount */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
          {tr ? 'Tutar (USDC)' : 'Amount (USDC)'}
        </label>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: 'rgba(0,82,255,0.06)', border: '1px solid var(--border)' }}
        >
          <span className="font-semibold text-sm" style={{ color: 'var(--arc-blue)' }}>$</span>
          <input
            type="number" min="0" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100.00"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
          {tr ? 'Açıklama (isteğe bağlı)' : 'Description (optional)'}
        </label>
        <input
          type="text" maxLength={200} value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tr ? 'Aylık kira — Ekim' : 'Monthly rent — October'}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
            {tr ? 'En Erken Çalıştır' : 'Execute After'}
          </label>
          <input
            type="datetime-local" value={executeAfter}
            onChange={(e) => setExecuteAfter(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-xs outline-none"
            style={{ background: 'rgba(0,82,255,0.06)', border: `1px solid ${dateOk || !executeAfter ? 'var(--border)' : 'var(--danger)'}`, color: 'var(--ink)' }}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
            {tr ? 'Son Geçerlilik' : 'Expires At'}
          </label>
          <input
            type="datetime-local" value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-xs outline-none"
            style={{ background: 'rgba(0,82,255,0.06)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
      </div>
      {!dateOk && executeAfter && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {tr ? 'Çalıştırma zamanı şimdi + 1 dakikadan sonra ve son geçerlilikten önce olmalıdır.' : 'Execute time must be in the future and before expiry.'}
        </p>
      )}

      {/* Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {tr ? 'Alıcılar' : 'Recipients'} ({shares.length}/{MAX_RECIPIENTS})
          </label>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              background: totalBp === 10000 ? 'rgba(0,196,140,0.12)' : 'rgba(255,77,114,0.10)',
              color: totalBp === 10000 ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {(totalBp / 100).toFixed(2)}%
          </span>
        </div>
        <div className="space-y-2">
          {shares.map((s, i) => {
            const addrOk = !s.address || isAddress(s.address)
            return (
              <div key={i} className="flex gap-2">
                <div className="flex-shrink-0 size-7 rounded-lg flex items-center justify-center text-xs font-bold self-center"
                  style={{ background: 'rgba(0,82,255,0.10)', color: 'var(--arc-blue)' }}>
                  {i + 1}
                </div>
                <input
                  type="text" value={s.address} placeholder="0x…"
                  onChange={(e) => updateShare(i, 'address', e.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-xs mono outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${!addrOk ? 'var(--danger)' : s.address && addrOk ? 'rgba(0,196,140,0.35)' : 'var(--border)'}`,
                    color: 'var(--ink)',
                  }}
                />
                <input
                  type="number" min="0.01" max="100" step="0.01"
                  value={s.basisPoints > 0 ? (s.basisPoints / 100).toFixed(2).replace(/\.00$/, '') : ''}
                  onChange={(e) => updateShare(i, 'basisPoints', Math.min(10000, Math.round(parseFloat(e.target.value || '0') * 100)))}
                  placeholder="%"
                  className="w-16 rounded-xl px-2 py-2 text-xs text-center outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
                <button type="button" onClick={() => fillRemainder(i)}
                  title={tr ? 'Kalanı doldur' : 'Fill remainder'}
                  className="size-8 rounded-xl flex items-center justify-center text-xs font-bold transition-colors self-center"
                  style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)', border: '1px solid rgba(0,82,255,0.15)' }}>
                  ↺
                </button>
                {shares.length > MIN_RECIPIENTS && (
                  <button type="button" onClick={() => setShares((p) => p.filter((_, idx) => idx !== i))}
                    className="size-8 rounded-xl flex items-center justify-center self-center"
                    style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}>
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {shares.length < MAX_RECIPIENTS && (
          <button type="button"
            onClick={() => setShares((p) => [...p, { address: '', basisPoints: 0 }])}
            className="mt-2 w-full rounded-xl py-2 text-xs font-medium"
            style={{ background: 'rgba(0,82,255,0.06)', color: 'var(--arc-blue)', border: '1px dashed rgba(0,82,255,0.22)' }}>
            + {tr ? 'Alıcı Ekle' : 'Add Recipient'}
          </button>
        )}
        {sharesErr && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{sharesErr}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-xl py-3 text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          {tr ? 'Vazgeç' : 'Cancel'}
        </button>
        <button
          type="button"
          disabled={!isValid}
          onClick={() => onSubmit({ amountStr: amount, shares, executeAfterTs, expiryTs, description })}
          className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--arc-gradient)' }}>
          {tr ? 'İmzala & Kaydet' : 'Sign & Save'}
        </button>
      </div>
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({
  order, lang, nowTs,
  onSign, onExecute, onCancel, onRetry, onDelete,
  signingId, executingId,
}: {
  order: ScheduledOrder
  lang: string
  nowTs: number
  onSign: (id: string) => void
  onExecute: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onDelete: (id: string) => void
  signingId: string | null
  executingId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft
  const tr  = lang === 'tr'

  const isExecuting = executingId === order.id
  const isSigning   = signingId === order.id

  const explorerUrl = order.txHash
    ? buildTxExplorerUrl(CHAIN_ID, order.txHash)
    : undefined

  const canSign    = order.status === 'draft'
  const canExecute = order.status === 'ready'
  const canCancel  = order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'executing'
  const canRetry   = order.status === 'failed'
  const canDelete  = order.status === 'completed' || order.status === 'cancelled' || order.status === 'expired'

  const copySignature = async () => {
    if (!order.signature) return
    await navigator.clipboard.writeText(order.signature)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="arc-card rounded-2xl overflow-hidden">
      <div
        className="h-0.5"
        style={{ background: order.status === 'ready' || order.status === 'completed'
          ? 'linear-gradient(90deg, var(--success), rgba(0,196,140,0.30))'
          : order.status === 'failed' || order.status === 'cancelled'
          ? 'linear-gradient(90deg, var(--danger), rgba(255,77,114,0.30))'
          : 'var(--arc-gradient-h)'
        }}
      />
      <div className="p-4 space-y-3">

        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="mono text-xs font-semibold" style={{ color: 'var(--arc-blue)' }}>
                #{order.id}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
              >
                {tr ? cfg.labelTr : cfg.label}
              </span>
              {order.status === 'executing' && (
                <RefreshCw className="size-3 animate-spin" style={{ color: 'var(--arc-blue)' }} />
              )}
            </div>
            <p className="text-lg font-bold leading-none" style={{ color: 'var(--ink)' }}>
              {order.totalAmount}{' '}
              <span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
            </p>
            {order.description && (
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-2)' }}>{order.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'var(--muted)', background: 'rgba(255,255,255,0.04)' }}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>

        {/* Time row */}
        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <div>
            <span className="font-semibold">{tr ? 'Çalıştır: ' : 'Execute: '}</span>
            <span style={{ color: 'var(--ink-2)' }}>{fmtDatetime(order.executeAfter, lang)}</span>
            {order.status === 'scheduled' && (
              <span className="ml-1" style={{ color: 'var(--arc-blue)' }}>
                ({timeRemaining(order.executeAfter, nowTs, lang)})
              </span>
            )}
          </div>
          <div>
            <span className="font-semibold">{tr ? 'Bitiş: ' : 'Expires: '}</span>
            <span style={{ color: 'var(--ink-2)' }}>{fmtDatetime(order.expiry, lang)}</span>
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="pt-2 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                {tr ? 'Alıcılar' : 'Recipients'}
              </p>
              {order.shares.map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="mono truncate max-w-[200px]" style={{ color: 'var(--ink-2)' }}>
                    {s.address.slice(0, 10)}…{s.address.slice(-6)}
                  </span>
                  <span className="font-semibold ml-2" style={{ color: 'var(--arc-blue)' }}>
                    {(s.basisPoints / 100).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>

            {order.signature && (
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                  EIP-712 {tr ? 'İmza (off-chain)' : 'Signature (off-chain)'}
                </p>
                <div className="mono text-xs rounded-xl px-3 py-2 break-all leading-relaxed"
                  style={{ background: 'rgba(0,82,255,0.06)', color: 'var(--ink-2)' }}>
                  {order.signature.slice(0, 42)}…
                  <button
                    type="button"
                    onClick={() => { void copySignature() }}
                    className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs"
                    style={{ background: 'rgba(0,82,255,0.10)', color: 'var(--arc-blue)' }}
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? (tr ? 'Kopyalandı' : 'Copied') : (tr ? 'Kopyala' : 'Copy')}
                  </button>
                </div>
              </div>
            )}

            {order.txHash && explorerUrl && (
              <a href={explorerUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--arc-blue)' }}>
                <ExternalLink className="size-3.5" />
                {tr ? 'Explorer\'da gör' : 'View on explorer'}
              </a>
            )}

            {order.failureReason && (
              <p className="text-xs rounded-xl px-3 py-2"
                style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}>
                {order.failureReason}
              </p>
            )}

            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              {tr ? 'Oluşturma: ' : 'Created: '}{fmtDatetime(order.createdAt, lang)}
              {order.executedAt ? ` · ${tr ? 'Çalıştırıldı: ' : 'Executed: '}${fmtDatetime(order.executedAt, lang)}` : ''}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 flex-wrap">
          {canSign && (
            <button type="button" disabled={isSigning} onClick={() => onSign(order.id)}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 min-w-[100px]"
              style={{ background: 'var(--arc-gradient)' }}>
              {isSigning
                ? <><RefreshCw className="size-3 animate-spin" /> {tr ? 'İmzalanıyor…' : 'Signing…'}</>
                : <>{tr ? 'İmzala' : 'Sign Order'}</>
              }
            </button>
          )}

          {canExecute && (
            <button type="button" disabled={isExecuting} onClick={() => onExecute(order.id)}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1.5 min-w-[100px]"
              style={{ background: 'var(--arc-gradient)', boxShadow: '0 2px 12px rgba(0,196,140,0.25)' }}>
              {isExecuting
                ? <><RefreshCw className="size-3 animate-spin" /> {tr ? 'Çalışıyor…' : 'Executing…'}</>
                : <><Play className="size-3" /> {tr ? 'Çalıştır' : 'Execute Now'}</>
              }
            </button>
          )}

          {canRetry && (
            <button type="button" onClick={() => onRetry(order.id)}
              className="px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5"
              style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)', border: '1px solid rgba(0,82,255,0.15)' }}>
              <RotateCcw className="size-3.5" />
              {tr ? 'Tekrar Dene' : 'Retry'}
            </button>
          )}

          {canCancel && (
            <button type="button" onClick={() => onCancel(order.id)}
              className="px-3 py-2.5 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)', border: '1px solid rgba(255,77,114,0.15)' }}>
              <X className="size-3.5" />
            </button>
          )}

          {canDelete && (
            <button type="button" onClick={() => onDelete(order.id)}
              className="px-3 py-2.5 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(107,122,153,0.08)', color: 'var(--muted)', border: '1px solid rgba(107,122,153,0.15)' }}>
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>

        {/* Status-specific info messages */}
        {order.status === 'scheduled' && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {tr
              ? '⏳ Çalıştırma zamanı geldiğinde "Çalıştır" butonu aktif olur. Otomatik çalıştırma desteklenmemektedir.'
              : '⏳ The Execute button activates when the scheduled time arrives. Automatic execution is not supported.'}
          </p>
        )}
        {order.status === 'draft' && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {tr
              ? '✍️ Bu emri etkinleştirmek için MetaMask ile imzalamanız gerekmektedir.'
              : '✍️ Sign this order with your wallet to activate it.'}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ScheduledPage() {
  const { lang } = useLang()
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const [showForm,    setShowForm]    = useState(false)
  const [formInitNow, setFormInitNow] = useState(0)
  const [filter,      setFilter]      = useState<OrderStatus | 'all'>('all')
  const [execError,   setExecError]   = useState<string | null>(null)

  const {
    orders,
    createOrder,
    signOrder,
    executeOrder,
    cancelOrder,
    retryOrder,
    deleteOrder,
    signingId,
    executingId,
    nowTs,
  } = useScheduledPay()

  const isWrongChain = !!chainId && chainId !== CHAIN_ID
  const tr = lang === 'tr'

  const handleFormSubmit = useCallback(
    (params: {
      amountStr: string
      shares: RecipientShare[]
      executeAfterTs: number
      expiryTs: number
      description: string
    }) => {
      const id = createOrder({ ...params, nowTs: Math.floor(Date.now() / 1000) })
      if (id) {
        setShowForm(false)
        // Auto-trigger signing on next tick
        setTimeout(() => { void signOrder(id) }, 50)
      }
    },
    [createOrder, signOrder]
  )

  const handleExecute = useCallback(
    (id: string) => {
      setExecError(null)
      const result = executeOrder(id)
      if (!result.ok && result.error) {
        setExecError(result.error)
        toast.error(result.error)
      }
    },
    [executeOrder]
  )

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter((o) => o.status === filter)

  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    return acc
  }, {})

  const FILTER_OPTIONS: { key: OrderStatus | 'all'; en: string; tr: string }[] = [
    { key: 'all',       en: 'All',       tr: 'Tümü'        },
    { key: 'draft',     en: 'Draft',     tr: 'Taslak'      },
    { key: 'scheduled', en: 'Scheduled', tr: 'Zamanlandı'  },
    { key: 'ready',     en: 'Ready',     tr: 'Hazır'       },
    { key: 'executing', en: 'Executing', tr: 'Çalışıyor'   },
    { key: 'completed', en: 'Completed', tr: 'Tamamlandı'  },
    { key: 'failed',    en: 'Failed',    tr: 'Başarısız'   },
    { key: 'cancelled', en: 'Cancelled', tr: 'İptal'       },
    { key: 'expired',   en: 'Expired',   tr: 'Süresi Doldu'},
  ]

  return (
    <div className="max-w-2xl space-y-4 pb-20">

      {/* Page header */}
      <div>
        <h1 className="display text-xl" style={{ color: 'var(--ink)' }}>
          {tr ? 'Zamanlanmış Ödemeler' : 'Scheduled Payments'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
          {tr
            ? 'Gelecek bir tarihe emir oluştur, imzala ve zamanı gelince çalıştır.'
            : 'Create a payment order for a future date, sign it, and execute when ready.'}
        </p>
      </div>

      {/* Architecture notice */}
      <div
        className="rounded-xl px-4 py-3 flex items-start gap-3"
        style={{ background: 'rgba(0,82,255,0.06)', border: '1px solid rgba(0,82,255,0.15)' }}
      >
        <ShieldAlert className="size-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--arc-blue)' }} />
        <div className="text-xs leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <strong style={{ color: 'var(--ink)' }}>
            {tr ? 'Kullanıcı tetiklemeli çalıştırma' : 'User-triggered execution'}
          </strong>
          {tr
            ? ' — Ödemeler otomatik çalışmaz. "Çalıştır" düğmesine basarak siz başlatırsınız. EIP-712 imzası tarayıcıda saklanır; mevcut kontrat imzayı onchain doğrulamamaktadır (beta).'
            : ' — Payments do not run automatically. You initiate execution by clicking "Execute Now". The EIP-712 signature is stored in your browser; the current contract does not verify the signature onchain (beta).'}
        </div>
      </div>

      {/* Wrong chain */}
      {isConnected && isWrongChain && (
        <div
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{ background: 'var(--danger-bg)', border: '1px solid rgba(255,77,114,0.20)' }}
        >
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            {tr ? 'Yanlış ağ. Arc Testnet\'e geçin.' : 'Wrong network. Switch to Arc Testnet.'}
          </p>
          <button type="button"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
            disabled={isSwitching}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white disabled:opacity-50"
            style={{ background: 'var(--danger)' }}>
            {isSwitching ? '…' : tr ? 'Geç' : 'Switch'}
          </button>
        </div>
      )}

      {/* Exec error */}
      {execError && (
        <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid rgba(255,77,114,0.20)' }}>
          {execError}
          <button type="button" className="ml-2 underline" onClick={() => setExecError(null)}>
            {tr ? 'Kapat' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Orders header + new */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4" style={{ color: 'var(--arc-blue)' }} />
          <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            {tr ? 'Emirlerim' : 'My Orders'}
          </span>
          {orders.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,82,255,0.10)', color: 'var(--arc-blue)' }}>
              {orders.length}
            </span>
          )}
        </div>
        {isConnected && !isWrongChain && !showForm && (
          <button type="button"
            onClick={() => { setFormInitNow(Math.floor(Date.now() / 1000)); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'var(--arc-gradient)', boxShadow: '0 2px 10px rgba(0,82,255,0.25)' }}>
            <Plus className="size-3.5" />
            {tr ? 'Yeni Emir' : 'New Order'}
          </button>
        )}
      </div>

      {/* New order form */}
      {showForm && (
        <NewOrderForm
          onSubmit={handleFormSubmit}
          onCancel={() => setShowForm(false)}
          lang={lang}
          initNow={formInitNow}
        />
      )}

      {/* Not connected */}
      {!isConnected && (
        <div className="arc-card rounded-2xl p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {tr ? 'Zamanlanmış ödeme oluşturmak için cüzdanını bağla.' : 'Connect your wallet to create scheduled payments.'}
          </p>
        </div>
      )}

      {/* Filter tabs */}
      {isConnected && orders.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_OPTIONS
            .filter((f) => f.key === 'all' || (statusCounts[f.key] ?? 0) > 0)
            .map((f) => (
              <button key={f.key} type="button"
                onClick={() => setFilter(f.key)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: filter === f.key ? 'var(--arc-blue)' : 'rgba(0,82,255,0.08)',
                  color: filter === f.key ? '#fff' : 'var(--arc-blue)',
                }}>
                {tr ? f.tr : f.en}
                {f.key !== 'all' && statusCounts[f.key]
                  ? ` (${statusCounts[f.key]})` : ''}
              </button>
            ))}
        </div>
      )}

      {/* Empty state */}
      {isConnected && orders.length === 0 && !showForm && (
        <div className="arc-card rounded-2xl p-8 text-center">
          <Clock className="size-8 mx-auto mb-3" style={{ color: 'var(--arc-blue)', opacity: 0.5 }} />
          <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            {tr ? 'Henüz zamanlanmış ödeme yok.' : 'No scheduled payments yet.'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            {tr ? '"Yeni Emir" ile başla.' : 'Get started with "New Order".'}
          </p>
        </div>
      )}

      {/* Order list */}
      <div className="space-y-3">
        {filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            lang={lang}
            nowTs={nowTs}
            onSign={(id) => { void signOrder(id) }}
            onExecute={handleExecute}
            onCancel={cancelOrder}
            onRetry={retryOrder}
            onDelete={deleteOrder}
            signingId={signingId}
            executingId={executingId}
          />
        ))}
      </div>
    </div>
  )
}
