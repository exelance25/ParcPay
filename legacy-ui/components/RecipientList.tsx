/**
 * RecipientList — supports both percent and fixed-amount allocation modes.
 *
 * Percent mode: user types 0–100 (2 decimal places). basisPoints = round(pct × 100).
 * Fixed mode:   user types a USDC amount. basisPoints are derived when submitting.
 *
 * MAX_RECIPIENTS = 5 per UX spec (contract allows 10, but 5 is the UI limit).
 */
import { X, RefreshCw } from 'lucide-react'
import { isAddress } from 'viem'
import { useLang } from '@/context/LangContext'
import {
  type RecipientShare,
  type AllocationMode,
  MAX_RECIPIENTS,
  BASIS_POINTS,
  bpToPct,
  remainingBp,
  remainingFixed,
} from '@/utils/splitpay'

interface Props {
  shares: RecipientShare[]
  onChange: (shares: RecipientShare[]) => void
  errors: Record<number, string>
  mode: AllocationMode
  onModeChange: (m: AllocationMode) => void
  totalAmount: string   // needed for fixed-mode "remaining" display
}

export function RecipientList({ shares, onChange, errors, mode, onModeChange, totalAmount }: Props) {
  const { lang } = useLang()

  const totalBp = shares.reduce((s, r) => s + (r.basisPoints || 0), 0)
  const isComplete = totalBp === BASIS_POINTS
  const isOver = totalBp > BASIS_POINTS

  const update = (i: number, patch: Partial<RecipientShare>) => {
    onChange(shares.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  const addRecipient = () => {
    if (shares.length >= MAX_RECIPIENTS) return
    onChange([...shares, { address: '', basisPoints: 0, fixedAmount: '' }])
  }

  const removeRecipient = (i: number) => {
    if (shares.length <= 2) return
    onChange(shares.filter((_, idx) => idx !== i))
  }

  const fillRemainder = (i: number) => {
    if (mode === 'percent') {
      const other = shares.reduce((s, r, idx) => (idx !== i ? s + (r.basisPoints || 0) : s), 0)
      const fill = Math.max(0, BASIS_POINTS - other)
      update(i, { basisPoints: fill })
    } else {
      const rem = remainingFixed(shares, totalAmount)
      if (rem <= 0) return
      const cur = parseFloat(shares[i].fixedAmount ?? '0') || 0
      update(i, { fixedAmount: String(+(cur + rem).toFixed(6)) })
    }
  }

  const remaining = mode === 'percent'
    ? remainingBp(shares)
    : remainingFixed(shares, totalAmount)

  const remainingLabel = mode === 'percent'
    ? `${(remaining / 100).toFixed(2)}% remaining`
    : `${remaining.toFixed(2)} USDC remaining`

  const totalLabel = mode === 'percent'
    ? `${(totalBp / 100).toFixed(0)}%`
    : ''

  return (
    <div>
      {/* Section header + mode toggle */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3
          className="text-xs font-semibold uppercase tracking-wide flex-shrink-0"
          style={{ color: 'var(--muted)' }}
        >
          {lang === 'tr' ? 'Alıcılar' : 'Recipients'}
        </h3>

        <div className="flex items-center gap-2">
          {/* Remaining / total badge */}
          {remaining !== 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full hidden sm:inline"
              style={{ color: 'var(--muted)', background: 'rgba(255,255,255,0.04)' }}
            >
              {remainingLabel}
            </span>
          )}

          {/* Percent total badge */}
          {mode === 'percent' && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors"
              style={{
                background: isComplete
                  ? 'rgba(0,196,140,0.12)'
                  : isOver
                    ? 'rgba(255,77,114,0.10)'
                    : 'rgba(0,82,255,0.08)',
                color: isComplete
                  ? 'var(--success)'
                  : isOver
                    ? 'var(--danger)'
                    : 'var(--arc-blue)',
                border: `1px solid ${isComplete ? 'rgba(0,196,140,0.20)' : isOver ? 'rgba(255,77,114,0.20)' : 'rgba(0,82,255,0.15)'}`,
              }}
            >
              {totalLabel}
            </span>
          )}

          {/* Mode toggle */}
          <div
            className="flex rounded-xl overflow-hidden flex-shrink-0"
            style={{ border: '1px solid var(--border)' }}
          >
            {(['percent', 'fixed'] as AllocationMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                className="px-2.5 py-1 text-xs font-semibold transition-all"
                style={{
                  background: mode === m ? 'var(--arc-gradient)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--muted)',
                }}
              >
                {m === 'percent'
                  ? lang === 'tr' ? '%' : '%'
                  : lang === 'tr' ? 'Sabit' : 'Fixed'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recipient rows */}
      <div className="space-y-2.5">
        {shares.map((s, i) => {
          const hasError = !!errors[i]
          const addrValid = s.address ? isAddress(s.address) : null
          const isZeroAddr = s.address?.toLowerCase() === '0x0000000000000000000000000000000000000000'

          return (
            <div key={i} className="space-y-1">
              <div className="flex gap-2">
                {/* Index badge */}
                <div
                  className="flex-shrink-0 size-8 rounded-xl flex items-center justify-center text-xs font-bold self-center"
                  style={{ background: 'rgba(0,82,255,0.10)', color: 'var(--arc-blue)' }}
                >
                  {i + 1}
                </div>

                {/* Address input */}
                <div className="flex-1 relative min-w-0">
                  <input
                    type="text"
                    value={s.address}
                    onChange={(e) => update(i, { address: e.target.value })}
                    placeholder={lang === 'tr' ? '0x… adres' : '0x… address'}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-xl px-3 py-2.5 text-xs mono outline-none transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${
                        isZeroAddr || hasError
                          ? 'var(--danger)'
                          : addrValid === true
                            ? 'rgba(0,196,140,0.35)'
                            : 'var(--border)'
                      }`,
                      color: 'var(--ink)',
                    }}
                  />
                  {addrValid && !isZeroAddr && (
                    <span
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold"
                      style={{ color: 'var(--success)' }}
                    >
                      ✓
                    </span>
                  )}
                </div>

                {/* Percent or fixed-amount input */}
                {mode === 'percent' ? (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={s.basisPoints > 0 ? bpToPct(s.basisPoints) : ''}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value)
                      update(i, { basisPoints: isNaN(n) ? 0 : Math.min(BASIS_POINTS, Math.round(n * 100)) })
                    }}
                    placeholder="%"
                    className="w-16 rounded-xl px-2 py-2.5 text-xs text-center outline-none flex-shrink-0"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      color: 'var(--ink)',
                    }}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={s.fixedAmount ?? ''}
                    onChange={(e) => update(i, { fixedAmount: e.target.value })}
                    placeholder="USDC"
                    className="w-20 rounded-xl px-2 py-2.5 text-xs text-center outline-none flex-shrink-0"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      color: 'var(--ink)',
                    }}
                  />
                )}

                {/* Fill remainder */}
                <button
                  type="button"
                  onClick={() => fillRemainder(i)}
                  title={lang === 'tr' ? 'Kalanı doldur' : 'Fill remainder'}
                  className="size-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 self-center"
                  style={{
                    background: 'rgba(0,82,255,0.08)',
                    color: 'var(--arc-blue)',
                    border: '1px solid rgba(0,82,255,0.15)',
                  }}
                >
                  <RefreshCw className="size-3.5" />
                </button>

                {/* Remove */}
                {shares.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeRecipient(i)}
                    title={lang === 'tr' ? 'Kaldır' : 'Remove'}
                    className="size-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 self-center"
                    style={{ background: 'rgba(255,77,114,0.08)', color: 'var(--danger)' }}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Inline error */}
              {hasError && (
                <p className="text-xs pl-10" style={{ color: 'var(--danger)' }}>
                  {errors[i]}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Add recipient */}
      {shares.length < MAX_RECIPIENTS ? (
        <button
          type="button"
          onClick={addRecipient}
          className="mt-3 w-full rounded-xl py-2.5 text-xs font-semibold transition-all"
          style={{
            background: 'rgba(0,82,255,0.06)',
            color: 'var(--arc-blue)',
            border: '1px dashed rgba(0,82,255,0.25)',
          }}
        >
          {lang === 'tr' ? '+ Alıcı Ekle' : '+ Add Recipient'}
        </button>
      ) : (
        <p className="mt-2 text-xs text-center" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? `Maksimum ${MAX_RECIPIENTS} alıcı` : `Maximum ${MAX_RECIPIENTS} recipients`}
        </p>
      )}
    </div>
  )
}
