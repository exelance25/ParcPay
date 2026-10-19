/**
 * TransactionPanel — real-time transaction status display.
 *
 * Shows:
 * - Approve step (hash + explorer link when available)
 * - Split step (hash + explorer link)
 * - Error with decoded message
 * - Success with total, hash, and explorer link
 *
 * Never claims success before onchain confirmation.
 */
import { CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { useLang } from '@/context/LangContext'
import type { TxStage } from '@/hooks/useSplitPay'

interface Props {
  stage: TxStage
  error?: string
  approveTxHash?: `0x${string}`
  approveExplorerUrl?: string
  splitTxHash?: `0x${string}`
  explorerUrl?: string
  totalAmount: string
  onReset: () => void
}

const STAGE_KEYS: Record<TxStage, string> = {
  idle: '',
  approving: 'tx.approving',
  'approve-confirming': 'tx.approveConfirming',
  splitting: 'tx.splitting',
  'split-confirming': 'tx.splitConfirming',
  success: 'tx.success',
  error: 'tx.error',
}

function shortHash(h?: string) {
  if (!h || h.length < 12) return h ?? ''
  return `${h.slice(0, 10)}…${h.slice(-8)}`
}

export function TransactionPanel({
  stage,
  error,
  approveTxHash,
  approveExplorerUrl,
  splitTxHash,
  explorerUrl,
  totalAmount,
  onReset,
}: Props) {
  const { t, lang } = useLang()

  if (stage === 'idle') return null

  const isPending = ['approving', 'approve-confirming', 'splitting', 'split-confirming'].includes(stage)
  const isSuccess = stage === 'success'
  const isError = stage === 'error'

  const approveActive = stage === 'approving' || stage === 'approve-confirming'
  const approveDone = ['splitting', 'split-confirming', 'success'].includes(stage)
  const splitActive = stage === 'splitting' || stage === 'split-confirming'
  const splitDone = stage === 'success'

  // Skip approve step display when we went straight to split (allowance was sufficient)
  const showApproveStep = approveTxHash != null || approveActive || approveDone

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: isSuccess
          ? 'rgba(0,196,140,0.06)'
          : isError
            ? 'rgba(255,77,114,0.06)'
            : 'rgba(0,82,255,0.06)',
        border: `1px solid ${
          isSuccess
            ? 'rgba(0,196,140,0.20)'
            : isError
              ? 'rgba(255,77,114,0.20)'
              : 'rgba(0,82,255,0.20)'
        }`,
      }}
    >
      {/* Top gradient bar */}
      <div
        className="h-0.5"
        style={{
          background: isSuccess
            ? 'linear-gradient(90deg, var(--success), rgba(0,196,140,0.30))'
            : isError
              ? 'linear-gradient(90deg, var(--danger), rgba(255,77,114,0.30))'
              : 'var(--arc-gradient-h)',
        }}
      />

      <div className="p-4 space-y-3">
        {/* Status icon + message */}
        <div className="flex items-center gap-3">
          {isSuccess ? (
            <CheckCircle className="size-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
          ) : isError ? (
            <XCircle className="size-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
          ) : (
            <Loader2 className="size-5 flex-shrink-0 animate-spin" style={{ color: 'var(--arc-blue)' }} />
          )}
          <p
            className="text-sm font-semibold"
            style={{
              color: isSuccess ? 'var(--success)' : isError ? 'var(--danger)' : 'var(--ink)',
            }}
          >
            {t(STAGE_KEYS[stage])}
          </p>
        </div>

        {/* Step progress — shown while pending */}
        {isPending && (
          <div className="space-y-2 pl-8">
            {showApproveStep && (
              <StepRow
                active={approveActive}
                done={approveDone}
                label={lang === 'tr' ? 'USDC onayı' : 'USDC approve'}
                hash={approveTxHash}
                explorerUrl={approveExplorerUrl}
              />
            )}
            {showApproveStep && (
              <div className="ml-1.5 w-px h-3" style={{ background: approveDone ? 'var(--arc-blue)' : 'var(--border)' }} />
            )}
            <StepRow
              active={splitActive}
              done={splitDone}
              label={lang === 'tr' ? 'Ödeme dağıtımı' : 'Payment distribution'}
              hash={splitTxHash}
              explorerUrl={explorerUrl}
            />
          </div>
        )}

        {/* Error message */}
        {isError && error && (
          <p className="text-xs pl-8" style={{ color: 'var(--danger)', lineHeight: '1.6' }}>
            {error}
          </p>
        )}

        {/* Success details */}
        {isSuccess && (
          <div className="pl-8 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {lang === 'tr' ? 'Toplam gönderildi' : 'Total sent'}
              </span>
              <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
                {totalAmount} USDC
              </span>
            </div>
            {splitTxHash && (
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-xs" style={{ color: 'var(--muted)' }}>
                  {shortHash(splitTxHash)}
                </span>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs font-medium underline hover:no-underline"
                    style={{ color: 'var(--arc-blue)' }}
                  >
                    <ExternalLink className="size-3" />
                    {lang === 'tr' ? 'Explorer\'da gör' : 'View on explorer'}
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {(isError || isSuccess) && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onReset}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold"
              style={
                isSuccess
                  ? { background: 'var(--arc-gradient)', color: '#fff' }
                  : {
                      background: 'rgba(255,77,114,0.10)',
                      color: 'var(--danger)',
                      border: '1px solid rgba(255,77,114,0.20)',
                    }
              }
            >
              {isSuccess
                ? lang === 'tr' ? 'Yeni ödeme' : 'New payment'
                : lang === 'tr' ? 'Tekrar dene' : 'Try again'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function StepRow({
  active,
  done,
  label,
  hash,
  explorerUrl,
}: {
  active: boolean
  done: boolean
  label: string
  hash?: `0x${string}`
  explorerUrl?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Dot */}
      <div
        className="flex-shrink-0 size-3 rounded-full transition-all"
        style={{
          background: done
            ? 'var(--success)'
            : active
              ? 'var(--arc-blue)'
              : 'var(--border)',
          boxShadow: active ? '0 0 8px rgba(0,82,255,0.60)' : 'none',
        }}
      />
      <span className="text-xs" style={{ color: done ? 'var(--success)' : active ? 'var(--ink)' : 'var(--muted)' }}>
        {label}
      </span>
      {hash && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-0.5 text-xs"
          style={{ color: 'var(--arc-blue)' }}
        >
          <ExternalLink className="size-2.5" />
          <span className="mono">{hash.slice(0, 8)}…</span>
        </a>
      )}
    </div>
  )
}
