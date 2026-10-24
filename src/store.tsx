import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AccountState,
  AppInfo,
  InstalledMod,
  InstalledVersion,
  LauncherSettings,
  LaunchResult,
  LoaderInfo,
  LogEvent,
  PageId,
  ProgressEvent,
  PublicAccount,
  RemoteVersion,
  VersionManifest
} from '@shared/types'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  kind: ToastKind
}

export type TaskKind = 'install' | 'loader' | 'mod' | 'java' | 'launch'

export interface Task {
  id: string
  title: string
  kind: TaskKind
  stage: string
  message: string
  percent: number
  status: 'running' | 'done' | 'error'
  startedAt: number
  error?: string
}

export interface LaunchState {
  versionId: string
  pid: number
  startedAt: number
}

interface RunTaskOptions {
  title: string
  kind: TaskKind
}

interface AppContextValue {
  ready: boolean
  settings: LauncherSettings
  appInfo: AppInfo | null
  accountState: AccountState
  activeAccount: PublicAccount | null
  manifest: VersionManifest | null
  manifestLoading: boolean
  installed: InstalledVersion[]
  installedLoading: boolean
  selectedVersionId: string
  selectedRemote: RemoteVersion | null
  selectedInstalled: InstalledVersion | null
  selectedBaseVersion: string
  running: LaunchState | null
  tasks: Task[]
  logs: LogEvent[]
  logsOpen: boolean
  page: PageId
  loaderInfo: LoaderInfo[]
  setPage: (page: PageId) => void
  selectVersion: (id: string) => void
  refreshInstalled: () => Promise<InstalledVersion[]>
  refreshManifest: (force?: boolean) => Promise<VersionManifest | null>
  refreshAccounts: () => Promise<void>
  saveSettings: (patch: Partial<LauncherSettings>) => Promise<LauncherSettings>
  loginMicrosoft: () => Promise<boolean>
  loginOffline: (name: string) => Promise<boolean>
  removeAccount: (id: string) => Promise<void>
  setActiveAccount: (id: string) => Promise<void>
  runTask: <T>(
    options: RunTaskOptions,
    action: (taskId: string) => Promise<T>
  ) => Promise<T | null>
  launchVersion: (
    versionId?: string,
    options?: { serverAddress?: string; title?: string }
  ) => Promise<void>
  stopGame: () => Promise<void>
  openLogs: () => void
  closeLogs: () => void
  clearLogs: () => void
  toast: (message: string, kind?: ToastKind) => void
  removeToast: (id: string) => void
  refreshMods: () => Promise<InstalledMod[]>
  installedMods: InstalledMod[]
}

const initialSettings: LauncherSettings = {
  gameDir: '',
  javaPath: '',
  autoJava: true,
  memoryMb: 4096,
  downloadSource: 'auto',
  maxConcurrent: 8,
  minimizeOnLaunch: false,
  showSnapshots: false
}

const initialAccountState: AccountState = { accounts: [], activeId: null }

const AppContext = createContext<AppContextValue | null>(null)

export function cleanError(err: unknown): string {
  let message = err instanceof Error ? err.message : String(err)
  message = message.replace(/^Error invoking remote method '[^']+':\s*/i, '')
  message = message.replace(/^Error:\s*/i, '')
  return message
}

function taskPercent(event: Omit<ProgressEvent, 'taskId'>): number {
  if (event.totalBytes && event.totalBytes > 0 && event.bytes != null) {
    return Math.max(0, Math.min(100, (event.bytes / event.totalBytes) * 100))
  }
  if (event.total && event.total > 0 && event.current != null) {
    return Math.max(0, Math.min(100, (event.current / event.total) * 100))
  }
  return 0
}

