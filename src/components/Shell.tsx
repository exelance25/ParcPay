import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { useLang } from '@/context/LangContext'
import { useT } from '@/lib/i18n'
import type { Route } from '@/lib/route'
import { CHAIN_ID, NETWORK, NETWORK_LABEL } from '@/chain'

export function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2 no-underline" style={{ color: 'var(--ink)' }} aria-label="ParcPay">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="hidden sm:block">
        <defs>
          <linearGradient id="pp-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0052ff" />
            <stop offset=".55" stopColor="#7b3fe4" />
            <stop offset="1" stopColor="#00d4c8" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="#0d1426" stroke="url(#pp-g)" strokeWidth="1.5" />
        <path d="M7 22a9 9 0 0 1 18 0" fill="none" stroke="url(#pp-g)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="22" r="2.4" fill="#eef2ff" />
      </svg>
      <span className="wordmark" style={{ fontSize: '1.3rem' }}>
        P<span className="arc-text">ARC</span>Pay
      </span>
    </a>
  )
}

const NAV: { route: Route; tr: string; en: string }[] = [
  { route: 'send', tr: 'Gönder', en: 'Send' },
  { route: 'schedule', tr: 'Planla', en: 'Schedule' },
  { route: 'activity', tr: 'Geçmiş', en: 'History' },
  { route: 'contract', tr: 'Kontrat', en: 'Contract' },
]

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { lang, setLang } = useLang()
  const T = useT()
  const { chainId, isConnected } = useAccount()
  const wrong = isConnected && chainId !== CHAIN_ID

  return (
    <div className="min-h-dvh flex flex-col">
      {NETWORK === 'testnet' && (
        <div className="text-center small py-1.5" style={{ background: 'var(--warn-wash)', color: 'var(--warn)' }}>
          {T('Test modu: Arc Testnet. Gerçek para hareket etmez.', 'Test mode: Arc Testnet. No real money moves.')}
        </div>
      )}
      <header className="sticky top-0 z-30" style={{ background: 'rgba(6,10,23,0.72)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto max-w-6xl px-3 sm:px-6 h-16 flex items-center gap-2 sm:gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.route} href={`#/${n.route}`} className="nav-link" aria-current={route === n.route ? 'page' : undefined}>
                {lang === 'tr' ? n.tr : n.en}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className={`pill ${wrong ? 'pill-red' : 'pill-grey'} hidden lg:inline-flex`}>
              <span className="size-1.5 rounded-full" style={{ background: wrong ? 'var(--danger)' : 'var(--settle)' }} />
              {wrong ? T('Yanlış ağ', 'Wrong network') : NETWORK_LABEL}
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')} aria-label="Language">
              {lang === 'tr' ? 'EN' : 'TR'}
            </button>
            <ConnectKitButton />
          </div>
        </div>
        <nav className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto" aria-label="Main mobile">
          {NAV.map((n) => (
            <a key={n.route} href={`#/${n.route}`} className="nav-link whitespace-nowrap" aria-current={route === n.route ? 'page' : undefined}>
              {lang === 'tr' ? n.tr : n.en}
            </a>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 justify-between small faint">
          <span>{T('ParcPay bağımsız bir uygulamadır; Arc veya Circle’ın resmi ürünü değildir.', 'ParcPay is an independent app, not an official Arc or Circle product.')}</span>
          <span>{T('Arc Studio ile geliştirildi', 'Built with Arc Studio')}</span>
        </div>
      </footer>
    </div>
  )
}

export function Page({ title, intro, children, aside }: { title: string; intro?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-6 sm:mb-8">
        <h1 className="t-1">{title}</h1>
        {intro && <p className="lead mt-2">{intro}</p>}
      </div>
      {aside ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="min-w-0">{children}</div>
          <aside className="space-y-4 lg:sticky lg:top-24">{aside}</aside>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
