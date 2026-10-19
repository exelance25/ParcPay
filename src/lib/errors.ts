import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const MESSAGES: Record<string, [string, string]> = {
  NoRecipients: ['En az bir alıcı gerekli.', 'At least one recipient is required.'],
  TooManyRecipients: ['En fazla 50 alıcı olabilir.', 'At most 50 recipients.'],
  InvalidRecipient: ['Alıcı adreslerinden biri geçersiz.', 'One recipient address is invalid.'],
  ZeroAmount: ['Her alıcıya 0’dan büyük tutar girin.', 'Every recipient needs an amount above 0.'],
  DuplicateRecipient: ['Aynı adres iki kez eklenmiş.', 'The same address is listed twice.'],
  FeeTooHigh: ['Platform ücreti değişti. Sayfayı yenileyip tekrar deneyin.', 'The platform fee changed. Refresh and try again.'],
  InvalidSignature: ['İmza bu emirle eşleşmiyor.', 'The signature does not match this order.'],
  OrderIsCancelled: ['Bu emir ödeyen tarafından iptal edildi.', 'The payer cancelled this order.'],
  OrderIsRevoked: ['Bu emir ödeyen tarafından geri alındı.', 'The payer revoked this order.'],
  OrderNotDue: ['Ödeme zamanı henüz gelmedi.', 'This payment is not due yet.'],
  OrderExpired: ['Emrin süresi doldu.', 'This order has expired.'],
  OrderCompleted: ['Bu emrin tüm ödemeleri yapıldı.', 'All runs of this order are done.'],
  InvalidSchedule: ['Takvim geçersiz.', 'The schedule is invalid.'],
  EnforcedPause: ['Ödemeler geçici olarak durduruldu.', 'Payments are temporarily paused.'],
  ERC20InsufficientAllowance: ['Harcama izni yetersiz. Önce onay verin.', 'Allowance too low. Approve first.'],
}

export function explainError(err: unknown, lang: 'tr' | 'en'): string {
  const pick = (p: [string, string]) => (lang === 'tr' ? p[0] : p[1])
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return pick(['İşlemi cüzdanda iptal ettiniz.', 'You cancelled in your wallet.'])
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    const name = revert?.data?.errorName
    if (name && MESSAGES[name]) return pick(MESSAGES[name])
    const msg = (err.shortMessage + ' ' + (err.details ?? '')).toLowerCase()
    if (msg.includes('insufficient funds') || msg.includes('exceeds the balance')) return pick(['Gas için yeterli USDC yok. faucet.circle.com’dan Arc Testnet USDC al.', 'Not enough USDC for gas. Get Arc Testnet USDC at faucet.circle.com.'])
    if (msg.includes('chain') && (msg.includes('not') || msg.includes('unrecognized') || msg.includes('mismatch'))) return pick(['Cüzdan Arc ağına geçemedi. Cüzdanda Arc Testnet’i seç ya da MetaMask kullan.', 'Wallet could not switch to Arc. Select Arc Testnet in your wallet or use MetaMask.'])
    if (msg.includes('allowance')) return pick(MESSAGES.ERC20InsufficientAllowance)
    if (msg.includes('balance') || msg.includes('insufficient')) return pick(['USDC bakiyesi yetersiz (ödeme + ücret + gas).', 'Not enough USDC (payment + fee + gas).'])
    return err.shortMessage
  }
  return pick(['Beklenmeyen bir hata oluştu.', 'Something unexpected happened.'])
}
