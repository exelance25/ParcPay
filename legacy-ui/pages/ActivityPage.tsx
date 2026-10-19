/**
 * ActivityPage — real transaction history from local store.
 *
 * Data source: localStorage via activityStore (local state only, not onchain).
 * Onchain truth: click the explorer link on any confirmed entry.
 * Clearly labelled: "Local record" vs "Onchain confirmed".
 */
import { useState, useMemo } from 'react'
import {
  ArrowUpRight, Trash2, RefreshCw, SplitSquareHorizontal,
  Clock, Bell, Search, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useLang } from '@/context/LangContext'
import { activityStore, type ActivityEntry, type ActivityStatus, type ActivityType } from '@/store/activityStore'

// ── Status styles ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<ActivityStatus, { bg: string; color: string; label: string; labelTr: string }> = {
  confirmed: { bg: 'rgba(0,196,140,0.12)',  color: '#00C48C', label: 'Confirmed', labelTr: 'Onaylandı' },
  failed:    { bg: 'rgba(255,77,114,0.10)', color: '#FF4D72', label: 'Failed',    labelTr: 'Başarısız' },
  pending:   { bg: 'rgba(234,179,8,0.10)',  color: '#EAB308', label: 'Pending',   labelTr: 'Beklemede' },
  cancelled: { bg: 'rgba(107,122,153,0.12)',color: '#6B7A99', label: 'Cancelled', labelTr: 'İptal'     },
}

const TYPE_CONFIG: Record<ActivityType, {
  label: string; labelTr: string
  Icon: React.FC<{ className?: string }>
  accentColor: string
}> = {
  split:     { label: 'Split Payment',    labelTr: 'Bölünmüş Ödeme', Icon: SplitSquareHorizontal, accentColor: 'var(--arc-blue)' },
  scheduled: { label: 'Scheduled Pay',    labelTr: 'Zamanlanmış',    Icon: Clock,                 accentColor: 'var(--arc-purple)' },
  request:   { label: 'Payment Request',  labelTr: 'Ödeme İsteği',   Icon: Bell,                  accentColor: 'var(--arc-teal)' },
}

