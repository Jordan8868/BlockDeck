import React, { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  CircleDot,
  CloudDownload,
  Compass,
  Cpu,
  Download,
  FolderOpen,
  Gamepad2,
  Globe2,
  Layers3,
  Loader2,
  LogIn,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Wrench,
  Zap
} from 'lucide-react'
import type { LoaderKind, RemoteVersion } from '@shared/types'
import { useApp } from '../store'
import { HeroArt } from '../components/HeroArt'
import { VersionPicker } from '../components/VersionPicker'
import { LoaderBadge, Spinner } from '../components/Bits'
import { SectionHead } from '../components/Page'
import {
  downloadSourceLabel,
  formatBytes,
  formatDate,
  formatNumber,
  greeting,
  loaderFromVersionId,
  loaderMeta,
  versionTypeMeta
} from '../lib'

const modCategories = [
  {
    title: '性能优化',
    copy: '让每一帧都更顺滑。Sodium、Lithium 等帧率利器。',
    tags: ['Sodium', 'Lithium'],
    icon: <Zap size={20} />,
    accent: '#c8ff62',
    className: 'cat-lime'
  },
  {
    title: '光影视觉',
    copy: '把方块世界变成电影画面。Iris 光影与资源包搭配。',
    tags: ['Iris', 'Shaders'],
    icon: <Sparkles size={20} />,
    accent: '#8fd8ff',
    className: 'cat-blue'
  },
  {
    title: '冒险世界',
    copy: '新的群系、遗迹与敌人。让每一次出发都有未知。',
    tags: ['Create', 'Terralith'],
    icon: <Compass size={20} />,
    accent: '#ffb36b',
    className: 'cat-orange'
  },
  {
    title: '生活实用',
    copy: '合成查询、小地图、背包整理，把时间留给探索。',
    tags: ['JEI', 'Xaero'],
    icon: <Wrench size={20} />,
    accent: '#c4a7ff',
    className: 'cat-purple'
  }
]

