import React, { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Coffee,
  Cpu,
  FolderOpen,
  Gauge,
  Globe2,
  HardDrive,
  Info,
  Layers3,
  Loader2,
  MemoryStick,
  MonitorCog,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Zap
} from 'lucide-react'
import type { JavaInfo } from '@shared/types'
import { useApp } from '../store'
import { PageHeader } from '../components/Page'
import { Spinner } from '../components/Bits'
import { downloadSourceLabel } from '../lib'

function Toggle({
  checked,
  onChange,
  disabled = false
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
    >
      <span />
    </button>
  )
}

function SettingRow({
  icon,
  title,
  description,
  children,
  stacked = false
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
  stacked?: boolean
}): React.JSX.Element {
  return (
    <div className={`setting-row ${stacked ? 'is-stacked' : ''}`}>
      <span className="setting-icon">{icon}</span>
      <div className="setting-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const { settings, appInfo, saveSettings, runTask, toast, openLogs, refreshInstalled } = useApp()
  const [memory, setMemory] = useState(settings.memoryMb)
  const [runtimes, setRuntimes] = useState<{
    managed: JavaInfo[]
    system: JavaInfo[]
    custom: JavaInfo | null
  } | null>(null)
  const [detecting, setDetecting] = useState(false)
  const memoryInitialized = useRef(false)

  useEffect(() => {
    setMemory(settings.memoryMb)
  }, [settings.memoryMb])

  useEffect(() => {
    if (!memoryInitialized.current) {
      memoryInitialized.current = true
      return
    }
    const timer = window.setTimeout(() => {
      if (memory !== settings.memoryMb) void saveSettings({ memoryMb: memory })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [memory, saveSettings, settings.memoryMb])

  const detect = async (): Promise<void> => {
    setDetecting(true)
    try {
      setRuntimes(await window.blockdeck.java.detect())
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setDetecting(false)
    }
  }

  useEffect(() => {
    void detect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gameDir, settings.javaPath])

  const chooseGameDir = async (): Promise<void> => {
    const dir = await window.blockdeck.settings.chooseGameDir()
    if (!dir) return
    await saveSettings({ gameDir: dir })
    await refreshInstalled()
    toast('游戏目录已更新', 'success')
  }

  const chooseJava = async (): Promise<void> => {
    const file = await window.blockdeck.settings.chooseJava()
    if (!file) return
    await saveSettings({ javaPath: file })
    toast('Java 路径已更新', 'success')
  }

  const installJava = async (major: number): Promise<void> => {
    const result = await runTask({ title: `安装 Java ${major}`, kind: 'java' }, (taskId) =>
      window.blockdeck.java.install(major, taskId)
    )
    if (result) await detect()
  }

  const sourceOptions = [
    {
      value: 'auto' as const,
      title: '自动优选',
      desc: '国内镜像优先，失败自动回退官方',
      icon: <Zap size={18} />
    },
    {
      value: 'mirror' as const,
      title: '国内镜像',
      desc: 'BMCLAPI 加速，适合国内网络',
      icon: <Server size={18} />
    },
    {
      value: 'official' as const,
      title: '官方源',
      desc: 'Mojang 官方 CDN，全球通用',
      icon: <Globe2 size={18} />
    }
  ]

  const allJavas = runtimes
    ? [
        ...(runtimes.custom ? [runtimes.custom] : []),
        ...runtimes.managed,
        ...runtimes.system
      ].filter(
        (java, index, array) => array.findIndex((entry) => entry.path === java.path) === index
      )
    : []

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow="PREFERENCES / 设置"
        title="把它，调成你的样子"
        subtitle="所有设置立即生效，保存在本机。"
        actions={
          <span className="autosave-pill">
            <Check size={13} /> 自动保存
          </span>
        }
      />

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-section panel">
            <div className="settings-section-head">
              <span className="settings-section-icon">
                <HardDrive size={18} />
              </span>
              <div>
                <h2>游戏与文件</h2>
                <p>版本、存档、模组与资源文件的位置。</p>
              </div>
            </div>
            <div className="setting-list">
              <SettingRow
                icon={<FolderOpen size={17} />}
                title="游戏目录"
                description="版本、assets、libraries、mods 与存档都会放在这里。"
                stacked
              >
                <div className="path-control">
                  <code title={settings.gameDir}>{settings.gameDir || '未设置'}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => void chooseGameDir()}>
                    浏览
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => void window.blockdeck.settings.openGameDir()}
                    title="打开目录"
                  >
                    <FolderOpen size={15} />
                  </button>
                </div>
              </SettingRow>
              <SettingRow
                icon={<MemoryStick size={17} />}
                title="启动器数据目录"
                description="账户加密文件、缓存和运行日志保存在此处。"
                stacked
              >
                <div className="path-control">
                  <code title={appInfo?.dataDir}>{appInfo?.dataDir ?? '—'}</code>
                  <button
                    className="icon-btn"
                    onClick={() =>
                      appInfo?.dataDir ? void window.blockdeck.app.openPath(appInfo.dataDir) : undefined
                    }
                    title="打开数据目录"
                  >
                    <FolderOpen size={15} />
                  </button>
                </div>
              </SettingRow>
              <SettingRow
                icon={<Terminal size={17} />}
                title="运行日志"
                description="安装器、下载与游戏进程的实时输出。"
              >
                <button className="btn btn-ghost btn-sm" onClick={openLogs}>
                  查看日志 <ChevronRight size={14} />
                </button>
              </SettingRow>
            </div>
          </section>

          <section className="settings-section panel">
            <div className="settings-section-head">
              <span className="settings-section-icon">
                <Gauge size={18} />
              </span>
              <div>
                <h2>性能与启动</h2>
                <p>为整合包留出足够的内存，同时保持启动迅速。</p>
              </div>
            </div>
            <div className="setting-list">
              <SettingRow
                icon={<MemoryStick size={17} />}
                title="游戏内存上限"
                description="大型整合包建议 6–8 GB；原版 2–4 GB 足够。"
              >
                <div className="range-control">
                  <input
                    type="range"
                    min={1024}
                    max={16384}
                    step={512}
                    value={memory}
                    onChange={(event) => setMemory(Number(event.target.value))}
                    style={
                      {
                        '--range-progress': `${((memory - 1024) / (16384 - 1024)) * 100}%`
                      } as React.CSSProperties
                    }
                  />
                  <span className="range-value">{(memory / 1024).toFixed(1)} GB</span>
                </div>
              </SettingRow>
              <SettingRow
                icon={<SlidersHorizontal size={17} />}
                title="并行下载数"
                description="同时下载的文件数量，网络较慢时可适当调低。"
              >
                <div className="segmented compact-seg">
                  {[4, 8, 12, 16].map((value) => (
                    <button
                      key={value}
                      className={settings.maxConcurrent === value ? 'is-active' : ''}
                      onClick={() => void saveSettings({ maxConcurrent: value })}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </SettingRow>
              <SettingRow
                icon={<MonitorCog size={17} />}
                title="启动后最小化"
                description="点击开始游戏后自动收起启动器窗口。"
              >
                <Toggle
                  checked={settings.minimizeOnLaunch}
                  onChange={(value) => void saveSettings({ minimizeOnLaunch: value })}
                />
              </SettingRow>
            </div>
          </section>

          <section className="settings-section panel">
            <div className="settings-section-head">
              <span className="settings-section-icon">
                <Globe2 size={18} />
              </span>
              <div>
                <h2>下载源</h2>
                <p>游戏本体、资源与库文件将从所选源优先获取。</p>
              </div>
            </div>
            <div className="source-cards">
              {sourceOptions.map((option) => (
                <button
                  key={option.value}
                  className={`source-card ${settings.downloadSource === option.value ? 'is-active' : ''}`}
                  onClick={() => void saveSettings({ downloadSource: option.value })}
                >
                  <span className="source-card-icon">{option.icon}</span>
                  <span className="source-card-copy">
                    <strong>{option.title}</strong>
                    <small>{option.desc}</small>
                  </span>
                  <span className="source-radio">
                    {settings.downloadSource === option.value ? <span /> : null}
                  </span>
                </button>
              ))}
            </div>
            <div className="source-note">
              <Info size={14} />
              当前使用「{downloadSourceLabel(settings.downloadSource)}」。即使选择镜像，缺失文件也会自动回退官方源。
            </div>
          </section>
        </div>

        <aside className="settings-side">
          <section className="settings-section panel java-panel">
            <div className="settings-section-head compact">
              <span className="settings-section-icon">
                <Cpu size={18} />
              </span>
              <div>
                <h2>Java 运行时</h2>
                <p>启动游戏与安装器所需的运行环境。</p>
              </div>
            </div>

            <SettingRow
              icon={<Coffee size={17} />}
              title="自动下载 Java"
              description="缺少匹配版本时自动安装 Temurin JRE。"
            >
              <Toggle
                checked={settings.autoJava}
                onChange={(value) => void saveSettings({ autoJava: value })}
              />
            </SettingRow>

            <div className="java-custom">
              <div className="java-custom-head">
                <span>指定 Java 路径</span>
                <button className="mini-link" onClick={() => void chooseJava()}>
                  浏览
                </button>
              </div>
              <code title={settings.javaPath}>{settings.javaPath || '自动检测（推荐）'}</code>
            </div>

            <div className="java-detect-head">
              <span>检测到的运行时</span>
              <button className="mini-link" onClick={() => void detect()} disabled={detecting}>
                {detecting ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                重新检测
              </button>
            </div>
            <div className="java-list">
              {detecting && !runtimes ? (
                <div className="java-loading">
                  <Spinner size={15} /> 正在检测…
                </div>
              ) : allJavas.length ? (
                allJavas.map((java) => (
                  <div className="java-row" key={java.path}>
                    <span className="java-row-mark">J{java.major}</span>
                    <div>
                      <strong>
                        Java {java.major}
                        <span className="java-source-tag">
                          {java.source === 'managed'
                            ? '托管'
                            : java.source === 'custom'
                              ? '自定义'
                              : '系统'}
                        </span>
                      </strong>
                      <span title={java.path}>{java.path}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="java-empty">未检测到 Java，将在需要时自动下载。</div>
              )}
            </div>
            <div className="java-install">
              <span>快速安装</span>
              <div>
                {[8, 17, 21, 25].map((major) => (
                  <button key={major} className="java-chip" onClick={() => void installJava(major)}>
                    Java {major}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="about-card">
            <div className="about-head">
              <span className="about-mark">
                <ShieldCheck size={19} />
              </span>
              <div>
                <strong>BlockDeck</strong>
                <span>方块工坊启动器</span>
              </div>
              <span className="about-version">v{appInfo?.version ?? '1.1.0'}</span>
            </div>
            <div className="about-grid">
              <span>Electron</span>
              <code>{appInfo?.electron ?? '—'}</code>
              <span>Chromium</span>
              <code>{appInfo?.chrome ?? '—'}</code>
              <span>Node</span>
              <code>{appInfo?.node ?? '—'}</code>
              <span>平台</span>
              <code>{appInfo?.platform ?? '—'}</code>
            </div>
            <p>
              本地优先的 Minecraft Java 版启动器。正版登录、双源下载、模组加载器与 Modrinth
              模组管理，一站式完成。
            </p>
            <div className="about-foot">
              <span className="signal-dot" />
              不收集用户数据 · 令牌本地加密
            </div>
          </section>

          <div className="settings-tip">
            <Sparkles size={16} />
            <div>
              <strong>小提示</strong>
              <span>首次启动大型整合包时，给 Java 预热几秒是正常的。</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
