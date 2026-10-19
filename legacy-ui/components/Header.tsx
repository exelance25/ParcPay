/**
 * ParcPay — top header bar.
 * Shows the wordmark, language toggle, wallet button, and mobile nav tabs.
 */
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { AlertTriangle } from 'lucide-react'
import { useLang, type Lang } from '@/context/LangContext'
import { LogoWordmark } from '@/brand/Logo'

const CHAIN_ID = arcTestnet.id

export type PageKey = 'overview' | 'split' | 'scheduled' | 'requests' | 'activity' | 'permissions' | 'settings'

const NAV_ITEMS: { key: PageKey; en: string; tr: string }[] = [
  { key: 'overview',     en: 'Overview',     tr: 'Genel Bakış' },
  { key: 'split',        en: 'Split',        tr: 'Böl' },
  { key: 'scheduled',    en: 'Schedule',     tr: 'Zamanla' },
  { key: 'requests',     en: 'Requests',     tr: 'İstekler' },
  { key: 'activity',     en: 'Activity',     tr: 'İşlemler' },
  { key: 'permissions',  en: 'Permissions',  tr: 'İzinler' },
  { key: 'settings',     en: 'Settings',     tr: 'Ayarlar' },
]

interface HeaderProps {
  page: PageKey
  onNav: (p: PageKey) => void
}

export function Header({ page, onNav }: HeaderProps) {
  const { chainId, isConnected } = useAccount()
  const { lang, setLang, t } = useLang()
  const wrongChain = isConnected && chainId !== CHAIN_ID

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'rgba(7, 11, 24, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">

          {/* Left: logo */}
          <button
            type="button"
            onClick={() => onNav('overview')}
            className="flex-shrink-0 focus:outline-none"
            aria-label="Go to overview"
          >
            <LogoWordmark size="sm" />
          </button>

          {/* Center: desktop nav tabs */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const active = page === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNav(item.key)}
                  className="px-3 py-1.5 rounded-xl text-[13px] font-medium transition-all whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  style={{
                    background: active ? 'var(--arc-gradient)' : 'transparent',
                    color: active ? '#fff' : 'var(--muted)',
                    boxShadow: active ? '0 2px 10px rgba(0,82,255,0.22)' : 'none',
                  }}
                >
                  {lang === 'tr' ? item.tr : item.en}
                </button>
              )
            })}
          </nav>

          {/* Right: wrong-chain + lang + wallet */}
          <div className="flex items-center gap-2 flex-shrink-0">

            {wrongChain && (
              <div
                className="hidden sm:flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  background: 'var(--danger-bg)',
                  color: 'var(--danger)',
                  border: '1px solid rgba(255,77,114,0.20)',
                }}
              >
                <AlertTriangle className="size-3 flex-shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{t('app.wrongNetwork').split(' ').slice(0, 2).join(' ')}</span>
              </div>
            )}

            {/* Language toggle */}
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
              role="group"
              aria-label="Language"
            >
              {(['tr', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className="px-2.5 py-1.5 text-xs font-semibold transition-all focus:outline-none"
                  style={{
                    background: lang === l ? 'var(--arc-gradient)' : 'transparent',
                    color:      lang === l ? '#fff' : 'var(--muted)',
                  }}
                >
                  {l === 'tr' ? 'TR' : 'EN'}
                </button>
              ))}
            </div>

            <ConnectKitButton />
          </div>
        </div>

        {/* Mobile nav — horizontally scrollable */}
        <nav
          className="md:hidden flex gap-1 overflow-x-auto pb-2"
          style={{ scrollbarWidth: 'none' }}
          aria-label="Mobile navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active = page === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNav(item.key)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
                style={{
                  background: active ? 'var(--arc-gradient)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#fff' : 'var(--muted)',
                  boxShadow: active ? '0 2px 8px rgba(0,82,255,0.20)' : 'none',
                  border: active ? 'none' : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {lang === 'tr' ? item.tr : item.en}
              </button>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
