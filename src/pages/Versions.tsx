import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  FolderOpen,
  Globe2,
  HardDrive,
  Layers3,
  Loader2,
  PackageOpen,
  PackagePlus,
  Play,
  RefreshCw,
  Search,
  Server,
  Square,
  Trash2,
  Zap
} from 'lucide-react'
import type { InstalledVersion, LoaderKind, RemoteVersion } from '@shared/types'
import { useApp } from '../store'
import { PageHeader } from '../components/Page'
import { LoaderBadge, ProgressBar, Spinner } from '../components/Bits'
import { ConfirmDialog, Modal, ModalHeader } from '../components/Modal'
import { LoaderModal } from '../components/LoaderModal'
import {
  downloadSourceLabel,
  formatBytes,
  formatDate,
  loaderMeta,
  versionTypeMeta
} from '../lib'

type TypeFilter = 'all' | 'release' | 'snapshot' | 'old'
type Tab = 'browse' | 'installed'

export function VersionsPage(): React.JSX.Element {
  const {
    manifest,
    manifestLoading,
    installed,
    installedLoading,
    settings,
    selectedVersionId,
    running,
    tasks,
    refreshManifest,
    refreshInstalled,
    selectVersion,
    saveSettings,
    runTask,
    launchVersion,
    stopGame,
    toast
  } = useApp()
  const [tab, setTab] = useState<Tab>('browse')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TypeFilter>('release')
  const [visibleCount, setVisibleCount] = useState(40)
  const [taskMap, setTaskMap] = useState<Record<string, string>>({})
  const [loaderTarget, setLoaderTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<InstalledVersion | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importBase, setImportBase] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    setVisibleCount(40)
  }, [query, filter, tab])

  const filtered = useMemo(() => {
    let versions = manifest?.versions ?? []
    if (filter === 'release') versions = versions.filter((version) => version.type === 'release')
    if (filter === 'snapshot') versions = versions.filter((version) => version.type === 'snapshot')
    if (filter === 'old')
      versions = versions.filter(
        (version) => version.type === 'old_beta' || version.type === 'old_alpha'
      )
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      versions = versions.filter((version) => version.id.toLowerCase().includes(q))
    }
    return versions
  }, [manifest, filter, query])

  const sourceOptions = [
    { value: 'auto' as const, label: '自动优选', icon: <Zap size={14} /> },
    { value: 'mirror' as const, label: '国内镜像', icon: <Server size={14} /> },
    { value: 'official' as const, label: '官方源', icon: <Globe2 size={14} /> }
  ]

  const installVersion = async (version: RemoteVersion | InstalledVersion): Promise<void> => {
    let localTaskId = ''
    const result = await runTask({ title: `安装 ${version.id}`, kind: 'install' }, (taskId) => {
      localTaskId = taskId
      setTaskMap((prev) => ({ ...prev, [version.id]: taskId }))
      return window.blockdeck.versions.install(version.id, taskId)
    })
    setTaskMap((prev) => {
      const next = { ...prev }
      delete next[version.id]
      return next
    })
    if (result === null) return
    await refreshInstalled()
    selectVersion(version.id)
    if (!localTaskId) setTab('installed')
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await Promise.all([refreshManifest(true), refreshInstalled()])
    setRefreshing(false)
  }

  const versionsForBase = (id: string): InstalledVersion[] =>
    installed.filter((version) => version.id === id || version.baseVersion === id)

  const deleteInstalled = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      await window.blockdeck.versions.remove(deleteTarget.id)
      const list = await refreshInstalled()
      if (selectedVersionId === deleteTarget.id) {
        if (list[0]) selectVersion(list[0].id)
      }
      toast('版本已删除', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const openImport = (): void => {
    setImportBase(selectedVersionId || installed[0]?.id || '')
    setImportOpen(true)
  }

  const importPack = async (): Promise<void> => {
    setImporting(true)
    try {
      const result = await runTask({ title: '导入整合包', kind: 'install' }, (taskId) =>
        window.blockdeck.versions.importModpack(importBase || undefined, taskId)
      )
      if (!result || result.canceled || !result.versionId) return
      await refreshInstalled()
      selectVersion(result.versionId)
      setTab('installed')
      setImportOpen(false)
      toast(`已导入 ${result.name ?? '整合包'}（${result.files ?? 0} 个文件）`, 'success')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="page versions-page">
      <PageHeader
        eyebrow="LIBRARY / 版本库"
        title="世界，从这里开始"
        subtitle={`${manifest?.versions.length ?? 0} 个官方版本 · 完整历史版本 · 文件来自 ${
          settings.downloadSource === 'mirror' ? '国内镜像' : '官方与镜像'
        }`}
        actions={
          <>
            <div className="segmented source-switch">
              {sourceOptions.map((option) => (
                <button
                  key={option.value}
                  className={settings.downloadSource === option.value ? 'is-active' : ''}
                  onClick={() => void saveSettings({ downloadSource: option.value })}
                  title={`下载源：${option.label}`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={openImport} title="导入整合包">
              <PackageOpen size={17} />
            </button>
            <button className="icon-btn" onClick={() => void refresh()} title="刷新">
              {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            </button>
          </>
        }
      />

      <div className="library-summary">
        <div className="library-stat">
          <span className="library-stat-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <span>本地版本</span>
            <strong>{installed.length}</strong>
          </div>
        </div>
        <div className="library-stat">
          <span className="library-stat-icon">
            <HardDrive size={17} />
          </span>
          <div>
            <span>版本文件</span>
            <strong>
              {formatBytes(installed.reduce((sum, version) => sum + version.sizeBytes, 0))}
            </strong>
          </div>
        </div>
        <div className="library-stat">
          <span className="library-stat-icon">
            <Globe2 size={17} />
          </span>
          <div>
            <span>下载源</span>
            <strong>{downloadSourceLabel(settings.downloadSource)}</strong>
          </div>
        </div>
        <div className="library-stat">
          <span className="library-stat-icon">
            <PackagePlus size={17} />
          </span>
          <div>
            <span>加载器</span>
            <strong>{installed.filter((version) => version.loader !== 'vanilla').length}</strong>
          </div>
        </div>
      </div>

      <div className="page-tabs">
        <button className={tab === 'browse' ? 'is-active' : ''} onClick={() => setTab('browse')}>
          版本浏览
          <span>{manifest?.versions.length ?? 0}</span>
        </button>
        <button className={tab === 'installed' ? 'is-active' : ''} onClick={() => setTab('installed')}>
          已安装
          <span>{installed.length}</span>
        </button>
      </div>

      {tab === 'browse' ? (
        <section className="library-panel">
          <div className="library-toolbar">
            <div className="search-field">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索版本号，例如 1.20.1 / 1.12.2…"
              />
              {query ? (
                <button className="search-clear" onClick={() => setQuery('')}>
                  清除
                </button>
              ) : null}
            </div>
            <div className="filter-chips">
              {(
                [
                  ['release', '正式版'],
                  ['snapshot', '快照'],
                  ['old', '远古版本'],
                  ['all', '全部']
                ] as Array<[TypeFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={filter === value ? 'is-active' : ''}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="version-list-head">
            <span>版本</span>
            <span>发布日期</span>
            <span>类型</span>
            <span>本地状态</span>
            <span className="align-right">操作</span>
          </div>

          <div className="version-list">
            {manifestLoading && !manifest ? (
              Array.from({ length: 8 }).map((_, index) => (
                <div className="version-row skeleton-row" key={index} />
              ))
            ) : filtered.length ? (
              filtered.slice(0, visibleCount).map((version) => {
                const baseInstalled = installed.some((entry) => entry.id === version.id)
                const variants = versionsForBase(version.id)
                const taskId = taskMap[version.id]
                const task = tasks.find((entry) => entry.id === taskId)
                const meta = versionTypeMeta[version.type] ?? versionTypeMeta.release
                const isLatest = version.id === manifest?.latest.release
                return (
                  <div className={`version-row ${baseInstalled ? 'is-installed' : ''}`} key={version.id}>
                    <div className="version-main">
                      <span className="version-block-mark" style={{ borderColor: `${meta.color}44` }}>
                        <span style={{ background: meta.color }} />
                      </span>
                      <div className="version-name">
                        <strong>
                          {version.id}
                          {isLatest ? <span className="latest-pill">LATEST</span> : null}
                        </strong>
                        <span>
                          {version.type === 'release'
                            ? 'Minecraft Java Edition'
                            : version.type === 'snapshot'
                              ? '开发快照'
                              : '历史版本'}
                        </span>
                      </div>
                    </div>
                    <span className="version-date">{formatDate(version.releaseTime)}</span>
                    <span
                      className="type-pill"
                      style={{ color: meta.color, background: meta.background }}
                    >
                      {meta.label}
                    </span>
                    <div className="version-status">
                      {baseInstalled ? (
                        <span className="installed-label">
                          <span className="installed-check">✓</span> 原版已安装
                        </span>
                      ) : (
                        <span className="not-installed">未安装</span>
                      )}
                      {variants.length ? (
                        <div className="row-loader-chips">
                          {variants.map((variant) => (
                            <LoaderBadge key={variant.id} kind={variant.loader} size="sm" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="version-actions">
                      {task ? (
                        <div className="row-progress">
                          <span>{Math.round(task.percent)}%</span>
                          <ProgressBar value={task.percent} thin />
                        </div>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setLoaderTarget(version.id)}
                            title="安装 Fabric / Forge / NeoForge / Quilt"
                          >
                            <PackagePlus size={14} />
                            加载器
                          </button>
                          {baseInstalled ? (
                            <button
                              className={`btn btn-sm ${selectedVersionId === version.id ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => {
                                if (running?.versionId === version.id) void stopGame()
                                else void launchVersion(version.id)
                              }}
                            >
                              {running?.versionId === version.id ? (
                                <>
                                  <Square size={13} /> 运行中
                                </>
                              ) : (
                                <>
                                  <Play size={13} fill="currentColor" /> 启动
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => void installVersion(version)}
                            >
                              <Download size={14} />
                              下载
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="library-empty">
                <Search size={26} />
                <strong>没有找到匹配的版本</strong>
                <span>试试其它关键词，或切换版本类型筛选。</span>
              </div>
            )}
          </div>

          {filtered.length > visibleCount ? (
            <div className="load-more">
              <button className="btn btn-ghost" onClick={() => setVisibleCount((count) => count + 40)}>
                显示更多版本
                <span className="subtle">剩 {filtered.length - visibleCount}</span>
              </button>
            </div>
          ) : null}
          <footer className="library-foot">
            <span>共 {filtered.length} 个版本</span>
            <span>下载源可在右上角切换 · 已下载文件会自动校验完整性</span>
          </footer>
        </section>
      ) : (
        <section className="installed-grid">
          {installedLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div className="installed-card skeleton" key={index} />
            ))
          ) : installed.length ? (
            installed.map((version) => {
              const meta = loaderMeta[version.loader]
              const active = selectedVersionId === version.id
              const isRunning = running?.versionId === version.id
              return (
                <article
                  key={version.id}
                  className={`installed-card ${active ? 'is-active' : ''}`}
                  style={{ '--card-accent': meta.color } as React.CSSProperties}
                >
                  <div className="installed-card-head">
                    <span
                      className={`installed-mark ${version.isPack ? 'is-pack' : ''}`}
                      style={
                        version.isPack
                          ? { background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--lime)' }
                          : { background: meta.soft, color: meta.color }
                      }
                    >
                      {version.isPack ? 'P' : version.loader === 'vanilla' ? 'V' : meta.label.slice(0, 1)}
                    </span>
                    <div className="installed-title">
                      <strong>{version.displayName ?? version.baseVersion ?? version.id}</strong>
                      <span>{version.isPack ? `${version.packVersion ?? '整合包'} · ${version.id}` : version.id}</span>
                    </div>
                    {isRunning ? <span className="live-pill">运行中</span> : null}
                  </div>
                  <div className="installed-tags">
                    <LoaderBadge kind={version.loader} size="sm" />
                    {version.isPack ? <span className="mini-tag pack-tag">整合包</span> : null}
                    {version.loaderVersion ? <span className="mini-tag">{version.loaderVersion}</span> : null}
                    {version.loader === 'vanilla' ? (
                      <span className="mini-tag">{formatBytes(version.sizeBytes)}</span>
                    ) : null}
                  </div>
                  <div className="installed-meta">
                    <span>
                      类型
                      <strong>
                        {version.isPack
                          ? '整合包'
                          : version.loader === 'vanilla'
                            ? versionTypeMeta[version.type]?.label ?? '正式版'
                            : '模组加载器'}
                      </strong>
                    </span>
                    <span>
                      发布日期
                      <strong>{formatDate(version.releaseTime)}</strong>
                    </span>
                  </div>
                  <div className="installed-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        selectVersion(version.id)
                        if (isRunning) void stopGame()
                        else void launchVersion(version.id)
                      }}
                    >
                      {isRunning ? <Square size={13} /> : <Play size={13} fill="currentColor" />}
                      {isRunning ? '结束' : '启动'}
                    </button>
                    {!version.isPack ? (
                      <button
                        className="icon-btn"
                        title="安装加载器"
                        onClick={() => setLoaderTarget(version.baseVersion ?? version.id)}
                      >
                        <PackagePlus size={15} />
                      </button>
                    ) : null}
                    <button
                      className="icon-btn"
                      title="打开版本目录"
                      onClick={() => void window.blockdeck.versions.openFolder(version.id)}
                    >
                      <FolderOpen size={15} />
                    </button>
                    <button
                      className="icon-btn danger-hover"
                      title="删除版本"
                      onClick={() => setDeleteTarget(version)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              )
            })
          ) : (
            <div className="installed-empty">
              <span className="installed-empty-icon">
                <Layers3 size={30} />
              </span>
              <h3>还没有安装任何版本</h3>
              <p>从版本浏览里挑一个喜欢的版本，下载后即可在这里启动。</p>
              <button className="btn btn-primary" onClick={() => setTab('browse')}>
                <Download size={15} /> 浏览版本
              </button>
            </div>
          )}
        </section>
      )}

      <LoaderModal
        open={!!loaderTarget}
        mcVersion={loaderTarget ?? ''}
        onClose={() => setLoaderTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这个版本？"
        message={
          deleteTarget
            ? `将删除 ${deleteTarget.id} 的版本文件，不会删除存档与截图。${
                deleteTarget.loader === 'vanilla'
                  ? '依赖该原版的加载器版本需要先删除。'
                  : ''
              }`
            : ''
        }
        confirmLabel="删除版本"
        danger
        onConfirm={() => void deleteInstalled()}
        onCancel={() => setDeleteTarget(null)}
      />

      {tasks.some((task) => task.status === 'running' && task.kind === 'loader') ? (
        <div className="floating-hint">
          <Spinner size={14} />
          加载器安装进行中，日志实时可见
        </div>
      ) : null}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} width={560}>
        <ModalHeader
          eyebrow="IMPORT / 整合包"
          title="把整合包，带进版本库"
          subtitle="支持 Modrinth .mrpack，以及已经包含 mods/ 的 ZIP；导入后拥有独立实例。"
          icon={<PackageOpen size={20} />}
          onClose={() => setImportOpen(false)}
        />
        <div className="modpack-import">
          <div className="modpack-import-note">
            <strong>会自动完成什么？</strong>
            <span>.mrpack 会读取依赖、下载模组并复制 overrides；ZIP 会把包装入一个独立实例。</span>
          </div>
          <label className="modpack-field">
            <span>ZIP 的基础版本</span>
            <select
              value={importBase}
              onChange={(event) => setImportBase(event.target.value)}
              disabled={!installed.length}
            >
              {installed.length ? (
                installed.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.displayName ?? version.baseVersion ?? version.id} · {version.id}
                  </option>
                ))
              ) : (
                <option value="">请先安装一个版本</option>
              )}
            </select>
          </label>
          <p className="modpack-import-hint">
            .mrpack 会按其中的 Minecraft / 加载器依赖自动匹配已安装版本；如果缺少对应加载器，请先到版本库安装。
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setImportOpen(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void importPack()}
              disabled={!installed.length || importing}
            >
              {importing ? <Loader2 size={15} className="spin" /> : <PackageOpen size={15} />}
              {importing ? '等待文件…' : '选择文件并导入'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
