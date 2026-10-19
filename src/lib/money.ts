import { formatUnits, parseUnits, isAddress, getAddress, toHex, pad, hexToString, trim } from 'viem'
import { USDC_DECIMALS } from '@/chain'

/** Parse a user-typed USDC string ("12.5" or "12,5") into base units. Returns null when invalid. */
export function toRaw(input: string): bigint | null {
  const s = input.trim().replace(',', '.')
  if (!/^\d+(\.\d{0,6})?$/.test(s)) return null
  try {
    return parseUnits(s, USDC_DECIMALS)
  } catch {
    return null
  }
}

/** Format base units for display with locale separators, keeping up to 6 decimals. */
export function fmt(raw: bigint, lang: 'tr' | 'en' = 'tr', maxDecimals = 6): string {
  const n = Number(formatUnits(raw, USDC_DECIMALS))
  return n.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDecimals,
  })
}

export const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

export type Mode = 'amount' | 'percent'

export interface Row {
  address: string
  value: string // USDC in amount mode, % in percent mode
}

export interface Built {
  transfers: { to: `0x${string}`; amount: bigint }[]
  total: bigint
  error: string | null
}

/**
 * Turn form rows into exact onchain transfers.
 * Percent mode: amount_i = floor(total * bp_i / 10000); the remainder goes to the last row,
 * so the recipients always receive exactly `total`.
 */
export function buildTransfers(rows: Row[], mode: Mode, totalStr: string, lang: 'tr' | 'en'): Built {
  const T = (tr: string, en: string) => (lang === 'tr' ? tr : en)
  const out: Built = { transfers: [], total: 0n, error: null }
  if (rows.length === 0) return { ...out, error: T('En az bir alıcı ekleyin.', 'Add at least one recipient.') }

  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i].address.trim()
    if (!isAddress(a)) return { ...out, error: T(`${i + 1}. alıcının adresi geçersiz.`, `Recipient ${i + 1} has an invalid address.`) }
    const k = a.toLowerCase()
    if (k === '0x0000000000000000000000000000000000000000') return { ...out, error: T('Sıfır adrese ödeme yapılamaz.', 'Cannot pay the zero address.') }
    if (seen.has(k)) return { ...out, error: T(`${i + 1}. alıcı tekrar ediyor.`, `Recipient ${i + 1} is a duplicate.`) }
    seen.add(k)
  }

  if (mode === 'amount') {
    for (let i = 0; i < rows.length; i++) {
      const raw = toRaw(rows[i].value)
      if (raw === null || raw === 0n) return { ...out, error: T(`${i + 1}. alıcı için geçerli bir tutar girin.`, `Enter a valid amount for recipient ${i + 1}.`) }
      out.transfers.push({ to: getAddress(rows[i].address.trim()), amount: raw })
      out.total += raw
    }
    return out
  }

  const total = toRaw(totalStr)
  if (total === null || total === 0n) return { ...out, error: T('Toplam tutarı girin.', 'Enter the total amount.') }
  const bps = rows.map((r) => Math.round(parseFloat(r.value.replace(',', '.')) * 100))
  if (bps.some((b) => !Number.isFinite(b) || b <= 0)) return { ...out, error: T('Her alıcının yüzdesi 0’dan büyük olmalı.', 'Every share must be above 0%.') }
  const sum = bps.reduce((s, b) => s + b, 0)
  if (sum !== 10_000) return { ...out, error: T(`Yüzdelerin toplamı %100 olmalı (şu an %${(sum / 100).toFixed(2)}).`, `Shares must add up to 100% (now ${(sum / 100).toFixed(2)}%).`) }
  let given = 0n
  rows.forEach((r, i) => {
    const amt = i === rows.length - 1 ? total - given : (total * BigInt(bps[i])) / 10_000n
    given += amt
    out.transfers.push({ to: getAddress(r.address.trim()), amount: amt })
  })
  if (out.transfers.some((t) => t.amount === 0n)) return { ...out, transfers: [], error: T('Tutar çok küçük: bir alıcıya 0 düşüyor.', 'Amount too small: a recipient would get 0.') }
  out.total = total
  return out
}

/** Encode a short text memo (invoice no, payroll period…) as bytes32 (UTF-8, cut at 32 bytes). */
export function memoToBytes32(text: string): `0x${string}` {
  const enc = new TextEncoder()
  let out = ''
  for (const ch of text.trim()) {
    if (enc.encode(out + ch).length > 32) break
    out += ch
  }
  return pad(toHex(enc.encode(out)), { dir: 'right', size: 32 })
}

export function memoFromBytes32(memo: string): string {
  if (!memo || /^0x0*$/.test(memo)) return ''
  try {
    return hexToString(trim(memo as `0x${string}`, { dir: 'right' }))
  } catch {
    return ''
  }
}
