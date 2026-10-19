import { useEffect } from 'react'
import { Shell } from '@/components/Shell'
import { HomePage } from '@/pages/HomePage'
import { SendPage } from '@/pages/SendPage'
import { SchedulePage } from '@/pages/SchedulePage'
import { ClaimPage } from '@/pages/ClaimPage'
import { ActivityPage } from '@/pages/ActivityPage'
import { ContractPage } from '@/pages/ContractPage'
import { DebugPage } from '@/pages/DebugPage'
import { useRoute } from '@/lib/route'
import { useLang } from '@/context/LangContext'
import { NETWORK } from '@/chain'

export default function App() {
  const { route, params } = useRoute()
  const { lang } = useLang()
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return (
    <Shell route={route}>
      {route === 'home' && <HomePage />}
      {route === 'send' && <SendPage params={params} />}
      {route === 'schedule' && <SchedulePage />}
      {route === 'claim' && <ClaimPage params={params} />}
      {route === 'activity' && <ActivityPage />}
      {route === 'contract' && <ContractPage />}
      {route === 'debug' && NETWORK === 'testnet' && <DebugPage />}
    </Shell>
  )
}
