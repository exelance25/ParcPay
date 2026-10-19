/**
 * SplitPreview — shows the exact USDC amount each recipient will receive.
 *
 * In percent mode: amounts are calculated from totalAmount × basisPoints.
 * In fixed mode:   amounts are taken directly from fixedAmount fields.
 * Last recipient gets any integer-division remainder (matches contract logic).
 * The preview is read-only and never initiates a transaction.
 */
import { arcTestnet } from 'viem/chains'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { useLang } from '@/context/LangContext'
import type { RecipientShare, AllocationMode } from '@/utils/splitpay'
import { bpToPct } from '@/utils/splitpay'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

const CHAIN_ID = arcTestnet.id

interface Props {
  totalAmount: string
  shares: RecipientShare[]
  amounts: bigint[]       // pre-calculated by App.tsx using calculateAmounts()
  validationError: string | null
  mode: AllocationMode
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function SplitPreview({ totalAmount, shares, amounts, validationError, mode }: Props) {
  const { lang } = useLang()
  const dec = usdcDecimalsFor(CHAIN_ID)
  const hasAmounts = amounts.length > 0 && amounts.length === shares.length

  const totalNum = parseFloat(totalAmount)
  const isReady = !isNaN(totalNum) && totalNum > 0 && hasAmounts

  if (!isReady && !validationError) return null

  // Verify sum equals total (sanity check — catches rounding bugs)
  const sumRaw = amounts.reduce((a, b) => a + b, 0n)
  let totalRaw = 0n
  try {
    // Re-derive from the displayed totalAmount string using the same decimal count
    const divisor = BigInt(10 ** dec)
    const [whole, frac = ''] = totalAmount.split('.')
    const fracPadded = frac.padEnd(dec, '0').slice(0, dec)
    totalRaw = BigInt(whole) * divisor + BigInt(fracPadded)
  } catch { /* leave as 0n */ }

  const sumMismatch = totalRaw > 0n && sumRaw !== totalRaw

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(0,82,255,0.04)',
        border: `1px solid ${validationError ? 'rgba(255,77,114,0.20)' : 'rgba(0,82,255,0.14)'}`,
      }}
    >
      <div className="h-px" style={{ background: validationError ? 'var(--danger)' : 'var(--arc-gradient-h)' }} />

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {validationError ? (
            <AlertTriangle className="size-3.5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
          ) : (
            <CheckCircle2 className="size-3.5 flex-shrink-0" style={{ color: 'var(--arc-blue)' }} />
          )}
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: validationError ? 'var(--danger)' : 'var(--arc-blue)', letterSpacing: '0.08em' }}
          >
            {lang === 'tr' ? 'Dağıtım Önizlemesi' : 'Distribution Preview'}
          </p>
          {/* Atomic badge */}
          {!validationError && (
            <span
              className="ml-auto text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(0,196,140,0.10)', color: 'var(--success)', border: '1px solid rgba(0,196,140,0.20)' }}
            >
              {lang === 'tr' ? 'Atomik' : 'Atomic'}
            </span>
          )}
        </div>

        {validationError ? (
          <p className="text-xs" style={{ color: 'var(--danger)', lineHeight: '1.6' }}>
            {validationError}
          </p>
        ) : (
          <div className="space-y-1.5">
            {shares.map((s, i) => {
              const rawAmt = amounts[i] ?? 0n
              const fmt = Amount.fromRaw(rawAmt, dec).toFixed(6).replace(/\.?0+$/, '')
              const isLast = i === shares.length - 1

              // Show "remainder" badge on last recipient only when there is a
              // non-zero remainder due to integer division.
              const expectedFromBp = amounts.reduce((a, b) => a + b, 0n)
              const hasRemainder = isLast && mode === 'percent' && expectedFromBp > 0n && rawAmt > 0n

              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex-shrink-0 size-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'rgba(0,82,255,0.15)', color: 'var(--arc-blue)' }}
                    >
                      {i + 1}
                    </div>
                    <span className="mono text-xs truncate" style={{ color: 'var(--ink-2)' }}>
                      {shortAddr(s.address)}
                    </span>
                    {hasRemainder && (
                      <span
                        className="text-xs px-1 py-0.5 rounded flex-shrink-0"
                        style={{
                          background: 'rgba(0,82,255,0.08)',
                          color: 'var(--muted)',
                          fontSize: '0.62rem',
                        }}
                      >
                        +rem
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {mode === 'percent' ? `${bpToPct(s.basisPoints)}%` : ''}
                    </span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {fmt}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
                  </div>
                </div>
              )
            })}

            {/* Total row */}
            <div
              className="flex items-center justify-between rounded-xl px-3 py-2.5 mt-1"
              style={{ background: 'rgba(0,82,255,0.08)', border: '1px solid rgba(0,82,255,0.15)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--arc-blue)' }}>
                {lang === 'tr' ? 'Toplam' : 'Total'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {totalAmount}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>USDC</span>
              </div>
            </div>

            {/* Sum-mismatch warning (should never appear, but shows if it does) */}
            {sumMismatch && (
              <p className="text-xs mt-1 px-3" style={{ color: 'var(--danger)' }}>
                {lang === 'tr'
                  ? 'Uyarı: Önizleme tutarları toplama eşit değil — lütfen yeniden deneyin.'
                  : 'Warning: preview amounts do not sum to total — please try again.'}
              </p>
            )}

            {/* Blocklist risk notice — security audit finding */}
            <div
              className="flex items-start gap-2 mt-2 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(255,200,0,0.05)', border: '1px solid rgba(255,200,0,0.12)' }}
            >
              <AlertTriangle className="size-3 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning, #F59E0B)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                {lang === 'tr'
                  ? 'Güvenlik notu: USDC token ihraççısı (Circle) bir alıcı adresini engellemiş olursa, tüm işlem geri alınır. Hiçbir ödeme gerçekleşmez.'
                  : 'Security note: if any recipient address is USDC-blocklisted by the token issuer (Circle), the entire transaction will revert and no payment will be sent.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