export function HomePage(): React.JSX.Element {
  const {
    activeAccount,
    settings,
    manifest,
    manifestLoading,
    installed,
    installedMods,
    selectedVersionId,
    selectedRemote,
    selectedInstalled,
    running,
    tasks,
    setPage,
    selectVersion,
    refreshManifest,
    refreshInstalled,
    launchVersion,
    stopGame,
    toast
  } = useApp()
  const [refreshing, setRefreshing] = useState(false)

  const busy = tasks.some(
    (task) => task.status === 'running' && (task.kind === 'install' || task.kind === 'launch')
  )
  const isRunning = !!running
  const remoteNotInstalled = !selectedInstalled && !!selectedVersionId
  const selectedType = selectedInstalled?.type ?? selectedRemote?.type ?? 'release'
  const selectedDate = selectedInstalled?.releaseTime ?? selectedRemote?.releaseTime
  const typeMeta = versionTypeMeta[selectedType] ?? versionTypeMeta.release
  const selectedLoader = selectedInstalled?.loader ?? loaderFromVersionId(selectedVersionId)
  const launchLabel = !activeAccount
    ? '登录后开始'
    : isRunning
      ? '结束游戏'
      : remoteNotInstalled
        ? '下载并开始'
        : '开始游戏'
  const enabledMods = installedMods.filter((mod) => mod.enabled).length

  const picks = useMemo(() => {
    if (!manifest) return []
    const wanted = [
      manifest.latest.release,
      manifest.latest.snapshot,
      '1.20.1',
      '1.12.2',
      '1.8.9'
    ]
    const result: RemoteVersion[] = []
    for (const id of wanted) {
      const version = manifest.versions.find((entry) => entry.id === id)
      if (version && !result.some((entry) => entry.id === id)) result.push(version)
    }
    for (const version of manifest.versions.filter((entry) => entry.type === 'release')) {
      if (result.length >= 4) break
      if (!result.some((entry) => entry.id === version.id)) result.push(version)
    }
    return result.slice(0, 4)
  }, [manifest])

  const handleLaunch = (): void => {
    if (busy) return
    if (!activeAccount) {
      setPage('accounts')
      toast('登录一个账户后即可开始游戏', 'error')
      return
    }
    if (isRunning) {
      void stopGame()
      return
    }
    if (!selectedVersionId) {
      toast('请先选择一个游戏版本', 'error')
      return
    }
    void launchVersion(selectedVersionId)
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await Promise.all([refreshManifest(true), refreshInstalled()])
    setRefreshing(false)
  }

  const installedPreview = useMemo(() => {
    const byBase = new Map<string, (typeof installed)[number]>()
    for (const version of installed) {
      const key = version.baseVersion ?? version.id
      const existing = byBase.get(key)
      if (
        !existing ||
        version.id === selectedVersionId ||
        (existing.loader === 'vanilla' && version.loader !== 'vanilla')
      ) {
        byBase.set(key, version)
      }
    }
    return [...byBase.values()]
      .sort((a, b) => Number(b.id === selectedVersionId) - Number(a.id === selectedVersionId))
      .slice(0, 3)
  }, [installed, selectedVersionId])

  return (
    <div className="page home-page">
      <div className="home-topline">
        <div>
          <div className="eyebrow">DASHBOARD / 方块工坊</div>
          <h2 className="home-greeting">
            {greeting()}，{activeAccount?.name ?? '冒险家'}
          </h2>
          <p className="home-date">
            {new Intl.DateTimeFormat('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            }).format(new Date())}
            <span className="dot-sep">·</span>
            {isRunning ? '世界运行中' : '准备好开始新的旅程了吗？'}
          </p>
        </div>
        <div className="home-topline-actions">
          <span className="source-pill">
            <Globe2 size={14} />
            {downloadSourceLabel(settings.downloadSource)}
          </span>
          <button className="icon-btn" onClick={() => void refresh()} title="刷新版本数据">
            {refreshing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          </button>
          <button className="account-pill" onClick={() => setPage('accounts')}>
            <span className={`presence-dot ${activeAccount ? 'is-online' : ''}`} />
            {activeAccount
              ? activeAccount.type === 'microsoft'
                ? '正版已连接'
                : '离线模式'
              : '未登录'}
          </button>
        </div>
      </div>

      <section className="hero-panel">
        <div className="hero-glow" />
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-line" />
            <span>MINECRAFT JAVA EDITION</span>
            <span className="hero-edition-tag">1.0</span>
          </div>
          <h1>
            下一段旅程，
            <br />
            <em>从一块方块开始。</em>
          </h1>
          <p className="hero-sub">
            正版微软登录、官方与国内镜像双源下载，Fabric / Forge 一键装配。
            <br />
            你的世界，只差一次点击。
          </p>

          <div className="hero-controls">
            <VersionPicker onManage={() => setPage('versions')} />
            <button
              className={`launch-btn ${isRunning ? 'is-running' : ''} ${!activeAccount ? 'needs-login' : ''}`}
              onClick={handleLaunch}
              disabled={busy}
            >
              <span className="launch-btn-icon">
                {busy ? (
                  <Spinner size={17} color="#0b1610" />
                ) : isRunning ? (
                  <Square size={16} fill="currentColor" />
                ) : !activeAccount ? (
                  <LogIn size={18} />
                ) : remoteNotInstalled ? (
                  <Download size={18} />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </span>
              <span className="launch-btn-copy">
                <strong>{busy ? '准备中…' : launchLabel}</strong>
                <small>
                  {isRunning
                    ? running?.versionId
                    : remoteNotInstalled
                      ? `${selectedVersionId} · 首次安装`
                      : selectedInstalled
                        ? selectedInstalled.loader === 'vanilla'
                          ? `${formatBytes(selectedInstalled.sizeBytes)} · 原版`
                          : `${loaderMeta[selectedLoader].label}${
                              selectedInstalled.loaderVersion
                                ? ` ${selectedInstalled.loaderVersion}`
                                : ''
                            }`
                        : '选择版本'}
                </small>
              </span>
              <span className="launch-btn-arrow">
                <ChevronRight size={18} />
              </span>
            </button>
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <span className="meta-swatch" style={{ background: typeMeta.color }} />
              <div>
                <span>所选版本</span>
                <strong>
                  {selectedInstalled?.baseVersion ?? (selectedVersionId || '—')}
                  <span className="meta-inline">{typeMeta.label}</span>
                </strong>
              </div>
            </div>
            <div className="hero-meta-divider" />
            <div className="hero-meta-item">
              <CircleDot size={14} style={{ color: selectedInstalled ? '#9df7b3' : '#ffc46b' }} />
              <div>
                <span>安装状态</span>
                <strong>{selectedInstalled ? '文件已就绪' : '尚未安装'}</strong>
              </div>
            </div>
            <div className="hero-meta-divider" />
            <div className="hero-meta-item">
              <Cpu size={14} style={{ color: '#9fd8ff' }} />
              <div>
                <span>运行内存</span>
                <strong>{(settings.memoryMb / 1024).toFixed(0)} GB 上限</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <HeroArt />
          <div className="hero-version-chip">
            <span className="chip-kicker">{typeMeta.label}</span>
            <strong>{selectedInstalled?.baseVersion ?? (selectedVersionId || '—')}</strong>
            <span>{formatDate(selectedDate)}</span>
            <LoaderBadge kind={selectedLoader as LoaderKind} size="sm" ghost />
          </div>
        </div>
      </section>

      <div className="home-split">
        <section className="panel quick-panel">
          <SectionHead
            title="继续游戏"
            note={installed.length ? `${installed.length} 个版本已安装` : '还没有安装游戏'}
            action={
              <button className="text-action" onClick={() => setPage('versions')}>
                全部版本 <ArrowUpRight size={14} />
              </button>
            }
          />
          {installedPreview.length ? (
            <div className="quick-list">
              {installedPreview.map((version) => {
                const active = version.id === selectedVersionId
                const meta = loaderMeta[version.loader]
                return (
                  <button
                    key={version.id}
                    className={`quick-version ${active ? 'is-active' : ''}`}
                    onClick={() => selectVersion(version.id)}
                  >
                    <span className="quick-version-mark" style={{ background: `${meta.color}18` }}>
                      <span style={{ background: meta.color }} />
                    </span>
                    <span className="quick-version-copy">
                      <span className="quick-version-title">
                        {version.baseVersion ?? version.id}
                        <LoaderBadge kind={version.loader} size="sm" />
                      </span>
                      <small>
                        {version.loader === 'vanilla'
                          ? `原版客户端 · ${formatBytes(version.sizeBytes)}`
                          : `${meta.label}${version.loaderVersion ? ` ${version.loaderVersion}` : ''}`}
                      </small>
                    </span>
                    <span className="quick-version-play" onClick={(event) => {
                      event.stopPropagation()
                      void launchVersion(version.id)
                    }}>
                      {running?.versionId === version.id ? (
                        <span className="running-pulse" />
                      ) : (
                        <Play size={14} fill="currentColor" />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="quick-empty">
              <span className="quick-empty-icon">
                <CloudDownload size={22} />
              </span>
              <div>
                <strong>安装你的第一个版本</strong>
                <span>官方与国内镜像随心切换，历史版本也在这里。</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage('versions')}>
                浏览版本 <ChevronRight size={14} />
              </button>
            </div>
          )}
        </section>

        <section className="panel status-panel">
          <SectionHead
            title="工作台状态"
            note="所有组件均在本机运行"
            action={
              <button className="icon-btn" onClick={() => setPage('settings')} title="设置">
                <Wrench size={15} />
              </button>
            }
          />
          <div className="status-rows">
            <div className="status-row">
              <span className="status-icon">
                <Gamepad2 size={16} />
              </span>
              <div>
                <span>账户</span>
                <strong>{activeAccount ? activeAccount.name : '未登录'}</strong>
              </div>
              <span className={`status-chip ${activeAccount ? 'is-good' : 'is-warn'}`}>
                {activeAccount
                  ? activeAccount.type === 'microsoft'
                    ? '正版'
                    : '离线'
                  : '需要登录'}
              </span>
            </div>
            <div className="status-row">
              <span className="status-icon">
                <Layers3 size={16} />
              </span>
              <div>
                <span>游戏版本</span>
                <strong>{installed.length} 个可用</strong>
              </div>
              <span className="status-chip">{installed.filter((v) => v.loader !== 'vanilla').length} 加载器</span>
            </div>
            <div className="status-row">
              <span className="status-icon">
                <Boxes size={16} />
              </span>
              <div>
                <span>已装模组</span>
                <strong>{installedMods.length ? `${enabledMods} 启用` : '暂无模组'}</strong>
              </div>
              <span className="status-chip">{installedMods.length} 文件</span>
            </div>
            <div className="status-row">
              <span className="status-icon">
                <FolderOpen size={16} />
              </span>
              <div>
                <span>游戏目录</span>
                <strong className="path-ellipsis">{settings.gameDir || '未设置'}</strong>
              </div>
              <button
                className="mini-link"
                onClick={() => void window.blockdeck.settings.openGameDir()}
              >
                打开
              </button>
            </div>
          </div>
        </section>
      </div>

      <section>
        <SectionHead
          title="版本速览"
          note="官方版本清单 · 正式版与快照"
          action={
            <button className="text-action" onClick={() => setPage('versions')}>
              打开版本库 <ArrowUpRight size={14} />
            </button>
          }
        />
        <div className="version-spotlight-grid">
          {manifestLoading && !picks.length
            ? [0, 1, 2, 3].map((index) => <div className="version-spot skeleton" key={index} />)
            : picks.map((version, index) => {
                const meta = versionTypeMeta[version.type] ?? versionTypeMeta.release
                const isInstalled = installed.some((entry) => entry.id === version.id)
                return (
                  <button
                    key={version.id}
                    className={`version-spot version-spot-${index % 4}`}
                    onClick={() => {
                      selectVersion(version.id)
                      setPage('versions')
                    }}
                  >
                    <div className="version-spot-top">
                      <span className="version-spot-badge" style={{ color: meta.color, background: meta.background }}>
                        {meta.label}
                      </span>
                      {isInstalled ? <span className="installed-dot">已安装</span> : null}
                    </div>
                    <strong className="version-spot-id">{version.id}</strong>
                    <span className="version-spot-date">{formatDate(version.releaseTime)}</span>
                    <span className="version-spot-cta">
                      {isInstalled ? '查看版本' : '选择并安装'} <ArrowUpRight size={14} />
                    </span>
                    {index === 0 ? <span className="spot-watermark">LATEST</span> : null}
                  </button>
                )
              })}
        </div>
      </section>

      <section>
        <SectionHead
          title="为世界加点料"
          note="从 Modrinth 发现社区作品"
          action={
            <button className="text-action" onClick={() => setPage('mods')}>
              模组工坊 <ArrowUpRight size={14} />
            </button>
          }
        />
        <div className="mod-category-grid">
          {modCategories.map((category) => (
            <button
              key={category.title}
              className={`mod-category ${category.className}`}
              onClick={() => setPage('mods')}
            >
              <div className="mod-category-icon" style={{ color: category.accent }}>
                {category.icon}
              </div>
              <div className="mod-category-copy">
                <strong>{category.title}</strong>
                <p>{category.copy}</p>
                <div className="mod-category-tags">
                  {category.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <ArrowUpRight size={16} className="mod-category-arrow" />
            </button>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <div>
          <span className="signal-dot" />
          BlockDeck 本机运行 · 不收集账户信息
        </div>
        <div>
          <span>{formatNumber(manifest?.versions.length ?? 0)} 个可下载版本</span>
          <span className="dot-sep">·</span>
          <span>数据来自 Mojang / Modrinth</span>
        </div>
      </footer>
    </div>
  )
}
