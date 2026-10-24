import React from 'react'

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions
}: {
  eyebrow: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  )
}

export function SectionHead({
  title,
  note,
  action
}: {
  title: string
  note?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
