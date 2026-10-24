import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  children,
  width = 560,
  className = '',
  closeOnBackdrop = true
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: number
  className?: string
  closeOnBackdrop?: boolean
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', listener)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', listener)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal-panel ${className}`} style={{ width }} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body
  )
}

export function ModalHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
  icon
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  onClose: () => void
  icon?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="modal-head">
      <div className="modal-head-identity">
        {icon ? <span className="modal-icon">{icon}</span> : null}
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <button className="icon-btn" onClick={onClose} aria-label="关闭">
        <X size={18} />
      </button>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onCancel
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Modal open={open} onClose={onCancel} width={420}>
      <div className="confirm-body">
        <div className={`confirm-mark ${danger ? 'is-danger' : ''}`}>
          <span>!</span>
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
