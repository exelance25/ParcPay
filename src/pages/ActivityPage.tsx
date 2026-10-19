import { ExternalLink } from 'lucide-react'
import { Page } from '@/components/Shell'
import { useActivity, clearActivity } from '@/lib/activity'
import { fmt, memoFromBytes32, short } from '@/lib/money'
import { txUrl } from '@/chain'
import { useT } from '@/lib/i18n'

export function ActivityPage() {
  const T = useT()
  const lang = T.lang
  const items = useActivity()
  const kindLabel = { split: T('Bölünmüş ödeme', 'Split payment'), order: T('Planlı ödeme', 'Scheduled payment'), cancel: T('İptal', 'Cancellation'), approve: T('Onay', 'Approval') }
  return (
    <Page title={T('Geçmiş', 'History')} intro={T('Bu tarayıcıdan yaptığın işlemler. Kalıcı kayıt her zaman Arc explorer’dadır.', 'Transactions made from this browser. The permanent record is always on the Arc explorer.')}>
      {items.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="muted">{T('Henüz işlem yok.', 'No transactions yet.')}</p>
          <a href="#/send" className="btn btn-primary mt-2">{T('İlk ödemeni gönder', 'Send your first payment')}</a>
        </div>
      ) : (
        <>
          <ul className="panel p-0 m-0 list-none overflow-hidden">
            {items.map((it) => (
              <li key={it.id} className="p-4 sm:p-5 flex flex-wrap items-center gap-3 justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
                <div className="min-w-0">
                  <p className="font-semibold m-0">{kindLabel[it.kind]}{it.memo && memoFromBytes32(it.memo) ? ` · ${memoFromBytes32(it.memo)}` : ''}</p>
                  <p className="small faint m-0">
                    {new Date(it.ts).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB')}
                    {it.recipients ? ` · ${it.recipients.length} ${T('alıcı', 'recipients')}` : ''}
                    {it.recipients?.length ? ` · ${it.recipients.slice(0, 3).map((r) => short(r.to)).join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {it.total && <span className="num font-semibold">{fmt(BigInt(it.total), lang)} USDC</span>}
                  <a className="btn btn-ghost btn-sm" href={txUrl(it.hash)} target="_blank" rel="noreferrer" aria-label="Explorer"><ExternalLink size={14} /></a>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={clearActivity}>{T('Bu tarayıcıdaki geçmişi temizle', 'Clear history in this browser')}</button>
        </>
      )}
    </Page>
  )
}
