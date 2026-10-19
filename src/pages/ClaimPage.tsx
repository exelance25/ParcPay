import { useMemo } from 'react'
import { Page } from '@/components/Shell'
import { OrderCard } from '@/components/OrderCard'
import { decodeOrder } from '@/hooks/useOrders'
import { useT } from '@/lib/i18n'

export function ClaimPage({ params }: { params: URLSearchParams }) {
  const T = useT()
  const so = useMemo(() => decodeOrder(params.get('o') ?? ''), [params])
  return (
    <Page
      title={T('Planlı ödeme', 'Scheduled payment')}
      intro={T('Bu ödeme emri ödeyen tarafından imzalandı. Vadesi geldiyse “Şimdi öde” ile tetikleyebilirsin; para yalnızca listelenen adreslere gider.', 'The payer signed this order. If it is due, press “Pay now”; money only goes to the listed addresses.')}
    >
      {so ? (
        <div className="max-w-2xl"><OrderCard so={so} /></div>
      ) : (
        <p className="muted">{T('Link geçersiz ya da eksik kopyalanmış.', 'The link is invalid or was copied incompletely.')}</p>
      )}
    </Page>
  )
}