export function LauncherProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<LauncherSettings>(initialSettings)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [accountState, setAccountState] = useState<AccountState>(initialAccountState)
  const [manifest, setManifest] = useState<VersionManifest | null>(null)
  const [manifestLoading, setManifestLoading] = useState(true)
  const [installed, setInstalled] = useState<InstalledVersion[]>([])
  const [installedLoading, setInstalledLoading] = useState(true)
  const [selectedVersionId, setSelectedVersionId] = useState('')
  const [running, setRunning] = useState<LaunchState | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [page, setPageState] = useState<PageId>('home')
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([])
  const [loaderInfo, setLoaderInfo] = useState<LoaderInfo[]>([])
  const [maximized, setMaximized] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const selectedRef = useRef(selectedVersionId)
  selectedRef.current = selectedVersionId
  const runningRef = useRef(running)
  runningRef.current = running
  const cleanupTimers = useRef<number[]>([])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }])
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 4200)
    cleanupTimers.current.push(timer)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const setPage = useCallback((next: PageId) => {
    setPageState(next)
    window.scrollTo({ top: 0 })
  }, [])

  const refreshAccounts = useCallback(async () => {
    const state = await window.blockdeck.accounts.state()
    setAccountState(state)
  }, [])

  const refreshInstalled = useCallback(async (): Promise<InstalledVersion[]> => {
    const list = await window.blockdeck.versions.installed()
    setInstalled(list)
    return list
  }, [])

  const refreshMods = useCallback(async (): Promise<InstalledMod[]> => {
    const mods = await window.blockdeck.mods.installed()
    setInstalledMods(mods)
    return mods
  }, [])

  const refreshManifest = useCallback(async (force = false): Promise<VersionManifest | null> => {
    setManifestLoading(true)
    try {
      const data = await window.blockdeck.versions.manifest(force)
      setManifest(data)
      return data
    } catch (err) {
      toast(cleanError(err), 'error')
      return null
    } finally {
      setManifestLoading(false)
    }
  }, [toast])

  const selectVersion = useCallback((id: string) => {
    if (!id) return
    setSelectedVersionId(id)
    localStorage.setItem('blockdeck:selected-version', id)
  }, [])

  const saveSettings = useCallback(
    async (patch: Partial<LauncherSettings>): Promise<LauncherSettings> => {
      const previous = settingsRef.current
      const optimistic = { ...previous, ...patch }
      setSettings(optimistic)
      try {
        const saved = await window.blockdeck.settings.update(patch)
        setSettings(saved)
        if (patch.gameDir && patch.gameDir !== previous.gameDir) {
          await refreshInstalled()
          setSelectedVersionId('')
          localStorage.removeItem('blockdeck:selected-version')
        }
        return saved
      } catch (err) {
        setSettings(previous)
        toast(cleanError(err), 'error')
        throw err
      }
    },
    [refreshInstalled, toast]
  )

  const runTask = useCallback(
    async <T,>(options: RunTaskOptions, action: (taskId: string) => Promise<T>): Promise<T | null> => {
      const id = crypto.randomUUID()
      const initial: Task = {
        id,
        title: options.title,
        kind: options.kind,
        stage: '准备中',
        message: '正在准备…',
        percent: 0,
        status: 'running',
        startedAt: Date.now()
      }
      setTasks((prev) => [...prev, initial])
      try {
        const result = await action(id)
        setTasks((prev) =>
          prev.map((task) =>
            task.id === id ? { ...task, status: 'done', percent: 100, message: '已完成' } : task
          )
        )
        toast(`${options.title} 完成`, 'success')
        const timer = window.setTimeout(() => {
          setTasks((prev) => prev.filter((task) => task.id !== id))
        }, 3800)
        cleanupTimers.current.push(timer)
        return result
      } catch (err) {
        const message = cleanError(err)
        setTasks((prev) =>
          prev.map((task) =>
            task.id === id ? { ...task, status: 'error', message, error: message } : task
          )
        )
        setLogsOpen(true)
        toast(message, 'error')
        return null
      }
    },
    [toast]
  )

  const loginMicrosoft = useCallback(async (): Promise<boolean> => {
    try {
      const state = await window.blockdeck.accounts.loginMicrosoft()
      setAccountState(state)
      toast('Microsoft 登录成功', 'success')
      return true
    } catch (err) {
      toast(cleanError(err), 'error')
      return false
    }
  }, [toast])

  const loginOffline = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const state = await window.blockdeck.accounts.loginOffline(name)
        setAccountState(state)
        toast(`离线档案 ${name} 已创建`, 'success')
        return true
      } catch (err) {
        toast(cleanError(err), 'error')
        return false
      }
    },
    [toast]
  )

  const removeAccount = useCallback(
    async (id: string): Promise<void> => {
      try {
        const state = await window.blockdeck.accounts.remove(id)
        setAccountState(state)
        toast('账户已移除')
      } catch (err) {
        toast(cleanError(err), 'error')
      }
    },
    [toast]
  )

  const setActiveAccount = useCallback(
    async (id: string): Promise<void> => {
      try {
        const state = await window.blockdeck.accounts.setActive(id)
        setAccountState(state)
      } catch (err) {
        toast(cleanError(err), 'error')
      }
    },
    [toast]
  )

  const activeAccount = useMemo(
    () => accountState.accounts.find((account) => account.id === accountState.activeId) ?? null,
    [accountState]
  )

  const selectedRemote = useMemo(
    () => manifest?.versions.find((version) => version.id === selectedVersionId) ?? null,
    [manifest, selectedVersionId]
  )
  const selectedInstalled = useMemo(
    () => installed.find((version) => version.id === selectedVersionId) ?? null,
    [installed, selectedVersionId]
  )
  const selectedBaseVersion = selectedInstalled?.baseVersion ?? selectedVersionId

  useEffect(() => {
    const unProgress = window.blockdeck.events.onProgress((event) => {
      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== event.taskId) return task
          const percent = event.done && event.error ? task.percent : taskPercent(event)
          return {
            ...task,
            stage: event.stage,
            message: event.done && event.error ? event.error : event.message,
            percent: Math.max(task.percent, percent)
          }
        })
      )
    })
    const unLog = window.blockdeck.events.onLog((event) => {
      setLogs((prev) => [...prev.slice(-1199), event])
    })
    const unExit = window.blockdeck.events.onGameExit((event) => {
      setRunning(null)
      if (event.crashed) toast('游戏异常退出，请查看日志', 'error')
      else toast('游戏已退出')
    })
    const unMax = window.blockdeck.events.onMaximize((value) => setMaximized(value))
    return () => {
      unProgress()
      unLog()
      unExit()
      unMax()
    }
  }, [toast])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [
        settingsResult,
        accountResult,
        manifestResult,
        installedResult,
        loaderResult,
        appResult,
        launchResult,
        modsResult
      ] = await Promise.allSettled([
        window.blockdeck.settings.get(),
        window.blockdeck.accounts.state(),
        window.blockdeck.versions.manifest(false),
        window.blockdeck.versions.installed(),
        window.blockdeck.versions.loaderInfo(),
        window.blockdeck.app.info(),
        window.blockdeck.launch.status(),
        window.blockdeck.mods.installed()
      ])
      if (cancelled) return
      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value)
      if (accountResult.status === 'fulfilled') setAccountState(accountResult.value)
      if (loaderResult.status === 'fulfilled') setLoaderInfo(loaderResult.value)
      if (appResult.status === 'fulfilled') setAppInfo(appResult.value)
      if (installedResult.status === 'fulfilled') setInstalled(installedResult.value)
      if (manifestResult.status === 'fulfilled') setManifest(manifestResult.value)
      if (launchResult.status === 'fulfilled' && launchResult.value) setRunning(launchResult.value)
      if (modsResult.status === 'fulfilled') setInstalledMods(modsResult.value)
      if (installedResult.status === 'fulfilled' || manifestResult.status === 'fulfilled') {
        const saved = localStorage.getItem('blockdeck:selected-version')
        const installedList =
          installedResult.status === 'fulfilled' ? installedResult.value : []
        const remoteList =
          manifestResult.status === 'fulfilled' ? manifestResult.value.versions : []
        const exists = (id: string): boolean =>
          installedList.some((version) => version.id === id) ||
          remoteList.some((version) => version.id === id)
        if (saved && exists(saved)) {
          setSelectedVersionId(saved)
        } else if (installedList.length) {
          setSelectedVersionId(installedList[0].id)
        } else if (manifestResult.status === 'fulfilled') {
          setSelectedVersionId(manifestResult.value.latest.release)
        }
      }
      const launchStatus = await window.blockdeck.launch.status().catch(() => null)
      if (launchStatus) setRunning(launchStatus)
      const recentLogs = await window.blockdeck.app.recentLogs().catch(() => [] as LogEvent[])
      if (recentLogs.length) {
        setLogs((current) => [...recentLogs, ...current].slice(-1200))
      }
      setManifestLoading(false)
      setInstalledLoading(false)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    void window.blockdeck.mods.installed().then(setInstalledMods).catch(() => undefined)
  }, [settings.gameDir])

  useEffect(() => {
    return () => {
      for (const timer of cleanupTimers.current) window.clearTimeout(timer)
    }
  }, [])

  const launchVersion = useCallback(
    async (
      versionId?: string,
      options?: { serverAddress?: string; title?: string }
    ): Promise<void> => {
      const id = versionId ?? selectedRef.current
      if (!id) return
      if (runningRef.current) {
        await window.blockdeck.launch.stop()
        setRunning(null)
        return
      }
      if (!activeAccount) {
        setPage('accounts')
        toast('请先登录一个账户', 'error')
        return
      }
      const currentlyInstalled = await window.blockdeck.versions.installed()
      const target = currentlyInstalled.find((version) => version.id === id)
      if (!target) {
        const installedOk = await runTask({ title: `安装 ${id}`, kind: 'install' }, (taskId) =>
          window.blockdeck.versions.install(id, taskId)
        )
        if (installedOk === null) return
        await refreshInstalled()
      }
      const result = await runTask(
        { title: options?.title ?? `启动 ${target?.name ?? id}`, kind: 'launch' },
        (taskId) =>
          window.blockdeck.launch.start(
            {
              versionId: id,
              accountId: activeAccount.id,
              memoryMb: settingsRef.current.memoryMb,
              width: 1280,
              height: 720,
              serverAddress: options?.serverAddress
            },
            taskId
          )
      )
      if (result) {
        const launch: LaunchResult = result
        setRunning({
          versionId: launch.versionId,
          pid: launch.pid ?? 0,
          startedAt: launch.launchedAt
        })
      }
    },
    [activeAccount, refreshInstalled, runTask, setPage, toast]
  )

  const stopGame = useCallback(async (): Promise<void> => {
    await window.blockdeck.launch.stop()
    setRunning(null)
  }, [])

  const value: AppContextValue = {
    ready,
    settings,
    appInfo,
    accountState,
    activeAccount,
    manifest,
    manifestLoading,
    installed,
    installedLoading,
    selectedVersionId,
    selectedRemote,
    selectedInstalled,
    selectedBaseVersion,
    running,
    tasks,
    logs,
    logsOpen,
    page,
    loaderInfo,
    setPage,
    selectVersion,
    refreshInstalled,
    refreshManifest,
    refreshAccounts,
    saveSettings,
    loginMicrosoft,
    loginOffline,
    removeAccount,
    setActiveAccount,
    runTask,
    launchVersion,
    stopGame,
    openLogs: () => setLogsOpen(true),
    closeLogs: () => setLogsOpen(false),
    clearLogs: () => setLogs([]),
    toast,
    removeToast,
    refreshMods,
    installedMods
  }

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toast-layer">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.kind}`} onClick={() => removeToast(item.id)}>
            <span className="toast-dot" />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
      <span className="window-max-state" data-maximized={maximized} />
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside LauncherProvider')
  return context
}
