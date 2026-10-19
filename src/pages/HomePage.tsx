import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ShieldCheck, Lock, PenLine, Undo2, PauseCircle, FlaskConical } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { PARCPAY_ADDRESS } from '@/contracts/parcpay'
import { addressUrl, NETWORK_LABEL } from '@/chain'

function HeroReceipt() {
  const T = useT()
  const lines: [string, string, string][] = [
    ['Ayşe · tasarım', '0x7a1c…41e2', '500,00'],
    ['Deniz · yazılım', '0x3be0…9d07', '300,00'],
    ['Stüdyo kasası', '0xc0de…77a1', '200,00'],
  ]
  return (
    <div className="receipt p-5 sm:p-6 w-full max-w-md mx-auto lg:mx-0" aria-label={T('Örnek bölünmüş ödeme makbuzu', 'Sample split payment receipt')}>
      <div className="flex items-center justify-between small faint">
        <span>{T('Fatura', 'Invoice')} #2026-118</span>
        <span>{NETWORK_LABEL}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="muted">{T('Toplam', 'Total')}</span>
        <span className="num h-display" style={{ fontSize: '2.2rem' }}>1.000,00 <span style={{ fontSize: '1rem', fontWeight: 600 }}>USDC</span></span>
      </div>
      <hr className="rule-dash my-4" />
      <ul className="space-y-3 m-0 p-0 list-none">
        {lines.map(([who, addr, amt], i) => (
          <li key={addr} className="split-line flex items-center justify-between gap-3" style={{ animationDelay: `${0.35 + i * 0.22}s` }}>
            <span className="min-w-0">
              <span className="block font-semibold truncate">{who}</span>
              <span className="block small faint num">{addr}</span>
            </span>
            <span className="num font-semibold">{amt}</span>
          </li>
        ))}
        <li className="split-line flex items-center justify-between gap-3 small" style={{ animationDelay: '1.05s' }}>
          <span className="muted">{T('ParcPay ücreti (sabit)', 'ParcPay fee (flat)')}</span>
          <span className="num muted">0,001</span>
        </li>
      </ul>
      <hr className="rule-dash my-4" />
      <div className="flex items-center justify-between">
        <span className="small muted">{T('1 işlem · 1 imza', '1 transaction · 1 signature')}</span>
        <span className="stamp pill pill-green" style={{ animationDelay: '1.45s', fontSize: '0.85rem' }}>
          ✓ {T('Kesinleşti', 'Settled')}
        </span>
      </div>
    </div>
  )
}

type Slide = { tag: string; title: string; body: string; rows: [string, string][]; foot: string }

