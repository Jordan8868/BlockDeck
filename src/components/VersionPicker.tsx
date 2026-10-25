import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, Settings2 } from 'lucide-react'
import { useApp } from '../store'
import { formatDate, loaderFromVersionId, loaderMeta } from '../lib'
import { LoaderBadge } from './Bits'

export function VersionPicker({ onManage }: { onManage?: () => void }): React.JSX.Element {
  const {
    installed,
    manifest,
    selectedVersionId,
    selectedInstalled,
    selectVersion,
    running
  } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = (): void => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(362, window.innerWidth - 24)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      const spaceBelow = window.innerHeight - rect.bottom - 16
      const height = Math.min(390, Math.max(220, spaceBelow))
      const opensDown = spaceBelow >= 240
      const top = opensDown ? rect.bottom + 9 : Math.max(12, rect.top - height - 9)
      setPopoverStyle({ left, top, width, maxHeight: height })
    }
    update()
    const closeOnViewportChange = (): void => setOpen(false)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const listener = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const releases = useMemo(
    () =>
      (manifest?.versions ?? [])
        .filter((version) => version.type === 'release')
        .slice(0, 12)
        .filter((version) => !installed.some((entry) => entry.id === version.id)),
    [manifest, installed]
  )

  const filteredInstalled = installed.filter((version) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      version.id.toLowerCase().includes(q) ||
      version.name.toLowerCase().includes(q) ||
      version.loader.includes(q)
    )
  })
  const filteredReleases = releases.filter((version) =>
    !query ? true : version.id.toLowerCase().includes(query.toLowerCase())
  )

  const selectedLabel = selectedInstalled
    ? selectedInstalled.baseVersion ?? selectedInstalled.id
    : selectedVersionId
  const selectedLoader = selectedInstalled
    ? selectedInstalled.loader
    : loaderFromVersionId(selectedVersionId)

  return (
    <div className="version-picker" ref={ref}>
      <button
        className={`version-picker-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        disabled={!!running}
      >
        <span className="version-picker-copy">
          <span className="version-picker-label">当前版本</span>
          <span className="version-picker-value">
            {selectedLabel || '选择版本'}
            {selectedInstalled ? <LoaderBadge kind={selectedInstalled.loader} size="sm" /> : null}
          </span>
        </span>
        <ChevronDown size={16} className={open ? 'rotate-180' : ''} />
      </button>

      {open ? createPortal(
        <div className="version-popover version-popover-portal" style={popoverStyle} ref={popoverRef}>
          <div className="version-popover-head">
            <div className="version-search">
              <Search size={14} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索版本…"
              />
            </div>
            <span className="version-popover-count">{installed.length} 已安装</span>
          </div>
          <div className="version-popover-scroll">
            {filteredInstalled.length ? (
              <>
                <div className="version-group-label">我的版本</div>
                {filteredInstalled.map((version) => (
                  <button
                    key={version.id}
                    className={`version-option ${selectedVersionId === version.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      selectVersion(version.id)
                      setOpen(false)
                    }}
                  >
                    <span
                      className="version-option-mark"
                      style={{ background: loaderMeta[version.loader].color }}
                    />
                    <span className="version-option-copy">
                      <strong>{version.baseVersion ?? version.id}</strong>
                      <small>
                        {version.loader === 'vanilla'
                          ? `${version.type === 'release' ? '正式版' : '游戏版本'} · ${formatDate(
                              version.releaseTime
                            )}`
                          : `${loaderMeta[version.loader].label} ${version.loaderVersion ?? ''}`}
                      </small>
                    </span>
                    <LoaderBadge kind={version.loader} size="sm" />
                    {selectedVersionId === version.id ? <Check size={15} className="option-check" /> : null}
                  </button>
                ))}
              </>
            ) : null}

            {filteredReleases.length ? (
              <>
                <div className="version-group-label">可安装的正式版</div>
                {filteredReleases.map((version) => (
                  <button
                    key={version.id}
                    className="version-option"
                    onClick={() => {
                      selectVersion(version.id)
                      setOpen(false)
                    }}
                  >
                    <span className="version-option-mark" style={{ background: '#c9ff7a' }} />
                    <span className="version-option-copy">
                      <strong>{version.id}</strong>
                      <small>正式版 · {formatDate(version.releaseTime)}</small>
                    </span>
                    <span className="mini-tag">远程</span>
                  </button>
                ))}
              </>
            ) : null}

            {!filteredInstalled.length && !filteredReleases.length ? (
              <div className="version-empty">没有匹配的版本</div>
            ) : null}
          </div>
          {onManage ? (
            <button
              className="version-manage"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings2 size={14} />
              管理全部版本
            </button>
          ) : null}
        </div>,
        document.body
      ) : null}
    </div>
  )
}
