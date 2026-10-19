import { useLang } from '@/context/LangContext'
import { TokenUSDC } from '@web3icons/react'
import { ShieldCheck, Zap, Users, Clock, Code2 } from 'lucide-react'

const CONTRACT_ADDRESS = '0x9692f54be2921ce00a02de9ee97bfb06469c6167'
// Arc Testnet deployment pending; ETH Sepolia is active

export function AboutPage() {
  const { t } = useLang()

  const whyItems = [
    t('about.why.1'),
    t('about.why.2'),
    t('about.why.3'),
    t('about.why.4'),
    t('about.why.5'),
  ]

  return (
    <div className="space-y-4 pb-20">
      {/* Hero */}
      <div
        className="rounded-3xl p-6 text-center overflow-hidden relative"
        style={{ background: 'var(--arc-gradient)', boxShadow: '0 4px 40px rgba(0,82,255,0.25)' }}
      >
        {/* Background glow orbs */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 60% at 20% 40%, rgba(123,63,228,0.40) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 80% 60%, rgba(0,212,200,0.20) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10">
          <div className="flex justify-center mb-3">
            <div className="size-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <TokenUSDC variant="branded" size={32} />
            </div>
          </div>
          <h1 className="display text-2xl font-bold text-white mb-2">{t('about.title')}</h1>
          <p className="text-white/80 text-sm max-w-xs mx-auto">{t('about.subtitle')}</p>
        </div>
      </div>

      {/* What it does */}
      <Section icon={<Zap className="size-4" />} title={t('about.what.title')} accent="blue">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t('about.what.body')}
        </p>
      </Section>

      {/* Use cases */}
      <Section icon={<Users className="size-4" />} title={t('about.why.title')} accent="purple">
        <ul className="space-y-2">
          {whyItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--ink-2)' }}>
              <span
                className="flex-shrink-0 size-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                style={{ background: 'rgba(0,82,255,0.15)', color: 'var(--arc-blue)' }}
              >
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Section>

      {/* Technical */}
      <Section icon={<Code2 className="size-4" />} title={t('about.how.title')} accent="teal">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t('about.how.body')}
        </p>
      </Section>

      {/* Security */}
      <Section icon={<ShieldCheck className="size-4" />} title={t('about.security.title')} accent="green">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t('about.security.body')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { n: '42', label: 'Unit Tests' },
            { n: '0', label: 'High/Medium' },
            { n: '2', label: 'Audit Rounds' },
            { n: '∞', label: 'Revert Safety' },
          ].map(({ n, label }) => (
            <div
              key={label}
              className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(0,196,140,0.08)', border: '1px solid rgba(0,196,140,0.15)' }}
            >
              <p className="display text-2xl font-bold" style={{ color: 'var(--success)' }}>{n}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Scheduled payments */}
      <Section icon={<Clock className="size-4" />} title={t('about.scheduled.title')} accent="purple">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {t('about.scheduled.body')}
        </p>
      </Section>

      {/* Contract info */}
      <div
        className="arc-card rounded-2xl p-4"
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          {t('about.contract.title')}
        </p>
        <table className="w-full text-xs" style={{ color: 'var(--ink-2)' }}>
          <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
            <InfoRow label="ETH Sepolia" value={CONTRACT_ADDRESS} mono explorer={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} />
            <InfoRow label="Arc Testnet" value="Pending deploy" />
            <InfoRow label="Solidity" value="0.8.28 / Paris EVM" />
            <InfoRow label="USDC (ETH Sepolia)" value="0x1c7D4B19…379C7238" mono />
            <InfoRow label="USDC (Arc Testnet)" value="0x36000000…00000000" mono />
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode
  title: string
  accent: 'blue' | 'purple' | 'teal' | 'green'
  children: React.ReactNode
}) {
  const colors = {
    blue: { bg: 'rgba(0,82,255,0.10)', border: 'rgba(0,82,255,0.18)', text: 'var(--arc-blue)' },
    purple: { bg: 'rgba(123,63,228,0.10)', border: 'rgba(123,63,228,0.18)', text: 'var(--arc-purple)' },
    teal: { bg: 'rgba(0,212,200,0.10)', border: 'rgba(0,212,200,0.18)', text: 'var(--arc-teal)' },
    green: { bg: 'rgba(0,196,140,0.10)', border: 'rgba(0,196,140,0.18)', text: 'var(--success)' },
  }[accent]

  return (
    <div
      className="arc-card rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="size-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
        >
          {icon}
        </div>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  explorer,
}: {
  label: string
  value: string
  mono?: boolean
  explorer?: string
}) {
  return (
    <tr>
      <td className="py-2 pr-4 font-medium" style={{ color: 'var(--muted)', width: '40%' }}>{label}</td>
      <td className="py-2" style={{ color: 'var(--ink-2)' }}>
        {explorer ? (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer"
            className={`underline hover:no-underline break-all${mono ? ' mono' : ''}`}
            style={{ color: 'var(--arc-blue)' }}
          >
            {value}
          </a>
        ) : (
          <span className={`break-all${mono ? ' mono' : ''}`}>{value}</span>
        )}
      </td>
    </tr>
  )
}
