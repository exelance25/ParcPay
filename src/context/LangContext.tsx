import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'tr' | 'en'

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const LangContext = createContext<LangCtx>({
  lang: 'tr',
  setLang: () => {},
  t: (k) => k,
})

// ── Translations ────────────────────────────────────────────────────────────
const STRINGS: Record<Lang, Record<string, string>> = {
  tr: {
    // Nav
    'nav.overview': 'Genel Bakış',
    'nav.split': 'Böl',
    'nav.app': 'Uygulama',
    'nav.about': 'Hakkında',
    'nav.scheduled': 'Zamanlanmış',
    'nav.requests': 'İstekler',
    'nav.activity': 'İşlemler',
    'nav.permissions': 'İzinler',
    'nav.settings': 'Ayarlar',

    // Header subtitle
    'header.subtitle': 'Tek ödeme. Birden fazla alıcı.',

    // Main page
    'app.wrongNetwork': 'Arc Testnet ağına geçmeniz gerekiyor.',
    'app.switch': 'Geç',
    'app.switching': 'Geçiliyor…',
    'app.notDeployed.title': 'Kontrat henüz deploy edilmedi',
    'app.notDeployed.body': 'Arc Studio\'ya "SplitPay kontratını deploy et" yazın, adres otomatik eklenir.',

    'amount.label': 'Toplam Tutar',
    'amount.placeholder': '0.00',
    'amount.balance': 'Bakiye',
    'amount.max': 'Tümü',

    'recipients.title': 'Alıcılar',
    'recipients.add': '+ Alıcı Ekle',
    'recipients.address': 'Cüzdan Adresi',
    'recipients.percent': 'Pay %',
    'recipients.fill': 'Kalan',
    'recipients.remove': 'Kaldır',
    'recipients.error.zero': 'Adres gerekli',
    'recipients.error.invalid': 'Geçersiz adres',
    'recipients.error.duplicate': 'Tekrarlanan adres',
    'recipients.error.zeroPct': 'Pay > 0 olmalı',
    'recipients.max': 'Maksimum 10 alıcı',

    'preview.title': 'Dağılım Önizlemesi',
    'preview.each': 'alacak',
    'preview.total': 'Toplam',
    'preview.remainder': '(küsurat son alıcıya)',
    'preview.error': 'Hata',

    'cta.connect': 'Cüzdan Bağla',
    'cta.switch': 'Arc Testnet\'e Geç',
    'cta.approving': 'Cüzdanda onayla…',
    'cta.approveConfirming': 'Onay bekleniyor…',
    'cta.splitting': 'Ödemeyi onayla…',
    'cta.splitConfirming': 'Ödeme onaylanıyor…',
    'cta.send': 'Bölünmüş Ödeme Gönder',

    'tx.approving': 'USDC harcama onayı bekleniyor…',
    'tx.approveConfirming': 'Onay zincirde işleniyor…',
    'tx.splitting': 'Ödeme dağıtımı bekleniyor…',
    'tx.splitConfirming': 'Ödeme zincirde işleniyor…',
    'tx.success': 'Ödeme başarıyla dağıtıldı',
    'tx.error': 'İşlem başarısız',
    'tx.explorer': 'Explorer\'da görüntüle ↗',
    'tx.tryAgain': 'Tekrar Dene',
    'tx.newPayment': 'Yeni Ödeme',
    'tx.total': 'Toplam',

    'howItWorks.title': 'Nasıl Çalışır',
    'howItWorks.1': 'Toplam USDC tutarını girin.',
    'howItWorks.2': 'Her alıcının cüzdan adresini ve yüzde payını ekleyin (toplam %100 olmalı).',
    'howItWorks.3': 'Önizleme, her alıcının zincirde alacağı tam tutarı gösterir.',
    'howItWorks.4': 'USDC harcama iznini onaylayın (tam tutar), ardından ödemeyi onaylayın.',
    'howItWorks.5': 'Tüm transferler atomik olarak gerçekleşir — ya hepsi başarılı olur ya da tamamen geri alınır.',
    'howItWorks.usdc': 'Test USDC almak için Arc Studio kenar çubuğundaki <strong>Test USDC Al</strong> butonunu kullanın.',

    'footer.network': 'Arc Testnet',
    'footer.contract': 'kontrat ↗',

    // About page
    'about.title': 'Arc SplitPay Nedir?',
    'about.subtitle': 'Tek işlemde birden fazla alıcıya USDC ödemesi dağıtın.',
    'about.what.title': 'Ne Yapar?',
    'about.what.body': 'Arc SplitPay, bir ödeyicinin belirli bir USDC tutarını birden fazla alıcıya tek bir blokzincir işlemiyle dağıtmasını sağlar. Ödeme ya tamamen başarılı olur ya da hiç gerçekleşmez — kısmi dağılım yoktur.',
    'about.why.title': 'Neden Kullanmalısınız?',
    'about.why.1': 'Serbest çalışan ekiplerde proje ödemelerini otomatik böl',
    'about.why.2': 'Gelir paylaşımı düzenlemelerini anında uygula',
    'about.why.3': 'DAO hazinelerinden çoklu alıcıya ödeme',
    'about.why.4': 'Fatura ödemelerinde birden fazla tarafı tek işlemde öde',
    'about.why.5': 'Ortaklık kârını şeffaf ve doğrulanabilir şekilde dağıt',
    'about.how.title': 'Teknik Detaylar',
    'about.how.body': 'Uygulama, Arc Testnet üzerinde çalışan bir Solidity akıllı kontratı kullanır. Kontrat, "baz puan" sistemi ile payları hesaplar (10.000 baz puan = %100). OpenZeppelin SafeERC20 ile güvenli token transferleri sağlanır. Yeniden giriş (reentrancy) koruması mevcuttur. Herhangi bir sahip, yönetici veya gizli ücret yoktur.',
    'about.security.title': 'Güvenlik',
    'about.security.body': 'Kontrat bağımsız güvenlik denetiminden geçmiştir. Tüm dağılım hesaplamaları zincir üzerinde doğrulanır. USDC yalnızca tek bir işlem süresince kontratta tutulur. 42 birim testi başarıyla geçmiştir.',
    'about.scheduled.title': 'Zamanlanmış Ödemeler (Subkey)',
    'about.scheduled.body': 'Gelecekteki bir tarihe, maksimum tutara ve belirli alıcılara bağlı ödeme emirleri oluşturun. Subkey özelliği ile imzalı bir yetki oluşturur, istediğiniz zaman çalıştırabilir ya da iptal edebilirsiniz.',
    'about.contract.title': 'Kontrat Bilgisi',

    // About page — expanded sections
    'about.mission.title': 'Misyon',
    'about.mission.body': 'ParcPay, Arc üzerinde USDC ödemelerini programlanabilir hale getirmek için tasarlanmış bağımsız bir açık kaynak uygulamasıdır. Birden fazla alıcıya bölünmüş ödemeler, zincir üzerinde doğrulanabilir dağıtım ve desteklenen zamanlanmış ödeme iş akışları sunar.',

    'about.disclaimer.title': 'Yasal Uyarı',
    'about.disclaimer.body': 'ParcPay, Arc veya Circle\'ın resmi ürünü değildir. Arc Testnet üzerinde çalışır ve gerçek varlıklar içermez. Blok zinciri işlemleri geri alınamaz olabilir. Bu uygulama bir güvenlik denetiminden geçmiştir ancak herhangi bir güvenlik garantisi verilmemektedir. Gerçek fonlarla kullanmadan önce bağımsız bir inceleme yapın.',
    'about.disclaimer.audit': 'Bağımsız güvenlik incelemesi: 2 tur, 0 yüksek/orta düzey bulgu. Bu, üretim ortamında kullanıma hazır olduğu veya açık kalmayan güvenlik açığı olmadığı anlamına gelmez.',
    'about.disclaimer.irreversible': 'Gerçek bir ağdaki işlemler geri alınamaz. Kontrat adreslerini, alıcı adreslerini ve ağ ayarlarını göndermeden önce her zaman doğrulayın.',

    'about.usecases.title': 'Kullanım Senaryoları',
    'about.usecases.freelance.title': 'Serbest Çalışan Ekipler',
    'about.usecases.freelance.body': 'Bir müşteri ödemesini tasarımcı, geliştirici ve proje yöneticisi arasında önceden belirlenen yüzdelerle tek işlemde dağıtın.',
    'about.usecases.gaming.title': 'Oyun Ödülleri',
    'about.usecases.gaming.body': 'Turnuva ödüllerini birden fazla kazanana önceden tanımlı sıralama ödülleri olarak dağıtın — tek kontrat çağrısıyla.',
    'about.usecases.creator.title': 'NFT & Yaratıcı Gelir',
    'about.usecases.creator.body': 'İşbirliği yapılan eserlerde telif gelirini yaratıcı, yapımcı ve platform cüzdanları arasında her satışta otomatik olarak bölün.',
    'about.usecases.agent.title': 'Yapay Zeka Ajan Ödemeleri',
    'about.usecases.agent.body': 'Programlanabilir ödeme kısıtlamaları ile ajan cüzdanlarına hizmet, alt ajan ve operasyon giderleri için belirlenmiş harcama sınırları dahilinde ödeme yapın.',

    'about.subkey.title': 'Subkey Entegrasyonu',
    'about.subkey.real': 'Mevcut durum: EIP-712 off-chain imzası. İmzanız; izin verilen kontrat, maksimum tutar, alıcılar ve tarih aralığını kısıtlar. Kısıtlamalar şu an yalnızca uygulama katmanında uygulanmaktadır.',
    'about.subkey.onchain': 'Zincir üzeri kısıtlama zorunluluğu (zincir üzerinde doğrulama, harcama limiti takibi): Geliştirme aşamasında.',
    'about.subkey.neverStores': 'Seed phrase veya kısıtlanmamış özel anahtar asla istenmez veya saklanmaz.',

    'about.fees.title': 'Ücret Modeli',
    'about.fees.current': 'Mevcut durum: MVP sürümünde platform ücreti yoktur.',
    'about.fees.future': 'Değerlendirilen gelecek seçenekler (henüz etkinleştirilmedi):',
    'about.fees.option1': 'İşlem başına isteğe bağlı platform ücreti (örn. %0,10)',
    'about.fees.option2': 'Yüksek hacimli ekipler için iş abonelikleri',
    'about.fees.option3': 'Geliştirici API / white-label entegrasyon ücreti',
    'about.fees.distinction': 'Ağ gaz ücretleri ParcPay geliriyle ilgisizdir. Gaz ücretleri doğrudan Arc doğrulayıcılarına gider.',
    'about.fees.projection.title': 'Varsayımsal Hacim Projeksiyonu (%0,10 ücretle)',
    'about.fees.projection.disclaimer': 'Bunlar gerçek gelir rakamları değil, yalnızca varsayımsal örneklerdir. Gerçek sonuçlar benimseme oranına, maliyetlere, vergi yükümlülüklerine ve diğer faktörlere bağlıdır.',

    'about.howtech.title': 'Teknik Mimari',
    'about.howtech.wallet': 'Cüzdan İmzası: İşlemler asla sizin adınıza imzalanmaz. Her adımda cüzdanınız (MetaMask vb.) onayınızı ister.',
    'about.howtech.usdc': 'USDC: Circle\'ın Arc Testnet\'te yerel olarak desteklenen sabit coindir. Kontrat, ondalık sayı için doğrudan token\'ı sorgular.',
    'about.howtech.arc': 'Arc: Ethereum uyumlu bir blok zinciridir. Gas ücreti USDC cinsinden ödenir. ParcPay, Arc\'ın resmi ürünü değildir.',
    'about.howtech.contract': 'Akıllı Kontrat: Atomik dağıtım; ya tüm transferler başarılı olur ya da tamamı geri alınır. Sahip, yönetici veya gizli ücret yoktur.',
    'about.howtech.subkey': 'Subkey İzinleri: EIP-712 tipli veri imzası. Kısıtlamalar uygulama katmanında uygulanır. Zincir üzeri zorunluluk geliştirilmektedir.',

    // Scheduled page

    'sched.title': 'Zamanlanmış Ödeme',
    'sched.subtitle': 'İleri tarihli bir ödeme emri oluştur ve imzala.',
    'sched.orderTitle': 'Emir Detayları',
    'sched.amount': 'Maksimum Tutar (USDC)',
    'sched.executeAfter': 'En Erken Çalıştırma Tarihi',
    'sched.expiry': 'Son Geçerlilik Tarihi',
    'sched.nonce': 'Nonce (tekrar koruması)',
    'sched.recipients': 'Alıcılar ve Paylar',
    'sched.sign': 'Emri İmzala (EIP-712)',
    'sched.signing': 'İmzalanıyor…',
    'sched.signed': 'Emir İmzalandı',
    'sched.execute': 'Şimdi Çalıştır',
    'sched.executing': 'Çalıştırılıyor…',
    'sched.cancel': 'Emri İptal Et',
    'sched.cancelling': 'İptal Ediliyor…',
    'sched.cancelled': 'Emir İptal Edildi',
    'sched.tooEarly': 'Henüz çalıştırma zamanı gelmedi.',
    'sched.expired': 'Emir süresi dolmuş.',
    'sched.info.title': 'Subkey Nedir?',
    'sched.info.body': 'Bir ödeme emrini şimdi imzalar, ileride çalıştırırsınız. İmzanız şunları kısıtlar: izin verilen kontrat, maksimum tutar, alıcılar, en erken ve en geç tarih. İstediğiniz zaman iptal edebilirsiniz.',
    'sched.copy': 'İmzayı Kopyala',
    'sched.copied': 'Kopyalandı!',
    'sched.warning': 'Bu özellik beta aşamasındadır. Gerçek fonlarla kullanmayın.',
    'sched.orderId': 'Emir ID',
    'sched.status': 'Durum',
    'sched.status.pending': 'Beklemede',
    'sched.status.ready': 'Çalıştırılabilir',
    'sched.status.executed': 'Çalıştırıldı',
    'sched.status.cancelled': 'İptal edildi',
    'sched.status.expired': 'Süresi doldu',
    'sched.noOrders': 'Henüz emir yok.',
    'sched.newOrder': 'Yeni Emir',
    'sched.myOrders': 'Emirlerim',
    'sched.executeAfterLabel': 'En erken:',
    'sched.expiryLabel': 'Son tarih:',
    'sched.maxLabel': 'Maks:',
  },
  en: {
    // Nav
    'nav.overview': 'Overview',
    'nav.split': 'Split',
    'nav.app': 'App',
    'nav.about': 'About',
    'nav.scheduled': 'Schedule',
    'nav.requests': 'Requests',
    'nav.activity': 'Activity',
    'nav.permissions': 'Permissions',
    'nav.settings': 'Settings',

    // Header subtitle
    'header.subtitle': 'One payment. Multiple recipients.',

    // Main page
    'app.wrongNetwork': 'Please switch to Arc Testnet.',
    'app.switch': 'Switch',
    'app.switching': 'Switching…',
    'app.notDeployed.title': 'Contract not yet deployed',
    'app.notDeployed.body': 'Ask Arc Studio to "deploy the SplitPay contract" and the address will be wired in.',

    'amount.label': 'Total Amount',
    'amount.placeholder': '0.00',
    'amount.balance': 'Balance',
    'amount.max': 'Max',

    'recipients.title': 'Recipients',
    'recipients.add': '+ Add Recipient',
    'recipients.address': 'Wallet Address',
    'recipients.percent': 'Share %',
    'recipients.fill': 'Fill',
    'recipients.remove': 'Remove',
    'recipients.error.zero': 'Address required',
    'recipients.error.invalid': 'Invalid address',
    'recipients.error.duplicate': 'Duplicate address',
    'recipients.error.zeroPct': 'Share must be > 0',
    'recipients.max': 'Maximum 10 recipients',

    'preview.title': 'Distribution Preview',
    'preview.each': 'receives',
    'preview.total': 'Total',
    'preview.remainder': '(remainder to last)',
    'preview.error': 'Error',

    'cta.connect': 'Connect Wallet',
    'cta.switch': 'Switch to Arc Testnet',
    'cta.approving': 'Confirm approval in wallet…',
    'cta.approveConfirming': 'Approval confirming…',
    'cta.splitting': 'Confirm payment in wallet…',
    'cta.splitConfirming': 'Payment confirming…',
    'cta.send': 'Send Split Payment',

    'tx.approving': 'Waiting for USDC approval…',
    'tx.approveConfirming': 'Approval confirming onchain…',
    'tx.splitting': 'Waiting for payment distribution…',
    'tx.splitConfirming': 'Payment confirming onchain…',
    'tx.success': 'Payment successfully distributed',
    'tx.error': 'Transaction failed',
    'tx.explorer': 'View on Explorer ↗',
    'tx.tryAgain': 'Try Again',
    'tx.newPayment': 'New Payment',
    'tx.total': 'Total',

    'howItWorks.title': 'How It Works',
    'howItWorks.1': 'Enter the total USDC amount to split.',
    'howItWorks.2': 'Add each recipient\'s wallet address and percentage share (must total 100%).',
    'howItWorks.3': 'The preview shows the exact onchain amounts each recipient will receive.',
    'howItWorks.4': 'Approve USDC spending (exact amount only), then confirm the split.',
    'howItWorks.5': 'All transfers happen atomically — the payment either fully succeeds or fully reverts.',
    'howItWorks.usdc': 'Need test USDC? Use the <strong>Get test USDC</strong> button in the Arc Studio sidebar.',

    'footer.network': 'Arc Testnet',
    'footer.contract': 'contract ↗',

    // About page
    'about.title': 'What is Arc SplitPay?',
    'about.subtitle': 'Distribute USDC payments to multiple recipients in a single transaction.',
    'about.what.title': 'What Does It Do?',
    'about.what.body': 'Arc SplitPay lets a payer distribute a USDC amount to multiple recipients in a single blockchain transaction. The payment either fully succeeds or fully reverts — no partial distributions.',
    'about.why.title': 'Why Use It?',
    'about.why.1': 'Split project payments automatically across freelance teams',
    'about.why.2': 'Execute revenue-sharing arrangements instantly',
    'about.why.3': 'Pay multiple addresses from a DAO treasury in one transaction',
    'about.why.4': 'Pay multiple parties in a single invoice transaction',
    'about.why.5': 'Distribute partnership profits transparently and verifiably',
    'about.how.title': 'Technical Details',
    'about.how.body': 'The app uses a Solidity smart contract on Arc Testnet. Shares are calculated using basis points (10,000 = 100%). OpenZeppelin SafeERC20 is used for safe token transfers. Reentrancy protection is included. No owner, admin, or hidden fee.',
    'about.security.title': 'Security',
    'about.security.body': 'The contract passed an independent security review. All distribution calculations are verified onchain. USDC is held only transiently during a single transaction. 42 unit tests passed.',
    'about.scheduled.title': 'Scheduled Payments (Subkey)',
    'about.scheduled.body': 'Create signed payment orders bound to a future date, maximum amount, and specific recipients. With Subkey, you sign an authorization now and execute or cancel it at any time.',
    'about.contract.title': 'Contract Information',

    // About page — expanded sections
    'about.mission.title': 'Mission',
    'about.mission.body': 'ParcPay is an independent open-source application designed to make USDC payments programmable on Arc. It provides split payments to multiple recipients, verifiable onchain distribution, and supported scheduled-payment workflows.',

    'about.disclaimer.title': 'Legal Disclaimer',
    'about.disclaimer.body': 'ParcPay is not an official Arc or Circle product. It operates on Arc Testnet and does not involve real assets. Blockchain transactions may be irreversible. This application has passed a security review but no security guarantee is provided. Perform an independent review before using with real funds.',
    'about.disclaimer.audit': 'Independent security review: 2 rounds, 0 high/medium findings. This does not mean the contract is production-ready or free of undiscovered vulnerabilities.',
    'about.disclaimer.irreversible': 'Transactions on a real network are irreversible. Always verify contract addresses, recipient addresses, and network settings before sending.',

    'about.usecases.title': 'Use Cases',
    'about.usecases.freelance.title': 'Freelance Teams',
    'about.usecases.freelance.body': 'Distribute a client payment across designer, developer, and project manager in a single transaction at pre-agreed percentages.',
    'about.usecases.gaming.title': 'Gaming Prize Distributions',
    'about.usecases.gaming.body': 'Distribute tournament prizes to multiple winners as pre-defined rank rewards — in a single contract call.',
    'about.usecases.creator.title': 'NFT & Digital Creator Revenue',
    'about.usecases.creator.body': 'Split royalty income on collaborative works between creator, producer, and platform wallets automatically on every sale.',
    'about.usecases.agent.title': 'AI-Agent Payments',
    'about.usecases.agent.body': 'Pay agent wallets for services, sub-agents, and operational costs within defined spending limits using programmable payment constraints.',

    'about.subkey.title': 'Subkey Integration',
    'about.subkey.real': 'Current state: EIP-712 off-chain signature. Your signature restricts the allowed contract, maximum amount, recipients, and date range. Restrictions are currently enforced at the application layer only.',
    'about.subkey.onchain': 'Onchain enforcement (onchain verification, spending-limit tracking): In development.',
    'about.subkey.neverStores': 'Seed phrases and unrestricted private keys are never requested or stored.',

    'about.fees.title': 'Fee Model',
    'about.fees.current': 'Current status: No platform fee in the MVP.',
    'about.fees.future': 'Future options under evaluation (not yet activated):',
    'about.fees.option1': 'Optional per-transaction platform fee (e.g. 0.10%)',
    'about.fees.option2': 'Business subscriptions for high-volume teams',
    'about.fees.option3': 'Developer API / white-label integration fee',
    'about.fees.distinction': 'Network gas fees are unrelated to ParcPay revenue. Gas fees go directly to Arc validators.',
    'about.fees.projection.title': 'Hypothetical Volume Projection (at 0.10% fee)',
    'about.fees.projection.disclaimer': 'These are illustrative assumptions only, not actual revenue figures. Actual results depend on adoption, costs, tax obligations, and other factors.',

    'about.howtech.title': 'Technical Architecture',
    'about.howtech.wallet': 'Wallet Signatures: Transactions are never signed on your behalf. Your wallet (MetaMask etc.) requests your approval at each step.',
    'about.howtech.usdc': 'USDC: Circle\'s stablecoin natively supported on Arc Testnet. The contract queries the token directly for its decimal count.',
    'about.howtech.arc': 'Arc: An Ethereum-compatible blockchain. Gas fees are paid in USDC. ParcPay is not an official Arc product.',
    'about.howtech.contract': 'Smart Contract: Atomic distribution — all transfers succeed or all revert. No owner, admin, or hidden fee.',
    'about.howtech.subkey': 'Subkey Permissions: EIP-712 typed-data signature. Restrictions are enforced at the application layer. Onchain enforcement is in development.',

    // Scheduled page
    'sched.title': 'Scheduled Payment',
    'sched.subtitle': 'Create and sign a future-dated payment order.',
    'sched.orderTitle': 'Order Details',
    'sched.amount': 'Maximum Amount (USDC)',
    'sched.executeAfter': 'Earliest Execution Date',
    'sched.expiry': 'Expiry Date',
    'sched.nonce': 'Nonce (replay protection)',
    'sched.recipients': 'Recipients & Shares',
    'sched.sign': 'Sign Order (EIP-712)',
    'sched.signing': 'Signing…',
    'sched.signed': 'Order Signed',
    'sched.execute': 'Execute Now',
    'sched.executing': 'Executing…',
    'sched.cancel': 'Cancel Order',
    'sched.cancelling': 'Cancelling…',
    'sched.cancelled': 'Order Cancelled',
    'sched.tooEarly': 'Execution window not yet open.',
    'sched.expired': 'Order has expired.',
    'sched.info.title': 'What is Subkey?',
    'sched.info.body': 'Sign a payment order now, execute it later. Your signature restricts: the allowed contract, maximum amount, recipients, earliest and latest execution date. Cancel at any time.',
    'sched.copy': 'Copy Signature',
    'sched.copied': 'Copied!',
    'sched.warning': 'This feature is in beta. Do not use with real funds.',
    'sched.orderId': 'Order ID',
    'sched.status': 'Status',
    'sched.status.pending': 'Pending',
    'sched.status.ready': 'Ready to Execute',
    'sched.status.executed': 'Executed',
    'sched.status.cancelled': 'Cancelled',
    'sched.status.expired': 'Expired',
    'sched.noOrders': 'No orders yet.',
    'sched.newOrder': 'New Order',
    'sched.myOrders': 'My Orders',
    'sched.executeAfterLabel': 'Earliest:',
    'sched.expiryLabel': 'Expires:',
    'sched.maxLabel': 'Max:',
  },
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('tr')

  const t = (key: string): string => STRINGS[lang][key] ?? STRINGS['en'][key] ?? key

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
