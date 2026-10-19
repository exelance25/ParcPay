/**
 * PermissionsPage — honest Subkey capabilities display.
 *
 * This page clearly distinguishes:
 * - Off-chain only restrictions (enforced in browser, not by contract)
 * - Planned onchain enforcement (requires contract upgrade)
 *
 * NEVER implies onchain enforcement that doesn't exist.
 * NEVER stores seed phrases or unrestricted private keys.
 */
import { useState } from 'react'
import { Shield, AlertTriangle, CheckCircle2, Clock, Ban, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useLang } from '@/context/LangContext'

interface PermissionRow {
  id: string
  label: string
  labelTr: string
  desc: string
  descTr: string
  enforced: 'offchain' | 'onchain-planned' | 'none'
}

const PERMISSION_ROWS: PermissionRow[] = [
  {
    id: 'contract',
    label: 'Allowed Contract',
    labelTr: 'İzin Verilen Kontrat',
    desc: 'The signature binds to a specific contract address. Enforced in the EIP-712 domain field.',
    descTr: 'İmza belirli bir kontrat adresine bağlıdır. EIP-712 alan tanımında zorunlu tutulur.',
    enforced: 'offchain',
  },
  {
    id: 'chain',
    label: 'Chain ID',
    labelTr: 'Zincir ID',
    desc: 'Signature includes the chain ID. A signature for Arc Testnet is invalid on any other chain.',
    descTr: 'İmza zincir ID\'sini içerir. Arc Testnet imzası başka bir zincirde geçersizdir.',
    enforced: 'offchain',
  },
  {
    id: 'maxAmount',
    label: 'Maximum Amount',
    labelTr: 'Maksimum Tutar',
    desc: 'Max USDC per execution is recorded in the signed message. The browser checks this before executing. The current contract does NOT verify the signature onchain.',
    descTr: 'Maksimum USDC tutarı imzalı mesaja kaydedilir. Tarayıcı çalıştırma öncesi kontrol eder. Mevcut kontrat bu imzayı onchain doğrulamamaktadır.',
    enforced: 'offchain',
  },
  {
    id: 'recipients',
    label: 'Recipient List',
    labelTr: 'Alıcı Listesi',
    desc: 'The exact recipients and shares are embedded in the EIP-712 message. Off-chain only for now.',
    descTr: 'Alıcılar ve paylar EIP-712 mesajına gömülür. Şu an için yalnızca off-chain.',
    enforced: 'offchain',
  },
  {
    id: 'executeAfter',
    label: 'Earliest Execution Time',
    labelTr: 'En Erken Çalıştırma Zamanı',
    desc: 'The browser will not call splitPay() before this timestamp. Not enforced by the current contract.',
    descTr: 'Tarayıcı bu zaman damgasından önce splitPay() çağırmaz. Mevcut kontrat tarafından zorunlu kılınmaz.',
    enforced: 'offchain',
  },
  {
    id: 'expiry',
    label: 'Expiry Time',
    labelTr: 'Son Geçerlilik Zamanı',
    desc: 'The browser will not execute after this timestamp. Not enforced by the current contract.',
    descTr: 'Tarayıcı bu zaman damgasından sonra çalıştırmaz. Mevcut kontrat tarafından zorunlu kılınmaz.',
    enforced: 'offchain',
  },
  {
    id: 'nonce',
    label: 'Nonce (Replay Protection)',
    labelTr: 'Nonce (Tekrar Koruması)',
    desc: 'Nonce is included in the signed message. The current contract does NOT store used nonces — replay protection is off-chain only. A contract upgrade would add onchain nonce storage.',
    descTr: 'Nonce imzalı mesaja dahildir. Mevcut kontrat kullanılmış nonce\'ları saklamamaktadır — tekrar koruması yalnızca off-chain. Kontrat yükseltmesi onchain nonce depolaması ekleyecektir.',
    enforced: 'offchain',
  },
  {
    id: 'revocation',
    label: 'Revocation',
    labelTr: 'İptal',
    desc: 'Off-chain only — the browser deletes the stored signature. There is no onchain revoke mechanism. A determined attacker with the signature could replay it until expiry.',
    descTr: 'Yalnızca off-chain — tarayıcı saklanan imzayı siler. Onchain iptal mekanizması yoktur. İmzaya sahip kararlı bir saldırgan sona erişe kadar tekrar oynayabilir.',
    enforced: 'offchain',
  },
  {
    id: 'spending-limit',
    label: 'Cumulative Spending Limit',
    labelTr: 'Kümülatif Harcama Limiti',
    desc: 'Not implemented. Would require onchain accounting per signer.',
    descTr: 'Uygulanmadı. İmzalayan başına onchain muhasebe gerektirirdi.',
    enforced: 'none',
  },
  {
    id: 'auto-execute',
    label: 'Automatic Execution',
    labelTr: 'Otomatik Çalıştırma',
    desc: 'Not supported. Scheduled payments require the user to click "Execute Now" when the time arrives. There is no keeper, relayer, or automation service.',
    descTr: 'Desteklenmemektedir. Zamanlanmış ödemeler, kullanıcının zamanı gelince "Şimdi Çalıştır"a tıklamasını gerektirir. Keeper, relayer veya otomasyon servisi yoktur.',
    enforced: 'none',
  },
]