function Slides() {
  const T = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  const slides: Slide[] = [
    {
      tag: T('Bölerek gönder', 'Split'),
      title: T('50 alıcıya tek işlemde, 0,001 USDC ücretle', 'Up to 50 recipients in one transaction, 0.001 USDC fee'),
      body: T('Tutarı yüzde ya da kuruşu kuruşuna sabit miktarla dağıt. Ya hepsi gider ya hiçbiri: yarım kalan ödeme yok.', 'Split by percentage or exact amounts. All-or-nothing: no half-finished payouts.'),
      rows: [['3 kurucu ortak', '1.000,00'], ['Ücret', '0,001'], ['İmza', '1']],
      foot: T('Ücret alıcı sayısından bağımsız ve sabit.', 'The fee is flat, whatever the recipient count.'),
    },
    {
      tag: T('İleri tarihli ödeme', 'Scheduled'),
      title: T('Bugün imzala, vadesi gelince ödensin', 'Sign today, it pays on the due date'),
      body: T('Tek bir EIP-712 imzası bir “oturum anahtarı” gibi çalışır: tutar, alıcı, tarih ve süre kilitlidir. Vade gelince alıcı ödemeyi kendisi tetikler; kontrat imzayı zincirde doğrular.', 'One EIP-712 signature acts like a session key: amount, recipients, date and expiry are locked. When due, the recipient triggers it; the contract verifies the signature onchain.'),
      rows: [['Kira · 1 Aralık', '850,00'], ['Kim tetikler', T('alıcı', 'recipient')], ['İptal', T('zincirde, anında', 'onchain, instant')]],
      foot: T('Para vadeye kadar senin cüzdanında kalır.', 'Funds stay in your wallet until the due date.'),
    },
    {
      tag: T('Maaş', 'Payroll'),
      title: T('12 aylık bordro tek imzayla', 'A 12-month payroll in one signature'),
      body: T('Tekrarlayan emir: her 30 günde bir, 12 kez. Çalışan maaşını gün gelince kendisi çeker; kaçırılan dönemler sırayla ödenir.', 'Recurring order: every 30 days, 12 times. Employees pull salary when it is due; missed periods can be caught up in order.'),
      rows: [['4 çalışan × 12 ay', '48 ödeme'], [T('İmza', 'Signatures'), '1'], [T('Toplam ücret', 'Total fees'), '0,012']],
      foot: T('“Tümünü geri al” ile bütün emirler tek işlemde durur.', '“Revoke all” stops every order in one transaction.'),
    },
    {
      tag: T('Fatura', 'Invoices'),
      title: T('Fatura numarası zincire işlenir', 'The invoice number goes onchain'),
      body: T('Her ödemeye 32 baytlık bir not eklenir: fatura no, sipariş no, dönem. Muhasebe, ödeme kaydını explorer’dan bire bir eşler.', 'Every payment carries a 32-byte memo: invoice, order or period. Bookkeeping matches it one-to-one on the explorer.'),
      rows: [['Memo', 'INV-2026-118'], [T('Kanıt', 'Proof'), 'Paid event'], [T('Kesinlik', 'Finality'), T('saniyenin altında', 'sub-second')]],
      foot: T('Abonelik ve taksitler için tekrarlayan emirle birleşir.', 'Combine with recurring orders for subscriptions and instalments.'),
    },
    {
      tag: T('Oyun & NFT', 'Games & NFTs'),
      title: T('Turnuva ödülü ve telif paylaşımı', 'Prize pools and royalty splits'),
      body: T('İlk üçe 50/30/20, koleksiyon satışında sanatçı/geliştirici/topluluk payı. Kazananlar listesi tek işlemde ödenir, herkes kendi payını explorer’da görür.', '50/30/20 for the top three, artist/dev/community shares on a sale. The whole winner list is paid in one transaction, each share visible on the explorer.'),
      rows: [['1.', '500,00'], ['2.', '300,00'], ['3.', '200,00']],
      foot: T('Akıllı cüzdanlarda onay + ödeme tek pencerede.', 'Smart wallets approve and pay in a single prompt.'),
    },
    {
      tag: 'Arc',
      title: T('Gas da USDC, fiyat da USDC', 'Gas in USDC, prices in USDC'),
      body: T('Arc’ta ayrı bir gas token’ı yok: tek bakiye, öngörülebilir ücret, saniyenin altında kesinlik. Kullanıcı yalnızca dolar düşünür.', 'Arc has no separate gas token: one balance, predictable fees, sub-second finality. Users only think in dollars.'),
      rows: [['Gas', 'USDC'], [T('Kesinlik', 'Finality'), '< 1 sn'], ['Token', '0x3600…0000']],
      foot: T('Circle CCTP ile başka zincirlerden USDC getirilebilir.', 'Bring USDC from other chains with Circle CCTP.'),
    },
  ]
  const goTo = (n: number) => {
    const el = ref.current
    if (!el) return
    const k = (n + slides.length) % slides.length
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' })
    setI(k)
  }
  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16" aria-roledescription="carousel" aria-label={T('Kullanım alanları', 'Use cases')}>
      <div className="flex items-end justify-between gap-4 mb-6">
        <h2 className="t-1">{T('Tek kontrat, altı farklı iş', 'One contract, six jobs')}</h2>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(i - 1)} aria-label={T('Önceki', 'Previous')}><ChevronLeft size={18} /></button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(i + 1)} aria-label={T('Sonraki', 'Next')}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div
        ref={ref}
        className="slides panel"
        onScroll={(e) => {
          const el = e.currentTarget
          setI(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {slides.map((s, k) => (
          <article key={k} className="grid md:grid-cols-[1.25fr_1fr] gap-6 md:gap-10 p-6 sm:p-10" aria-label={`${k + 1} / ${slides.length}`}>
            <div>
              <span className="pill pill-blue">{s.tag}</span>
              <h3 className="h-display mt-4" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.5rem)' }}>{s.title}</h3>
              <p className="lead mt-4">{s.body}</p>
            </div>
            <div className="self-center">
              <div className="inset p-4">
                {s.rows.map(([a, b]) => (
                  <div key={a} className="flex justify-between gap-3 py-2" style={{ borderBottom: '1px dashed var(--line-2)' }}>
                    <span className="muted">{a}</span>
                    <span className="num font-semibold">{b}</span>
                  </div>
                ))}
                <p className="small faint mt-3 mb-0">{s.foot}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="flex justify-center gap-2 mt-4" role="tablist">
        {slides.map((s, k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={i === k}
            aria-label={s.tag}
            onClick={() => goTo(k)}
            className="t-2 rounded-full border-0 cursor-pointer"
            style={{ width: i === k ? 28 : 8, background: i === k ? 'var(--spectrum)' : 'var(--line-2)', transition: 'width .2s' }}
          />
        ))}
      </div>
    </section>
  )
}

export function HomePage() {
  const T = useT()
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-16 pb-6 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
        <div>
          <p className="wordmark m-0 mb-5" style={{ fontSize: 'clamp(1.1rem, 1.6vw, 1.3rem)', color: 'var(--ink-2)' }}>
            P<span className="arc-text">ARC</span>Pay · {T('Arc üzerinde USDC ödemeleri', 'USDC payments on Arc')}
          </p>
          <h1 className="h-display m-0" style={{ fontSize: 'clamp(2.7rem, 6.4vw, 5rem)' }}>
            {T('Bir ödeme.', 'One payment.')}<br />
            {T('Elli alıcı.', 'Fifty recipients.')}<br />
            <span className="arc-text">{T('Tek imza.', 'One signature.')}</span>
          </h1>
          <p className="lead mt-5">
            {T(
              'ParcPay, Arc üzerinde USDC’yi kuruşu kuruşuna böler, ileri bir tarihe planlar ve her ay tekrarlar. Ödeme başına sabit 0,001 USDC.',
              'ParcPay splits USDC to the cent, schedules it for a future date and repeats it monthly on Arc. A flat 0.001 USDC per payment.',
            )}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#/send" className="btn btn-arc btn-lg">{T('Ödeme gönder', 'Send a payment')}</a>
            <a href="#/schedule" className="btn btn-ghost btn-lg">{T('Ödeme planla', 'Schedule a payment')}</a>
          </div>
        </div>
        <div className="relative py-6" style={{ overflowX: "clip", overflowY: "visible" }}>
          <svg className="hero-arc" viewBox="0 0 400 200" aria-hidden="true">
            <defs>
              <linearGradient id="hero-g" x1="0" x2="1">
                <stop offset="0" stopColor="#0052ff" />
                <stop offset=".55" stopColor="#7b3fe4" />
                <stop offset="1" stopColor="#00d4c8" />
              </linearGradient>
              <filter id="hero-blur"><feGaussianBlur stdDeviation="6" /></filter>
            </defs>
            <path className="arc-path" pathLength={1} d="M20 200 A180 180 0 0 1 380 200" fill="none" stroke="url(#hero-g)" strokeWidth="14" filter="url(#hero-blur)" opacity=".7" />
            <path className="arc-path" pathLength={1} d="M20 200 A180 180 0 0 1 380 200" fill="none" stroke="url(#hero-g)" strokeWidth="3" />
          </svg>
          <div className="relative"><HeroReceipt /></div>
        </div>
      </section>

      <Slides />

      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="panel p-6 sm:p-8 min-w-0">
            <h2 className="t-2">{T('Kaç imza?', 'How many signatures?')}</h2>
            <ol className="mt-5 space-y-4 p-0 m-0 list-none">
              {[
                [T('İlk ödeme', 'First payment'), T('Onay + gönder: 2 imza. “Sonraki ödemeler için izin ver” seçilirse bütçe bir kez onaylanır.', 'Approve + send: 2 signatures. Pick “allow future payments” to approve a budget once.')],
                [T('Sonraki ödemeler', 'Next payments'), T('Bütçe yettiği sürece 1 imza.', '1 signature while the budget lasts.')],
                [T('Akıllı cüzdan', 'Smart wallet'), T('EIP-5792 destekleyen cüzdanlarda onay ve ödeme tek pencerede.', 'Wallets with EIP-5792 approve and pay in one prompt.')],
                [T('Planlı / maaş', 'Scheduled / payroll'), T('Tek EIP-712 imzası; ödemeleri alıcı ya da bot tetikler.', 'One EIP-712 signature; recipients or a bot trigger the runs.')],
              ].map(([a, b], k) => (
                <li key={k} className="flex gap-3">
                  <span className="step-dot" style={{ background: 'var(--usdc-wash)', color: 'var(--usdc-deep)' }}>{k + 1}</span>
                  <span><b>{a}</b><br /><span className="muted">{b}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel p-6 sm:p-8 min-w-0">
            <h2 className="t-2">{T('Güvenlik', 'Security')}</h2>
            <ul className="mt-5 space-y-3 p-0 m-0 list-none">
              {[
                [Lock, T('Emanet yok: USDC doğrudan senden alıcılara gider, kontratta beklemez.', 'Non-custodial: USDC goes straight from you to recipients.')],
                [ShieldCheck, T('Ücret tavanı: imzaladığın ücretten fazlası asla alınamaz (en fazla 0,10 USDC).', 'Fee ceiling: never more than the fee you signed (hard cap 0.10 USDC).')],
                [PenLine, T('Planlı emirlerde alıcı, tutar ve tarih imzayla kilitli; zincirde doğrulanır.', 'Scheduled orders lock recipients, amounts and dates; verified onchain.')],
                [Undo2, T('Tek emir ya da tüm emirler zincirde iptal edilebilir.', 'Cancel one order or all of them onchain.')],
                [PauseCircle, T('Acil durdurma; yönetici kullanıcı fonlarına dokunamaz.', 'Emergency pause; the owner can never touch user funds.')],
                [FlaskConical, T('37 Foundry testi: fuzz, imza, EIP-1271 akıllı cüzdan, EIP-3009.', '37 Foundry tests: fuzz, signatures, EIP-1271 wallets, EIP-3009.')],
              ].map(([Icon, text], k) => {
                const I = Icon as typeof Lock
                return (
                  <li key={k} className="flex gap-3 items-start">
                    <I size={18} style={{ color: 'var(--settle)', marginTop: 3, flexShrink: 0 }} />
                    <span className="muted">{text as string}</span>
                  </li>
                )
              })}
            </ul>
            <a className="small mt-5 inline-block num break-all" href={addressUrl(PARCPAY_ADDRESS)} target="_blank" rel="noreferrer">
              {T('Kontrat', 'Contract')}: {PARCPAY_ADDRESS}
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
