/**
 * ParcPay wordmark + logomark.
 *
 * Wordmark: "P" in neutral ink · "ARC" in blue→purple gradient · "Pay" in neutral ink
 * Mark: stylised "P" with an arc sweep — the "ARC" motif. Pure SVG, no raster images.
 * Not affiliated with or copying Arc's official brand.
 */
import { BRAND } from './brand'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  mono?: boolean        // monochrome (no gradient)
  showTagline?: boolean
}

const SIZE_MAP = {
  sm: { text: '15px', tag: '9px',  iconSize: 28 },
  md: { text: '20px', tag: '11px', iconSize: 36 },
  lg: { text: '28px', tag: '13px', iconSize: 48 },
}

/** The "P⌒" monogram icon */
export function LogoMark({ size = 36, mono = false }: { size?: number; mono?: boolean }) {
  const id = `pp-${size}` // unique per size to avoid SVG gradient ID clashes
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ParcPay logo"
      role="img"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={mono ? '#1A2240' : '#0052FF'} />
          <stop offset="100%" stopColor={mono ? '#2A3455' : '#7B3FE4'} />
        </linearGradient>
        <linearGradient id={`${id}-arc`} x1="0" y1="0" x2="36" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={mono ? '#E8EDF8' : '#3374FF'} />
          <stop offset="100%" stopColor={mono ? '#A8B4CC' : '#00D4C8'} />
        </linearGradient>
      </defs>

      {/* Rounded square bg */}
      <rect width="36" height="36" rx="9" fill={`url(#${id}-bg)`} />

      {/* "P" stem + bowl */}
      <path
        d="M10 9 v18 M10 9 h7 Q20 9 20 14 Q20 19 13 19 h-3"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />

      {/* Arc sweep — the ARC motif, teal→blue gradient */}
      <path
        d="M22 27 Q31 27 31 18 Q31 9 22 9"
        stroke={`url(#${id}-arc)`}
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/** Full wordmark: "P" · "ARC" (gradient accent) · "Pay" */
export function LogoWordmark({ size = 'md', mono = false, showTagline = false }: LogoProps) {
  const s = SIZE_MAP[size]
  const id = `pp-wm-${size}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
      <LogoMark size={s.iconSize} mono={mono} />
      <div>
        <div
          style={{
            fontSize: s.text,
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'baseline',
            gap: '0px',
          }}
        >
          {/* "P" prefix */}
          <span style={{ color: 'var(--ink)' }}>{BRAND.namePrefix}</span>

          {/* "ARC" with gradient */}
          {mono ? (
            <span style={{ color: 'var(--ink)' }}>{BRAND.nameAccent}</span>
          ) : (
            <>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id={`${id}-text`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor="#0052FF" />
                    <stop offset="100%" stopColor="#7B3FE4" />
                  </linearGradient>
                </defs>
              </svg>
              <span
                style={{
                  background: 'linear-gradient(90deg, #0052FF 0%, #7B3FE4 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {BRAND.nameAccent}
              </span>
            </>
          )}

          {/* "Pay" suffix */}
          <span style={{ color: 'var(--ink)' }}>{BRAND.nameSuffix}</span>
        </div>

        {showTagline && (
          <p
            style={{
              fontSize: s.tag,
              color: 'var(--muted)',
              fontFamily: "'DM Sans', sans-serif",
              marginTop: '3px',
              letterSpacing: '0.01em',
            }}
          >
            {BRAND.tagline}
          </p>
        )}
      </div>
    </div>
  )
}
