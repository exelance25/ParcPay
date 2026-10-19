import { useLang } from '@/context/LangContext'

/** Inline bilingual strings: const T = useT(); T('Gönder', 'Send') */
export function useT() {
  const { lang } = useLang()
  return Object.assign((tr: string, en: string) => (lang === 'tr' ? tr : en), { lang })
}