const BADGE = {
  offchain: { label: 'Off-chain only', labelTr: 'Yalnızca off-chain', color: '#EAB308', bg: 'rgba(234,179,8,0.10)', icon: AlertTriangle },
  'onchain-planned': { label: 'Onchain (planned)', labelTr: 'Onchain (planlandı)', color: 'var(--arc-blue)', bg: 'rgba(0,82,255,0.10)', icon: Clock },
  none: { label: 'Not implemented', labelTr: 'Uygulanmadı', color: 'var(--muted)', bg: 'rgba(107,122,153,0.10)', icon: Ban },
}

export function PermissionsPage() {
  const { lang } = useLang()
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          {lang === 'tr' ? 'Subkey İzinleri' : 'Subkey Permissions'}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          {lang === 'tr'
            ? 'Bu sayfa Subkey\'in gerçek kapasitesini gösterir. Abartılı iddialar yoktur.'
            : "This page shows Subkey's actual capabilities. No exaggerated claims."}
        </p>
      </div>

      {/* Architecture notice */}
      <div
        className="rounded-2xl p-4 flex gap-3"
        style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.20)' }}
      >
        <AlertTriangle className="size-5 flex-shrink-0 mt-0.5" style={{ color: '#EAB308' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: '#EAB308' }}>
            {lang === 'tr' ? 'Beta — Off-Chain İmza Modeli' : 'Beta — Off-Chain Signature Model'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-2)' }}>
            {lang === 'tr'
              ? 'Mevcut SplitPay kontratı EIP-712 imzalarını onchain doğrulamamaktadır. İmzalı emirler tarayıcıda saklanır ve zaman/tutar kısıtlamaları yalnızca tarayıcı tarafından kontrol edilir. Tam onchain zorunlu kılım için kontrat yükseltmesi gerekmektedir.'
              : 'The current SplitPay contract does not verify EIP-712 signatures onchain. Signed orders are stored in the browser and time/amount restrictions are enforced by the browser only. A contract upgrade is required for full onchain enforcement.'}
          </p>
        </div>
      </div>

      {/* Permission rows */}
      <div className="space-y-2">
        {PERMISSION_ROWS.map((row) => {
          const badge = BADGE[row.enforced]
          const BadgeIcon = badge.icon
          const isOpen = expanded === row.id

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setExpanded(isOpen ? null : row.id)}
              className="w-full arc-card rounded-2xl px-4 py-3 text-left transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {row.enforced === 'offchain' || row.enforced === 'onchain-planned'
                    ? <CheckCircle2 className="size-4 flex-shrink-0" style={{ color: row.enforced === 'offchain' ? '#EAB308' : 'var(--arc-blue)' }} />
                    : <Ban className="size-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
                  }
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                    {lang === 'tr' ? row.labelTr : row.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    <BadgeIcon className="size-3" />
                    {lang === 'tr' ? badge.labelTr : badge.label}
                  </span>
                  {isOpen ? <ChevronUp className="size-3.5" style={{ color: 'var(--muted)' }} /> : <ChevronDown className="size-3.5" style={{ color: 'var(--muted)' }} />}
                </div>
              </div>
              {isOpen && (
                <p className="mt-2 text-xs text-left" style={{ color: 'var(--ink-2)', lineHeight: '1.6' }}>
                  {lang === 'tr' ? row.descTr : row.desc}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* Roadmap */}
      <div
        className="arc-card rounded-2xl p-4"
        style={{ border: '1px solid rgba(0,82,255,0.15)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Info className="size-4" style={{ color: 'var(--arc-blue)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {lang === 'tr' ? 'Onchain Zorunlu Kılım Yol Haritası' : 'Onchain Enforcement Roadmap'}
          </p>
        </div>
        <ul className="space-y-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
          {[
            lang === 'tr' ? 'ScheduledSplitPay.sol: ecrecover ile EIP-712 imza doğrulama' : 'ScheduledSplitPay.sol: EIP-712 signature verification via ecrecover',
            lang === 'tr' ? 'Onchain nonce kaydı: tekrar oynatma koruması' : 'Onchain nonce registry: replay protection',
            lang === 'tr' ? 'Onchain iptal: imzalayan nonce\'u geçersiz kılabilir' : 'Onchain revocation: signer can invalidate a nonce',
            lang === 'tr' ? 'Keeper entegrasyonu (araştırılıyor): otomatik çalıştırma' : 'Keeper integration (researching): automatic execution',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span style={{ color: 'var(--arc-purple)' }}>→</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Security principles */}
      <div
        className="arc-card rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Shield className="size-4" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {lang === 'tr' ? 'Güvenlik Prensipleri' : 'Security Principles'}
          </p>
        </div>
        <ul className="space-y-2 text-xs" style={{ color: 'var(--ink-2)' }}>
          {(lang === 'tr' ? [
            'Tohum cümlesi veya kısıtlanmamış özel anahtar asla istenmez veya saklanmaz.',
            'İmzalar yalnızca belirli bir kontrat, zincir, alıcılar ve tutarla sınırlıdır.',
            'Yetkilendirme açıkça kullanıcı tarafından onaylanır — otomatik imzalama yoktur.',
            'Tüm imza verisi tarayıcı LocalStorage\'da saklanır — hiçbir şey sunucuya gönderilmez.',
            'İmza değerleri asla loglanmaz veya konsola yazdırılmaz.',
          ] : [
            'Seed phrases and unrestricted private keys are never requested or stored.',
            'Signatures are scoped to a specific contract, chain, recipients, and amount.',
            'Authorization is explicitly approved by the user — no autonomous signing.',
            'All signature data is stored in browser localStorage — nothing is sent to any server.',
            'Signature values are never logged or printed to the console.',
          ]).map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 className="size-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
