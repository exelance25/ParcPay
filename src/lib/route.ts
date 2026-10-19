import { useEffect, useState } from 'react'

export type Route = 'home' | 'send' | 'schedule' | 'claim' | 'activity' | 'contract' | 'debug'
const ROUTES: Route[] = ['home', 'send', 'schedule', 'claim', 'activity', 'contract', 'debug']

function parse(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const route = (ROUTES as string[]).includes(path) ? (path as Route) : 'home'
  return { route, params: new URLSearchParams(query) }
}

export function useRoute() {
  const [state, setState] = useState(parse)
  useEffect(() => {
    const on = () => {
      setState(parse())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return state
}

export const go = (route: Route, query = '') => {
  window.location.hash = `/${route}${query ? `?${query}` : ''}`
}
