import React from 'react'
import { hueFromString } from '../lib'

export function LogoMark({ size = 38 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="logo-mark"
      aria-hidden
    >
      <defs>
        <linearGradient id="bd-top" x1="8" y1="6" x2="39" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E3FF9C" />
          <stop offset="1" stopColor="#8FF0B5" />
        </linearGradient>
        <linearGradient id="bd-left" x1="9" y1="24" x2="23" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#57C98D" />
          <stop offset="1" stopColor="#1F7A5B" />
        </linearGradient>
        <linearGradient id="bd-right" x1="28" y1="22" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2FAF80" />
          <stop offset="1" stopColor="#11604C" />
        </linearGradient>
      </defs>
      <path d="M24 4L42 14.2L24 24.4L6 14.2L24 4Z" fill="url(#bd-top)" />
      <path d="M6 14.2L24 24.4V44.5L6 34.3V14.2Z" fill="url(#bd-left)" />
      <path d="M42 14.2L24 24.4V44.5L42 34.3V14.2Z" fill="url(#bd-right)" />
      <path
        d="M15.2 19.4L24 24.3L32.8 19.4"
        stroke="rgba(5,24,18,.28)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M24 24.4V44.5" stroke="rgba(4,25,19,.25)" strokeWidth="1.2" />
      <circle cx="33" cy="10.5" r="2.2" fill="#F4FFD6" opacity=".9" />
    </svg>
  )
}

export function PixelAvatar({
  seed,
  size = 44,
  className = ''
}: {
  seed: string
  size?: number
  className?: string
}): React.JSX.Element {
  const hue = hueFromString(seed)
  const cells: React.ReactNode[] = []
  let value = Math.abs(hue * 97 + seed.length * 13)
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      value = (value * 9301 + 49297 + x * 71 + y * 37) % 233280
      const on = value % 100 < 52
      if (!on) continue
      const lightness = 55 + ((value >> 3) % 22)
      cells.push(
        <span
          key={`${x}-${y}`}
          style={{
            background: `hsl(${hue + (x + y) * 5} 68% ${lightness}%)`
          }}
        />
      )
    }
  }
  return (
    <span
      className={`pixel-avatar ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="pixel-avatar-grid">{cells}</span>
    </span>
  )
}

export function Avatar({
  name,
  uuid,
  skinUrl,
  size = 44,
  className = ''
}: {
  name: string
  uuid?: string
  skinUrl?: string
  size?: number
  className?: string
}): React.JSX.Element {
  const [failed, setFailed] = React.useState(false)
  const remote = uuid && skinUrl ? `https://crafatar.com/avatars/${uuid}?size=96&overlay` : ''
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size }}>
      {remote && !failed ? (
        <img
          src={remote}
          alt={name}
          width={size}
          height={size}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <PixelAvatar seed={uuid || skinUrl || name} size={size} />
      )}
    </span>
  )
}