// ── Entry card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, lang }: { entry: ActivityEntry; lang: string }) {
  const [expanded, setExpanded] = useState(false)
  const st  = STATUS_STYLES[entry.status] ?? STATUS_STYLES.pending
  const tc  = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.split
  const Icon = tc.Icon
  const tr  = lang === 'tr'

  return (
    <div className="arc-card rounded-2xl overflow-hidden cursor-pointer"
      onClick={() => setExpanded((e) => !e)}>

      {/* Coloured left border */}
      <div className="flex">
        <div className="w-0.5 flex-shrink-0" style={{ background: tc.accentColor }} />
        <div className="flex-1">

          {/* Summary row */}
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="size-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `color-mix(in srgb, ${tc.accentColor} 12%, transparent)` }}
              >
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium" style={{ color: tc.accentColor }}>
                    {tr ? tc.labelTr : tc.label}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {entry.totalAmount} USDC
                  </span>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                  {entry.recipients.length} {tr ? 'alıcı' : 'recipient(s)'}
                  {' · '}
                  {new Date(entry.timestamp * 1000).toLocaleString(tr ? 'tr-TR' : 'en-US', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: st.bg, color: st.color }}
              >
                {tr ? st.labelTr : st.label}
              </span>
              {entry.explorerUrl && (
                <a href={entry.explorerUrl} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={tr ? 'Explorer\'da gör' : 'View on explorer'}
                  style={{ color: 'var(--arc-blue)' }}>
                  <ArrowUpRight className="size-3.5" />
                </a>
              )}
              {expanded
                ? <ChevronUp className="size-3.5" style={{ color: 'var(--muted)' }} />
                : <ChevronDown className="size-3.5" style={{ color: 'var(--muted)' }} />
              }
            </div>
          </div>

          {/* Expanded detail */}
          {expanded && (
            <div
              className="px-4 pb-4 space-y-3"
              style={{ borderTop: '1px solid var(--border)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Recipients */}
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
                  {tr ? 'Dağıtım' : 'Distribution'}
                </p>
                {entry.recipients.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <span className="mono truncate max-w-[180px]" style={{ color: 'var(--ink-2)' }}>
                      {r.address.slice(0, 10)}…{r.address.slice(-6)}
                    </span>
                    <span style={{ color: 'var(--ink)' }}>
                      {r.amount} USDC{' '}
                      <span style={{ color: 'var(--muted)' }}>({(r.basisPoints / 100).toFixed(1)}%)</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Tx hash */}
              {entry.txHash && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
                    {tr ? 'İşlem Hash' : 'Transaction Hash'}
                  </p>
                  <p className="mono text-xs" style={{ color: 'var(--arc-blue)' }}>
                    {entry.txHash.slice(0, 16)}…{entry.txHash.slice(-8)}
                  </p>
                </div>
              )}

              {/* Scheduled metadata */}
              {entry.orderId && (
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {tr ? 'Emir ID: ' : 'Order ID: '}
                  <span className="mono">{entry.orderId}</span>
                  {entry.scheduleExecuteAfter && (
                    <>{' · '}{tr ? 'Zamanlandı: ' : 'Scheduled: '}
                      {new Date(entry.scheduleExecuteAfter * 1000).toLocaleDateString()}</>
                  )}
                </p>
              )}

              {/* Data source notice */}
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                {entry.network} · Chain {entry.chainId}
                {' · '}
                <span style={{ color: entry.status === 'confirmed' ? 'var(--success)' : 'var(--muted)' }}>
                  {entry.status === 'confirmed'
                    ? (tr ? 'Onchain onaylı' : 'Onchain confirmed')
                    : (tr ? 'Yerel kayıt — zincirde doğrula' : 'Local record — verify onchain')}
                </span>
              </p>

              {/* Failure reason */}
              {entry.failureReason && (
                <p className="text-xs rounded-xl px-3 py-2"
                  style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}>
                  {entry.failureReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ActivityPage() {
  const { lang } = useLang()
  const [entries,    setEntries]    = useState(() => activityStore.getAll())
  const [statusFilt, setStatusFilt] = useState<ActivityStatus | 'all'>('all')
  const [typeFilt,   setTypeFilt]   = useState<ActivityType   | 'all'>('all')
  const [query,      setQuery]      = useState('')

  const tr = lang === 'tr'

  const refresh  = () => setEntries(activityStore.getAll())
  const clearAll = () => { activityStore.clear(); setEntries([]) }

  const filtered = useMemo(() => {
    let result = entries
    if (statusFilt !== 'all') result = result.filter((e) => e.status === statusFilt)
    if (typeFilt   !== 'all') result = result.filter((e) => e.type   === typeFilt)
    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter((e) =>
        e.totalAmount.includes(q) ||
        e.txHash?.toLowerCase().includes(q) ||
        e.recipients.some((r) => r.address.toLowerCase().includes(q))
      )
    }
    return result
  }, [entries, statusFilt, typeFilt, query])

  const confirmedCount = entries.filter((e) => e.status === 'confirmed').length
  const totalUSDC = entries
    .filter((e) => e.status === 'confirmed')
    .reduce((s, e) => s + parseFloat(e.totalAmount || '0'), 0)

  const statusOpts: { key: ActivityStatus | 'all'; en: string; tr: string }[] = [
    { key: 'all',       en: 'All',       tr: 'Tümü'     },
    { key: 'confirmed', en: 'Confirmed', tr: 'Onaylı'   },
    { key: 'pending',   en: 'Pending',   tr: 'Bekleyen' },
    { key: 'failed',    en: 'Failed',    tr: 'Başarısız'},
    { key: 'cancelled', en: 'Cancelled', tr: 'İptal'    },
  ]

  const typeOpts: { key: ActivityType | 'all'; en: string; tr: string }[] = [
    { key: 'all',       en: 'All types',  tr: 'Tüm türler'   },
    { key: 'split',     en: 'Split',      tr: 'Böl & Gönder' },
    { key: 'scheduled', en: 'Scheduled',  tr: 'Zamanlanmış'  },
    { key: 'request',   en: 'Request',    tr: 'İstek'        },
  ]

  return (
    <div className="max-w-2xl space-y-4 pb-8">

      {/* Header + stats */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="display text-xl" style={{ color: 'var(--ink)' }}>
            {tr ? 'İşlem Geçmişi' : 'Activity'}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {tr
              ? 'Yerel kayıt. Onchain doğrulama için explorer linkine tıklayın.'
              : 'Local records only. Click the explorer link for onchain confirmation.'}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button type="button" onClick={refresh}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)' }}
            title={tr ? 'Yenile' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </button>
          {entries.length > 0 && (
            <button type="button" onClick={clearAll}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}
              title={tr ? 'Tümünü temizle' : 'Clear all'}>
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: tr ? 'Toplam İşlem' : 'Total Txns',   value: entries.length.toString() },
            { label: tr ? 'Onaylanan'    : 'Confirmed',     value: confirmedCount.toString() },
            { label: tr ? 'Toplam USDC'  : 'Total USDC',   value: totalUSDC.toFixed(2) },
          ].map((s) => (
            <div key={s.label}
              className="rounded-2xl p-3 text-center"
              style={{ background: 'rgba(0,82,255,0.06)', border: '1px solid rgba(0,82,255,0.12)' }}>
              <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>{s.value}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr ? 'Adres veya hash ara…' : 'Search by address or hash…'}
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
        </div>
      )}

      {/* Filters */}
      {entries.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
            {statusOpts.map((f) => (
              <button key={f.key} type="button"
                onClick={() => setStatusFilt(f.key)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: statusFilt === f.key ? 'var(--arc-blue)' : 'rgba(0,82,255,0.08)',
                  color:      statusFilt === f.key ? '#fff' : 'var(--arc-blue)',
                }}>
                {tr ? f.tr : f.en}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {typeOpts.map((f) => (
              <button key={f.key} type="button"
                onClick={() => setTypeFilt(f.key)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: typeFilt === f.key ? 'var(--arc-purple)' : 'rgba(123,63,228,0.08)',
                  color:      typeFilt === f.key ? '#fff' : 'var(--arc-purple)',
                }}>
                {tr ? f.tr : f.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="arc-card rounded-2xl p-8 text-center">
          <p style={{ color: 'var(--muted)' }}>
            {entries.length === 0
              ? (tr ? 'Henüz işlem yok.' : 'No activity yet.')
              : (tr ? 'Filtreye uyan işlem yok.' : 'No entries match the current filter.')}
          </p>
          {entries.length === 0 && (
            <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
              {tr
                ? 'İlk ödemenizi gönderdikten sonra burada görünecek.'
                : 'Your first payment will appear here after it is sent.'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}
