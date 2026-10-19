import { Check, Loader2, X } from 'lucide-react'
import type { StepState } from '@/hooks/usePay'

export function Step({ n, label, state, hint }: { n: number; label: string; state: StepState; hint?: string }) {
  const bg = state === 'done' ? 'var(--settle-wash)' : state === 'error' ? 'var(--danger-wash)' : state === 'idle' ? 'var(--sunk)' : 'var(--usdc-wash)'
  const fg = state === 'done' ? 'var(--settle)' : state === 'error' ? 'var(--danger)' : state === 'idle' ? 'var(--ink-3)' : 'var(--usdc-deep)'
  return (
    <li className="flex items-center gap-3">
      <span className="step-dot" style={{ background: bg, color: fg }}>
        {state === 'done' ? <Check size={14} /> : state === 'error' ? <X size={14} /> : state === 'wallet' || state === 'pending' ? <Loader2 size={14} className="animate-spin" /> : n}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold small">{label}</span>
        {hint && <span className="block small faint">{hint}</span>}
      </span>
    </li>
  )
}
