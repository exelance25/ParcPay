/**
 * OverviewPage — ParcPay dashboard.
 * Shows wallet balance, quick actions, and recent activity summary.
 */
import { useAccount } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowUpRight, Clock, Layers, FileText, Shield, Settings2 } from 'lucide-react'
import { useLang } from '@/context/LangContext'
import { getUsdc } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import { activityStore } from '@/store/activityStore'
import { BRAND } from '@/brand/brand'
import { LogoMark } from '@/brand/Logo'
import { ConnectKitButton } from 'connectkit'

const CHAIN_ID = arcTestnet.id

type PageKey = 'overview' | 'split' | 'scheduled' | 'requests' | 'activity' | 'permissions' | 'settings'

interface OverviewPageProps {
  onNav: (p: PageKey) => void
}

export function OverviewPage({ onNav }: OverviewPageProps) {
  const { address, isConnected } = useAccount()
  const { lang } = useLang()
  const usdcFact = getUsdc(CHAIN_ID)!

  const { data: rawBalance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })

  const balance = rawBalance != null
    ? Amount.fromRaw(rawBalance, usdcFact.decimals).toFixed(2)
    : null

  const recentActivity = activityStore.getAll().slice(0, 3)
  const totalSent = activityStore.getAll()
    .filter((a) => a.status === 'confirmed' && a.type === 'split')
    .reduce((acc, a) => acc + parseFloat(a.totalAmount || '0'), 0)

  const quickActions: { key: PageKey; icon: React.ReactNode; labelTr: string; labelEn: string; desc: string }[] = [
    {
      key: 'split',
      icon: <Layers className="size-5" />,
      labelTr: 'Ödeme Böl', labelEn: 'Split Payment',
      desc: lang === 'tr' ? 'Tek işlemde birden fazla alıcı' : 'Multiple recipients, one transaction',
    },
    {
      key: 'scheduled',
      icon: <Clock className="size-5" />,
      labelTr: 'Zamanlanmış', labelEn: 'Schedule',
      desc: lang === 'tr' ? 'İleride çalıştırılacak emir oluştur' : 'Create a future-dated payment order',
    },
    {
      key: 'requests',
      icon: <FileText className="size-5" />,
      labelTr: 'Ödeme İsteği', labelEn: 'Request',
      desc: lang === 'tr' ? 'Paylaşılabilir ödeme linki oluştur' : 'Generate a shareable payment link',
    },
    {
      key: 'permissions',
      icon: <Shield className="size-5" />,
      labelTr: 'İzinler', labelEn: 'Permissions',
      desc: lang === 'tr' ? 'Subkey yetki ayarları' : 'Subkey authorization settings',
    },
  ]

  return (
    <div className="space-y-4 pb-8">
      {/* Hero */}
      <div
        className="rounded-3xl p-6 overflow-hidden relative"
        style={{
          background: 'var(--arc-gradient)',
          boxShadow: '0 8px 40px rgba(0,82,255,0.25)',
        }}
      >
        <div className="absolute top-0 right-0 opacity-10">
          <LogoMark size={120} mono />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">
          {BRAND.name}
        </p>
        <p className="text-white/80 text-sm mb-4">{BRAND.tagline}</p>

        {isConnected ? (
          <>
            <p className="text-xs text-white/60 mb-1">
              {lang === 'tr' ? 'USDC Bakiyesi' : 'USDC Balance'}
            </p>
            <p className="text-3xl font-bold text-white display" style={{ letterSpacing: '-0.04em' }}>
              {balance != null ? `$${balance}` : '—'}
            </p>
            <p className="text-xs text-white/50 mt-1 mono">
              {address?.slice(0, 8)}…{address?.slice(-6)}
            </p>
          </>
        ) : (
          <div className="mt-2">
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* Stats row */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: lang === 'tr' ? 'Toplam Gönderim' : 'Total Sent',
              value: `$${totalSent.toFixed(2)}`,
              sub: lang === 'tr' ? 'onaylı işlemler' : 'confirmed txs',
            },
            {
              label: lang === 'tr' ? 'İşlem Sayısı' : 'Transactions',
              value: String(activityStore.getAll().filter((a) => a.status === 'confirmed').length),
              sub: lang === 'tr' ? 'tüm zamanlar' : 'all time',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="arc-card rounded-2xl p-4"
            >
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{stat.label}</p>
              <p className="text-xl font-bold mt-1 display" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                {stat.value}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
          {lang === 'tr' ? 'Hızlı İşlemler' : 'Quick Actions'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onNav(a.key)}
              className="arc-card rounded-2xl p-4 text-left hover:border-blue-500/40 transition-all active:scale-[0.98]"
              style={{ border: '1px solid var(--border)' }}
            >
              <div className="mb-2" style={{ color: 'var(--arc-blue)' }}>{a.icon}</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {lang === 'tr' ? a.labelTr : a.labelEn}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{a.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              {lang === 'tr' ? 'Son İşlemler' : 'Recent Activity'}
            </p>
            <button
              type="button"
              onClick={() => onNav('activity')}
              className="text-xs font-medium flex items-center gap-1"
              style={{ color: 'var(--arc-blue)' }}
            >
              {lang === 'tr' ? 'Tümü' : 'View all'} <ArrowUpRight className="size-3" />
            </button>
          </div>
          <div className="space-y-2">
            {recentActivity.map((a) => (
              <div
                key={a.id}
                className="arc-card rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    ${a.totalAmount} USDC
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {a.recipients.length} {lang === 'tr' ? 'alıcı' : 'recipients'} ·{' '}
                    {new Date(a.timestamp * 1000).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: a.status === 'confirmed'
                        ? 'rgba(0,196,140,0.12)' : 'rgba(255,77,114,0.10)',
                      color: a.status === 'confirmed' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {a.status === 'confirmed'
                      ? (lang === 'tr' ? 'Onaylandı' : 'Confirmed')
                      : (lang === 'tr' ? 'Başarısız' : 'Failed')}
                  </span>
                  {a.explorerUrl && (
                    <a
                      href={a.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--arc-blue)' }}
                    >
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings shortcut */}
      <button
        type="button"
        onClick={() => onNav('settings')}
        className="w-full arc-card rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-blue-500/30 transition-all text-left"
      >
        <Settings2 className="size-4" style={{ color: 'var(--muted)' }} />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {lang === 'tr' ? 'Ayarlar' : 'Settings'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {lang === 'tr' ? 'Ağ, dil, sürüm bilgisi' : 'Network, language, version info'}
          </p>
        </div>
        <ArrowUpRight className="size-3.5 ml-auto" style={{ color: 'var(--subtle)' }} />
      </button>
    </div>
  )
}
