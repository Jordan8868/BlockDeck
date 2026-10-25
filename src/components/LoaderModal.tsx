import React, { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Package, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { LoaderInfo, LoaderKind, LoaderOptions } from '@shared/types'
import { useApp, cleanError } from '../store'
import { Modal, ModalHeader } from './Modal'
import { ProgressBar, Spinner } from './Bits'
import { loaderMeta } from '../lib'

const descriptions: Record<string, string> = {
  fabric: '轻量级加载器，启动快、更新及时，适合性能模组与现代化整合。',
  forge: '历史最悠久的模组平台，大型整合包与经典模组的第一选择。',
  neoforge: 'Forge 社区的新分支，面向 1.20.2 之后的现代版本。',
  quilt: '从 Fabric 衍生的开放加载器，兼容大部分 Fabric 模组。'
}

export function LoaderModal({
  open,
  mcVersion,
  onClose,
  onInstalled
}: {
  open: boolean
  mcVersion: string
  onClose: () => void
  onInstalled?: (versionId: string) => void
}): React.JSX.Element | null {
  const { loaderInfo, installed, runTask, tasks, refreshInstalled, selectVersion, toast } = useApp()
  const [kind, setKind] = useState<LoaderKind>('fabric')
  const [options, setOptions] = useState<LoaderOptions | null>(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [installing, setInstalling] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const loaders = loaderInfo.length
    ? loaderInfo
    : ([
        { kind: 'fabric', label: 'Fabric', tagline: '', accent: '#e4d7b8', available: true },
        { kind: 'forge', label: 'Forge', tagline: '', accent: '#f08562', available: true },
        { kind: 'neoforge', label: 'NeoForge', tagline: '', accent: '#ffc35c', available: true },
        { kind: 'quilt', label: 'Quilt', tagline: '', accent: '#b79bff', available: true }
      ] as LoaderInfo[])

  useEffect(() => {
    if (!open) return
    const existing = installed.find(
      (version) => version.baseVersion === mcVersion && version.loader !== 'vanilla'
    )
    const legacyGame = /^1\.(\d+)/.test(mcVersion) && Number(mcVersion.split('.')[1]) < 14
    setKind(existing?.loader ?? (legacyGame ? 'forge' : 'fabric'))
    setOptions(null)
    setSelected('')
    setLoadError('')
    setInstalling(false)
    setTaskId('')
  }, [open, mcVersion, installed])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setLoadError('')
    setOptions(null)
    window.blockdeck.versions
      .loaders(mcVersion, kind)
      .then((result) => {
        if (cancelled) return
        setOptions(result)
        setSelected(result.recommended ?? result.versions[0]?.version ?? '')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(cleanError(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, mcVersion, kind, refreshKey])

  const activeTask = useMemo(() => tasks.find((task) => task.id === taskId), [tasks, taskId])
  const activeMeta = loaders.find((loader) => loader.kind === kind)

  const install = async (): Promise<void> => {
    if (!selected) return
    setInstalling(true)
    let localTask = ''
    const result = await runTask(
      { title: `安装 ${activeMeta?.label ?? kind} · ${mcVersion}`, kind: 'loader' },
      (id) => {
        localTask = id
        setTaskId(id)
        return window.blockdeck.versions.installLoader(
          { mcVersion, kind, loaderVersion: selected },
          id
        )
      }
    )
    setInstalling(false)
    if (result) {
      await refreshInstalled()
      selectVersion(result.versionId)
      onInstalled?.(result.versionId)
      onClose()
    } else if (localTask) {
      toast('加载器安装失败，请查看运行日志', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={760} className="loader-modal">
      <ModalHeader
        eyebrow="MOD LOADER"
        title="安装模组加载器"
        subtitle={`目标版本 ${mcVersion} · 将自动补齐所需的基础游戏文件`}
        onClose={onClose}
        icon={<Package size={20} />}
      />
      <div className="loader-modal-body">
        <div className="loader-picker">
          {loaders.map((loader) => (
            <button
              key={loader.kind}
              className={`loader-choice ${kind === loader.kind ? 'is-active' : ''}`}
              onClick={() => setKind(loader.kind)}
              disabled={installing}
              style={
                {
                  '--loader-accent': loader.accent
                } as React.CSSProperties
              }
            >
              <span className="loader-choice-mark">{loader.label.slice(0, 1)}</span>
              <span className="loader-choice-copy">
                <strong>{loader.label}</strong>
                <small>{descriptions[loader.kind] ?? loader.tagline}</small>
              </span>
              <span className="loader-choice-radio" />
            </button>
          ))}
        </div>

        <div className="loader-config">
          <div className="loader-config-head">
            <div>
              <div className="eyebrow">BUILD SELECT</div>
              <h3>{activeMeta?.label ?? kind} 版本</h3>
            </div>
            <ShieldCheck size={18} className="muted" />
          </div>

          {loading ? (
            <div className="loader-loading">
              <Spinner size={20} />
              <span>正在获取版本列表…</span>
            </div>
          ) : loadError ? (
            <div className="loader-error">
              <span>{loadError}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRefreshKey((v) => v + 1)}>
                <RefreshCw size={14} />
                重试
              </button>
            </div>
          ) : options?.versions.length ? (
            <>
              <div className="select-wrap">
                <select
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  disabled={installing}
                >
                  {options.versions.map((version, index) => (
                    <option key={`${version.version}-${index}`} value={version.version}>
                      {version.label}
                      {version.version === options.recommended ? '  · 推荐' : ''}
                      {version.stable && version.version !== options.recommended ? '  · 稳定' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="loader-note">
                {options.note ?? `推荐 ${options.recommended ?? options.versions[0].version}`}
              </p>
            </>
          ) : (
            <p className="loader-note">当前游戏版本没有可用的 {activeMeta?.label ?? kind} 构建。</p>
          )}

          <div className="loader-summary">
            <div>
              <span>目标游戏</span>
              <strong>{mcVersion}</strong>
            </div>
            <div>
              <span>加载器</span>
              <strong style={{ color: loaderMeta[kind].color }}>
                {activeMeta?.label ?? kind}
              </strong>
            </div>
            <div>
              <span>构建</span>
              <strong>{selected || '—'}</strong>
            </div>
          </div>

          {installing ? (
            <div className="loader-progress">
              <div className="loader-progress-head">
                <span>{activeTask?.message ?? '正在安装…'}</span>
                <span>{Math.round(activeTask?.percent ?? 0)}%</span>
              </div>
              <ProgressBar value={activeTask?.percent ?? 0} thin />
              <p className="progress-hint">安装过程中可以关闭窗口，任务会在后台继续。</p>
            </div>
          ) : null}

          <button
            className="btn btn-primary btn-wide"
            disabled={!selected || installing || loading || !!loadError}
            onClick={() => void install()}
          >
            {installing ? (
              <>
                <Loader2 size={16} className="spin" />
                正在安装…
              </>
            ) : (
              <>
                <Download size={16} />
                安装 {activeMeta?.label ?? kind}
              </>
            )}
          </button>
          <p className="modal-fineprint">
            安装器会自动下载所需库文件；Forge / NeoForge 首次安装可能需要数分钟。
          </p>
        </div>
      </div>
    </Modal>
  )
}
