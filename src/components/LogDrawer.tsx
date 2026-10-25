import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FolderOpen, Terminal, Trash2, X } from 'lucide-react'
import { useApp } from '../store'

const sourceLabels: Record<string, { label: string; color: string }> = {
  launcher: { label: 'LAUNCHER', color: '#c8ff62' },
  game: { label: 'GAME', color: '#7ee7c1' },
  installer: { label: 'INSTALLER', color: '#ffc375' },
  download: { label: 'DOWNLOAD', color: '#8db7ff' },
  room: { label: 'ROOM', color: '#ffd479' }
}

export function LogDrawer(): React.JSX.Element | null {
  const { logsOpen, closeLogs, logs, clearLogs, appInfo, toast } = useApp()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'game' | 'installer' | 'launcher' | 'room'>('all')

  const visible = useMemo(
    () => (filter === 'all' ? logs : logs.filter((log) => log.source === filter)),
    [logs, filter]
  )

  useEffect(() => {
    if (!logsOpen) return
    const node = bodyRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [logs, logsOpen, filter])

  useEffect(() => {
    if (!logsOpen) return
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeLogs()
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [logsOpen, closeLogs])

  if (!logsOpen) return null

  const copyAll = async (): Promise<void> => {
    const text = visible
      .map(
        (log) =>
          `[${new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}] [${log.source}] ${log.line}`
      )
      .join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast('日志已复制到剪贴板', 'success')
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeLogs()
    }}>
      <section className="log-drawer">
        <header className="log-head">
          <div className="log-title">
            <span className="log-title-icon">
              <Terminal size={18} />
            </span>
            <div>
              <div className="eyebrow">LIVE OUTPUT</div>
              <h2>运行日志</h2>
            </div>
          </div>
          <div className="log-actions">
            <button className="icon-btn" onClick={() => void copyAll()} title="复制日志">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button className="icon-btn" onClick={clearLogs} title="清空日志">
              <Trash2 size={16} />
            </button>
            <button
              className="icon-btn"
              title="打开日志文件夹"
              onClick={() =>
                appInfo?.dataDir
                  ? void window.blockdeck.app.openPath(`${appInfo.dataDir}\\logs`)
                  : undefined
              }
            >
              <FolderOpen size={16} />
            </button>
            <button className="icon-btn" onClick={closeLogs} title="关闭">
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="log-filter">
          {(['all', 'game', 'installer', 'launcher', 'room'] as const).map((key) => (
            <button
              key={key}
              className={`log-filter-btn ${filter === key ? 'is-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? '全部' : sourceLabels[key]?.label ?? key}
            </button>
          ))}
          <span className="log-count">{visible.length} 行</span>
        </div>

        <div className="log-body" ref={bodyRef}>
          {visible.length === 0 ? (
            <div className="log-empty">
              <Terminal size={28} />
              <p>还没有运行输出</p>
              <span>安装版本或启动游戏后，日志会实时出现在这里。</span>
            </div>
          ) : (
            visible.map((log, index) => {
              const meta = sourceLabels[log.source] ?? sourceLabels.launcher
              return (
                <div className="log-line" key={`${log.time}-${index}`}>
                  <span className="log-time">
                    {new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <span className="log-source" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className={`log-text ${/error|exception|failed/i.test(log.line) ? 'is-error' : ''}`}>
                    {log.line}
                  </span>
                </div>
              )
            })
          )}
        </div>

        <footer className="log-foot">
          <span className="signal-dot" />
          <span>实时输出 · 保留最近 1200 行</span>
        </footer>
      </section>
    </div>
  )
}
