/**
 * SettingsPage — network info, language, version, contract info.
 */
import { useAccount, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useLang, type Lang } from '@/context/LangContext'
import { BRAND } from '@/brand/brand'
import { LogoWordmark } from '@/brand/Logo'
import { getUsdc } from '@/onchain-facts'

const CHAIN_ID = arcTestnet.id
const ETH_SEPOLIA_ID = 11155111

export function SettingsPage() {
  const { lang, setLang } = useLang()
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const usdcArc = getUsdc(CHAIN_ID)!

  const networks = [
    {
      id: CHAIN_ID,
      name: 'Arc Testnet',
      usdc: usdcArc.address,
      contractStatus: lang === 'tr' ? 'Faucet limiti bekliyor' : 'Awaiting faucet reset',
      contractDeployed: false,
    },
    {
      id: ETH_SEPOLIA_ID,
      name: 'ETH Sepolia',
      usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      contractStatus: '0x9692f54be2921ce00a02de9ee97bfb06469c6167',
      contractDeployed: true,
      explorerUrl: 'https://sepolia.etherscan.io/address/0x9692f54be2921ce00a02de9ee97bfb06469c6167',
    },
  ]

  const activeNetwork = lang === 'tr' ? 'Aktif Ağ' : 'Active Network'

  return (
    <div className="space-y-5 pb-8">
      {/* Logo + version */}
      <div className="arc-card rounded-2xl p-5 flex items-center justify-between">
        <LogoWordmark size="md" showTagline />
        <span
          className="text-xs px-2 py-1 rounded-full font-mono"
          style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)' }}
        >
          v{BRAND.version}
        </span>
      </div>

      {/* Language */}
      <div className="arc-card rounded-2xl p-5">
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
          {lang === 'tr' ? 'Dil / Language' : 'Language / Dil'}
        </p>
        <div className="flex gap-2">
          {(['tr', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
              style={{
                background: lang === l ? 'var(--arc-gradient)' : 'rgba(255,255,255,0.04)',
                color: lang === l ? '#fff' : 'var(--ink-2)',
                border: lang === l ? 'none' : '1px solid var(--border)',
              }}
            >
              {l === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English'}
            </button>
          ))}
        </div>
      </div>

      {/* Networks */}
      <div className="arc-card rounded-2xl p-5">
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
          {lang === 'tr' ? 'Ağlar' : 'Networks'}
        </p>
        <div className="space-y-3">
          {networks.map((net) => {
            const isActive = isConnected && chainId === net.id
            return (
              <div
                key={net.id}
                className="rounded-xl p-3"
                style={{
                  background: isActive ? 'rgba(0,82,255,0.07)' : 'rgba(255,255,255,0.02)',
                  border: isActive ? '1px solid rgba(0,82,255,0.25)' : '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: isActive ? 'var(--success)' : 'var(--subtle)' }}
                    />
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{net.name}</span>
                    {isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,196,140,0.12)', color: '#00C48C' }}>
                        {activeNetwork}
                      </span>
                    )}
                  </div>
                  {!isActive && isConnected && (
                    <button
                      type="button"
                      onClick={() => switchChain({ chainId: net.id })}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
                      style={{ background: 'rgba(0,82,255,0.08)', color: 'var(--arc-blue)' }}
                    >
                      <RefreshCw className="size-3" />
                      {isPending ? (lang === 'tr' ? 'Geçiyor…' : 'Switching…') : (lang === 'tr' ? 'Geç' : 'Switch')}
                    </button>
                  )}
                </div>
                <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
                  <p>Chain ID: <span className="mono" style={{ color: 'var(--ink-2)' }}>{net.id}</span></p>
                  <p>USDC: <span className="mono" style={{ color: 'var(--ink-2)' }}>{net.usdc.slice(0, 12)}…{net.usdc.slice(-6)}</span></p>
                  <div className="flex items-center justify-between">
                    <p>
                      {lang === 'tr' ? 'Kontrat:' : 'Contract:'}{' '}
                      <span className="mono" style={{ color: net.contractDeployed ? 'var(--success)' : 'var(--subtle)' }}>
                        {net.contractDeployed
                          ? `${net.contractStatus.slice(0, 10)}…`
                          : net.contractStatus}
                      </span>
                    </p>
                    {net.explorerUrl && (
                      <a
                        href={net.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1"
                        style={{ color: 'var(--arc-blue)' }}
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Contract info */}
      <div className="arc-card rounded-2xl p-5">
        <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
          {lang === 'tr' ? 'Kontrat Bilgisi' : 'Contract Information'}
        </p>
        <div className="space-y-2 text-xs" style={{ color: 'var(--muted)' }}>
          <p>{lang === 'tr' ? 'Kontrat Adı:' : 'Contract Name:'} <span style={{ color: 'var(--ink-2)' }}>SplitPay</span></p>
          <p>{lang === 'tr' ? 'Derleyici:' : 'Compiler:'} <span style={{ color: 'var(--ink-2)' }}>Solidity 0.8.28, Paris EVM</span></p>
          <p>{lang === 'tr' ? 'Denetim:' : 'Audit:'} <span style={{ color: 'var(--ink-2)' }}>{lang === 'tr' ? 'Dengeli güvenlik denetimi — 0 Yüksek/Orta bulgu' : 'Balanced security review — 0 High/Medium findings'}</span></p>
          <p>{lang === 'tr' ? 'Testler:' : 'Tests:'} <span style={{ color: 'var(--success)' }}>42 / 42 geçti</span></p>
          <p>{lang === 'tr' ? 'Sahip:' : 'Owner:'} <span style={{ color: 'var(--ink-2)' }}>{lang === 'tr' ? 'Yok (izin verilmez)' : 'None (permissionless)'}</span></p>
          <p>{lang === 'tr' ? 'Yükseltilebilir:' : 'Upgradeable:'} <span style={{ color: 'var(--ink-2)' }}>{lang === 'tr' ? 'Hayır' : 'No'}</span></p>
        </div>
      </div>

      {/* Disclaimer */}
      <div
        className="rounded-2xl p-4 text-xs"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--subtle)', lineHeight: '1.7' }}
      >
        <strong style={{ color: 'var(--muted)' }}>{BRAND.name}</strong>{' '}
        {lang === 'tr'
          ? `${BRAND.domain} adresinde yayınlanmaktadır (alan adı doğrulama bekleniyor). Arc veya Circle ile resmi bağlantısı bulunmamaktadır. Bu bir beta uygulamasıdır — gerçek fonlarla kullanmayın. Marka adı, alan adı ve ticari marka henüz teyit edilmemiştir.`
          : `is published at ${BRAND.domain} (domain pending verification). No official affiliation with Arc or Circle. This is a beta application — do not use with real funds. Brand name, domain, and trademark are not yet confirmed.`}
      </div>
    </div>
  )
}
