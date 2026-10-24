import React from 'react'
import type { LoaderKind } from '@shared/types'
import { loaderMeta } from '../lib'

export function LoaderBadge({
  kind,
  size = 'md',
  ghost = false
}: {
  kind: LoaderKind
  size?: 'sm' | 'md'
  ghost?: boolean
}): React.JSX.Element {
  const meta = loaderMeta[kind] ?? loaderMeta.vanilla
  return (
    <span
      className={`loader-badge loader-badge-${size} ${ghost ? 'is-ghost' : ''}`}
      style={{
        color: ghost ? undefined : meta.color,
        background: ghost ? 'transparent' : meta.soft,
        borderColor: ghost ? 'rgba(255,255,255,.1)' : `${meta.color}33`
      }}
    >
      <span className="loader-dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}

export function ProgressBar({
  value,
  accent = '#c8ff62',
  indeterminate = false,
  thin = false
}: {
  value: number
  accent?: string
  indeterminate?: boolean
  thin?: boolean
}): React.JSX.Element {
  return (
    <div className={`progress ${thin ? 'progress-thin' : ''} ${indeterminate ? 'is-indeterminate' : ''}`}>
      <div
        className="progress-fill"
        style={{
          width: indeterminate ? undefined : `${Math.max(2, Math.min(100, value))}%`,
          background: `linear-gradient(90deg, ${accent}b0, ${accent})`
        }}
      />
    </div>
  )
}

export function Spinner({ size = 16, color }: { size?: number; color?: string }): React.JSX.Element {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, borderTopColor: color ?? '#c8ff62' }}
    />
  )
}
