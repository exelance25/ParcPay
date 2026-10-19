import { useReadContract } from 'wagmi'
import { useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { useLang } from '@/context/LangContext'

const CHAIN_ID = arcTestnet.id
const USDC = getUsdc(CHAIN_ID)!
const USDC_ADDRESS = USDC.address as `0x${string}`

export function AmountInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { address } = useAccount()
  const { t } = useLang()

  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const dec = usdcDecimalsFor(CHAIN_ID)
  const balance = rawBalance != null ? Amount.fromRaw(rawBalance, dec) : null
  const balanceStr = balance ? balance.toFixed(2) : '—'

  const setMax = () => {
    if (balance) onChange(balance.toFixed(6).replace(/\.?0+$/, ''))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {t('amount.label')}
        </label>
        {address && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {t('amount.balance')}: <span style={{ color: 'var(--ink-2)' }}>{balanceStr} USDC</span>
            </span>
            <button
              type="button"
              onClick={setMax}
              disabled={!balance}
              className="text-xs font-semibold px-2 py-0.5 rounded-lg disabled:opacity-40 transition-colors"
              style={{
                background: 'rgba(0,82,255,0.10)',
                color: 'var(--arc-blue)',
                border: '1px solid rgba(0,82,255,0.18)',
              }}
            >
              {t('amount.max')}
            </button>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all"
        style={{
          background: 'rgba(0,82,255,0.06)',
          border: `1px solid ${value ? 'rgba(0,82,255,0.35)' : 'var(--border)'}`,
        }}
      >
        <span className="text-2xl font-light" style={{ color: 'var(--arc-blue)' }}>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('amount.placeholder')}
          className="flex-1 bg-transparent text-2xl font-semibold outline-none placeholder-opacity-30"
          style={{ color: 'var(--ink)', fontFamily: 'Space Grotesk, sans-serif' }}
        />
        <span
          className="text-sm font-semibold px-2 py-1 rounded-lg"
          style={{ background: 'rgba(0,82,255,0.12)', color: 'var(--arc-blue)' }}
        >
          USDC
        </span>
      </div>
    </div>
  )
}
