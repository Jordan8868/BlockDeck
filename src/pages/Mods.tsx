import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Boxes,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  FolderOpen,
  Heart,
  Layers3,
  Loader2,
  PackageOpen,
  RefreshCw,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { InstalledMod, ModSearchHit, ModSearchResult } from '@shared/types'
import { cleanError, useApp } from '../store'
import { PageHeader } from '../components/Page'
import { ConfirmDialog } from '../components/Modal'
import { ProgressBar, Spinner } from '../components/Bits'
import {
  downloadSourceLabel,
  formatBytes,
  formatNumber,
  hueFromString,
  loaderMeta,
  relativeTime
} from '../lib'

type Tab = 'discover' | 'installed'
const loaderOptions = ['fabric', 'forge', 'neoforge', 'quilt'] as const

export function ModsPage(): React.JSX.Element {
  const {
    settings,
    setPage,
    installed,
    selectedInstalled,
    installedMods,
    refreshMods,
    runTask,
    tasks,
    toast
  } = useApp()
  const [tab, setTab] = useState<Tab>('discover')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [gameVersion, setGameVersion] = useState('')
  const [loader, setLoader] = useState<(typeof loaderOptions)[number]>('fabric')
  const [sort, setSort] = useState<'relevance' | 'downloads' | 'newest' | 'updated'>('relevance')
  const [result, setResult] = useState<ModSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [taskMap, setTaskMap] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<InstalledMod | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const requestId = useRef(0)

  const gameVersions = useMemo(() => {
    const list = new Set<string>()
    for (const version of installed) {
      if (version.loader === 'vanilla') list.add(version.id)
      else if (version.baseVersion) list.add(version.baseVersion)
    }
    return [...list]
  }, [installed])

  useEffect(() => {
    if (!gameVersions.length) {
      setGameVersion('')
      return
    }
    if (!gameVersions.includes(gameVersion)) {
      const preferred =
        (selectedInstalled?.baseVersion && gameVersions.includes(selectedInstalled.baseVersion)
          ? selectedInstalled.baseVersion
          : gameVersions[0]) ?? ''
      setGameVersion(preferred)
    }
  }, [gameVersions, gameVersion, selectedInstalled])

  useEffect(() => {
    if (selectedInstalled && selectedInstalled.loader !== 'vanilla') {
      setLoader(selectedInstalled.loader as (typeof loaderOptions)[number])
      return
    }
    const base = selectedInstalled?.baseVersion ?? selectedInstalled?.id
    const variant = installed.find(
      (version) =>
        version.loader !== 'vanilla' && (!base || version.baseVersion === base)
    )
    if (variant) setLoader(variant.loader as (typeof loaderOptions)[number])
  }, [selectedInstalled, installed])

  useEffect(() => {
    void refreshMods(selectedInstalled?.id)
  }, [selectedInstalled?.id, settings.versionIsolation, refreshMods])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 360)
    return () => window.clearTimeout(timer)
  }, [query])

  const fetchMods = useCallback(
    async (offset: number, append: boolean): Promise<void> => {
      const id = ++requestId.current
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError('')
      try {
        const data = await window.blockdeck.mods.search({
          query: debouncedQuery,
          gameVersion: gameVersion || undefined,
          loader,
          offset,
          limit: 20,
          sort
        })
        if (id !== requestId.current) return
        setResult((prev) =>
          append && prev
            ? { ...data, hits: [...prev.hits, ...data.hits], offset: 0 }
            : data
        )
      } catch (err) {
        if (id === requestId.current) setError(cleanError(err))
      } finally {
        if (id === requestId.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [debouncedQuery, gameVersion, loader, sort]
  )

  useEffect(() => {
    if (tab !== 'discover') return
    if (!gameVersion) return
    void fetchMods(0, false)
  }, [tab, fetchMods, gameVersion])

  const install = async (mod: ModSearchHit): Promise<void> => {
    if (!gameVersion) {
      toast('请先在版本库安装一个游戏版本', 'error')
      return
    }
    if (settings.versionIsolation && !selectedInstalled) {
      toast('版本隔离已开启，请先在版本库选择一个已安装版本', 'error')
      return
    }
    let localTaskId = ''
    const installedResult = await runTask(
      { title: `安装模组 ${mod.title}`, kind: 'mod' },
      (taskId) => {
        localTaskId = taskId
        setTaskMap((prev) => ({ ...prev, [mod.projectId]: taskId }))
        return window.blockdeck.mods.install(mod.projectId, gameVersion, loader, selectedInstalled?.id, taskId)
      }
    )
    setTaskMap((prev) => {
      const next = { ...prev }
      delete next[mod.projectId]
      return next
    })
    if (installedResult) {
      await refreshMods(selectedInstalled?.id)
      if (installedResult.installed.length > 1) {
        toast(`已同时安装 ${installedResult.installed.length} 个文件（含依赖）`, 'success')
      }
    } else if (localTaskId) {
      toast('模组安装失败，请查看运行日志', 'error')
    }
  }

  const toggle = async (mod: InstalledMod, enabled: boolean): Promise<void> => {
    setToggling(mod.fileName)
    try {
      await window.blockdeck.mods.toggle(mod.fileName, enabled, selectedInstalled?.id)
      await refreshMods(selectedInstalled?.id)
    } catch (err) {
      toast(cleanError(err), 'error')
    } finally {
      setToggling(null)
    }
  }

  const removeMod = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      await window.blockdeck.mods.remove(deleteTarget.fileName, selectedInstalled?.id)
      await refreshMods(selectedInstalled?.id)
      toast('模组已删除', 'success')
    } catch (err) {
      toast(cleanError(err), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const installedCount = installedMods.length
  const activeLoader = loaderMeta[loader]
  const enabledCount = installedMods.filter((mod) => mod.enabled).length
  const installedProjectIds = new Set(installedMods.map((mod) => mod.projectId).filter(Boolean))

  return (
    <div className="page mods-page">
      <PageHeader
        eyebrow="MODRINTH / 模组工坊"
        title="给世界，加一点想象力"
        subtitle="自动匹配游戏版本与加载器，含依赖安装 · 文件直连 Modrinth"
        actions={
          <>
            {(settings.versionIsolation || selectedInstalled?.isPack) && selectedInstalled ? (
              <span className="source-pill instance-pill" title="存档与模组按版本独立存放">
                <Layers3 size={14} />
                独立实例
              </span>
            ) : null}
            <span className="source-pill">
              <Sparkles size={14} />
              {downloadSourceLabel(settings.downloadSource)}
            </span>
            <button
              className="icon-btn"
              title="打开模组目录"
              onClick={() => void window.blockdeck.mods.openFolder(selectedInstalled?.id)}
            >
              <FolderOpen size={16} />
            </button>
          </>
        }
      />

      <div className="page-tabs mods-tabs">
        <button className={tab === 'discover' ? 'is-active' : ''} onClick={() => setTab('discover')}>
          发现模组
          {result ? <span>{formatNumber(result.totalHits)}</span> : null}
        </button>
        <button className={tab === 'installed' ? 'is-active' : ''} onClick={() => setTab('installed')}>
          已安装
          <span>{installedCount}</span>
        </button>
        <div className="mods-tabs-spacer" />
        {tab === 'installed' ? (
          <>
            <span className="mods-enabled-note">
              {enabledCount} / {installedCount} 已启用
            </span>
            <button className="icon-btn" title="刷新" onClick={() => void refreshMods(selectedInstalled?.id)}>
              <RefreshCw size={15} />
            </button>
          </>
        ) : (
          <span className="mods-compat-note">
            <span className="signal-dot" />
            {gameVersion ? `匹配 ${gameVersion} · ${activeLoader.label}` : '等待选择游戏版本'}
          </span>
        )}
      </div>

      {tab === 'discover' ? (
        <>
          <div className="mod-toolbar">
            <div className="search-field mod-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模组，例如 Sodium、JEI、Create…"
              />
              {loading ? <Loader2 size={15} className="spin muted" /> : null}
            </div>
            <div className="select-wrap compact">
              <select
                value={gameVersion}
                onChange={(event) => setGameVersion(event.target.value)}
                disabled={!gameVersions.length}
              >
                {gameVersions.length ? (
                  gameVersions.map((version) => (
                    <option key={version} value={version}>
                      Minecraft {version}
                    </option>
                  ))
                ) : (
                  <option value="">尚未安装游戏</option>
                )}
              </select>
            </div>
            <div className="segmented loader-switch">
              {loaderOptions.map((option) => (
                <button
                  key={option}
                  className={loader === option ? 'is-active' : ''}
                  onClick={() => setLoader(option)}
                  style={{ '--seg-accent': loaderMeta[option].color } as React.CSSProperties}
                >
                  {loaderMeta[option].label}
                </button>
              ))}
            </div>
            <div className="select-wrap compact sort-select">
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as 'relevance' | 'downloads' | 'newest' | 'updated')
                }
              >
                <option value="relevance">按相关度</option>
                <option value="downloads">按下载量</option>
                <option value="newest">最新发布</option>
                <option value="updated">最近更新</option>
              </select>
            </div>
          </div>

          {!gameVersions.length ? (
            <div className="mods-no-version">
              <span className="empty-icon">
                <Boxes size={28} />
              </span>
              <h3>先安装一个游戏版本</h3>
              <p>模组需要匹配具体的 Minecraft 版本与加载器，安装后才能开始挑选。</p>
              <button className="btn btn-primary" onClick={() => setPage('versions')}>
                前往版本库
              </button>
            </div>
          ) : error ? (
            <div className="mods-error">
              <CircleAlert size={24} />
              <strong>无法连接 Modrinth</strong>
              <span>{error}</span>
              <button className="btn btn-ghost" onClick={() => void fetchMods(0, false)}>
                <RefreshCw size={14} /> 重试
              </button>
            </div>
          ) : loading && !result ? (
            <div className="mod-grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <div className="mod-card skeleton" key={index} />
              ))}
            </div>
          ) : result?.hits.length ? (
            <>
              <div className="mod-grid">
                {result.hits.map((mod) => {
                  const already = installedProjectIds.has(mod.projectId)
                  const taskId = taskMap[mod.projectId]
                  const task = tasks.find((entry) => entry.id === taskId)
                  const hue = hueFromString(mod.projectId)
                  return (
                    <article className={`mod-card ${task ? 'is-installing' : ''}`} key={mod.projectId}>
                      <div className="mod-card-top">
                        <span
                          className="mod-icon"
                          style={{ background: `linear-gradient(145deg, hsl(${hue} 48% 30%), hsl(${hue + 30} 42% 17%))` }}
                        >
                          {mod.iconUrl ? (
                            <img src={mod.iconUrl} alt="" loading="lazy" />
                          ) : (
                            <span>{mod.title.slice(0, 1).toUpperCase()}</span>
                          )}
                        </span>
                        <div className="mod-card-title">
                          <strong title={mod.title}>{mod.title}</strong>
                          <span>by {mod.author}</span>
                        </div>
                        {task ? (
                          <span className="mod-install-state">
                            <Spinner size={14} />
                            {Math.round(task.percent)}%
                          </span>
                        ) : already ? (
                          <span className="mod-installed-pill">
                            <Check size={13} /> 已安装
                          </span>
                        ) : (
                          <button
                            className="mod-install-btn"
                            onClick={() => void install(mod)}
                            title="安装到当前游戏版本"
                          >
                            <ArrowDownToLine size={16} />
                          </button>
                        )}
                      </div>
                      <p className="mod-desc">{mod.description}</p>
                      <div className="mod-meta">
                        <span>
                          <Download size={13} /> {formatNumber(mod.downloads)}
                        </span>
                        <span>
                          <Heart size={13} /> {formatNumber(mod.follows)}
                        </span>
                        <span className="mod-updated">更新于 {relativeTime(mod.dateModified)}</span>
                      </div>
                      <div className="mod-card-foot">
                        <div className="mod-loaders">
                          {mod.loaders.slice(0, 3).map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                        <button
                          className="mod-link"
                          title="在 Modrinth 打开"
                          onClick={() =>
                            void window.blockdeck.app.openExternal(
                              `https://modrinth.com/mod/${mod.slug}`
                            )
                          }
                        >
                          <ExternalLink size={14} />
                        </button>
                      </div>
                      {task ? <ProgressBar value={task.percent} thin /> : null}
                    </article>
                  )
                })}
              </div>
              <div className="mods-load-more">
                {result.hits.length < result.totalHits ? (
                  <button
                    className="btn btn-ghost"
                    disabled={loadingMore}
                    onClick={() => void fetchMods(result.hits.length, true)}
                  >
                    {loadingMore ? <Loader2 size={15} className="spin" /> : <ArrowDownToLine size={15} />}
                    加载更多模组
                  </button>
                ) : (
                  <span>已展示全部 {result.hits.length} 条结果</span>
                )}
              </div>
            </>
          ) : (
            <div className="mods-empty">
              <span className="empty-icon">
                <PackageOpen size={28} />
              </span>
              <h3>没有找到匹配的模组</h3>
              <p>试试更短的关键词，或切换到其它加载器 / 游戏版本。</p>
            </div>
          )}
        </>
      ) : (
        <section className="installed-mods-panel">
          <div className="installed-mods-head">
            <div>
              <div className="eyebrow">LOCAL MODS</div>
              <h3>本地模组</h3>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void window.blockdeck.mods.openFolder(selectedInstalled?.id)}
            >
              <FolderOpen size={14} /> 打开文件夹
            </button>
          </div>
          {installedMods.length ? (
            <div className="installed-mod-list">
              {installedMods.map((mod) => {
                const meta = mod.projectTitle
                return (
                  <div className={`installed-mod-row ${mod.enabled ? '' : 'is-disabled'}`} key={mod.fileName}>
                    <span className="installed-mod-icon">
                      {meta ? meta.slice(0, 1).toUpperCase() : <PackageOpen size={15} />}
                    </span>
                    <div className="installed-mod-copy">
                      <strong>{meta ?? mod.fileName.replace(/\.jar(\.disabled)?$/i, '')}</strong>
                      <span>{mod.fileName}</span>
                    </div>
                    <span className="mod-file-size">{formatBytes(mod.size)}</span>
                    <span className={`mod-state-pill ${mod.enabled ? 'is-on' : ''}`}>
                      {mod.enabled ? '已启用' : '已禁用'}
                    </span>
                    <button
                      className={`toggle ${mod.enabled ? 'is-on' : ''} ${toggling === mod.fileName ? 'is-busy' : ''}`}
                      onClick={() => void toggle(mod, !mod.enabled)}
                      disabled={toggling === mod.fileName}
                      title={mod.enabled ? '禁用模组' : '启用模组'}
                    >
                      <span />
                    </button>
                    <button
                      className="icon-btn danger-hover"
                      onClick={() => setDeleteTarget(mod)}
                      title="删除模组"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="mods-empty">
              <span className="empty-icon">
                <PackageOpen size={28} />
              </span>
              <h3>模组文件夹是空的</h3>
              <p>去「发现模组」挑几个作品，安装后会自动出现在这里。</p>
              <button className="btn btn-primary" onClick={() => setTab('discover')}>
                <Sparkles size={15} /> 发现模组
              </button>
            </div>
          )}
          <div className="installed-mods-hint">
            <span className="signal-dot" />
            禁用模组只会重命名文件（.disabled），不会删除。启动游戏时不会加载。
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这个模组？"
        message={`将永久删除 ${deleteTarget?.projectTitle ?? deleteTarget?.fileName ?? ''}，无法撤销。`}
        confirmLabel="删除文件"
        danger
        onConfirm={() => void removeMod()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
