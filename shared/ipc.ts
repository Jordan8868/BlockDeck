import type {
  AccountState,
  AppInfo,
  GameExitEvent,
  InstalledMod,
  InstalledVersion,
  JavaInfo,
  LauncherSettings,
  LaunchOptions,
  LaunchResult,
  LoaderInfo,
  LoaderInstallRequest,
  LoaderKind,
  LoaderOptions,
  LogEvent,
  ModInstallResult,
  ModSearchResult,
  ModpackImportResult,
  ProgressEvent,
  RoomHostOptions,
  RoomJoinOptions,
  RoomStatus,
  SavedServer,
  ServerPingResult,
  VersionManifest
} from './types'

export interface ModSearchParams {
  query: string
  gameVersion?: string
  loader?: string
  offset?: number
  limit?: number
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
}

export interface BlockDeckApi {
  app: {
    info: () => Promise<AppInfo>
    openExternal: (url: string) => Promise<void>
    openPath: (target: string) => Promise<void>
    revealPath: (target: string) => Promise<void>
    recentLogs: () => Promise<LogEvent[]>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
  settings: {
    get: () => Promise<LauncherSettings>
    update: (patch: Partial<LauncherSettings>) => Promise<LauncherSettings>
    chooseGameDir: () => Promise<string | null>
    chooseJava: () => Promise<string | null>
    chooseBackground: () => Promise<string | null>
    openGameDir: () => Promise<void>
  }
  accounts: {
    state: () => Promise<AccountState>
    loginMicrosoft: () => Promise<AccountState>
    loginOffline: (name: string) => Promise<AccountState>
    remove: (id: string) => Promise<AccountState>
    setActive: (id: string) => Promise<AccountState>
    applySkin: (id: string, model: 'classic' | 'slim') => Promise<AccountState>
    clearSkin: (id: string) => Promise<AccountState>
  }
  versions: {
    manifest: (force?: boolean) => Promise<VersionManifest>
    installed: () => Promise<InstalledVersion[]>
    install: (versionId: string, taskId: string) => Promise<void>
    remove: (versionId: string) => Promise<void>
    loaders: (mcVersion: string, kind: LoaderKind) => Promise<LoaderOptions>
    installLoader: (request: LoaderInstallRequest, taskId: string) => Promise<{ versionId: string }>
    importModpack: (baseVersionId: string | undefined, taskId: string) => Promise<ModpackImportResult>
    loaderInfo: () => Promise<LoaderInfo[]>
    openFolder: (versionId: string) => Promise<void>
  }
  java: {
    detect: () => Promise<{ managed: JavaInfo[]; system: JavaInfo[]; custom: JavaInfo | null }>
    install: (major: number, taskId: string) => Promise<JavaInfo>
  }
  mods: {
    search: (params: ModSearchParams) => Promise<ModSearchResult>
    install: (
      projectId: string,
      gameVersion: string,
      loader: string,
      versionId: string | undefined,
      taskId: string
    ) => Promise<ModInstallResult>
    installed: (versionId?: string) => Promise<InstalledMod[]>
    toggle: (fileName: string, enabled: boolean, versionId?: string) => Promise<void>
    remove: (fileName: string, versionId?: string) => Promise<void>
    openFolder: (versionId?: string) => Promise<void>
  }
  servers: {
    list: () => Promise<SavedServer[]>
    add: (input: { name: string; host: string; port: number; versionId?: string }) => Promise<SavedServer[]>
    update: (
      id: string,
      patch: Partial<Pick<SavedServer, 'name' | 'host' | 'port' | 'versionId'>>
    ) => Promise<SavedServer[]>
    remove: (id: string) => Promise<SavedServer[]>
    ping: (host: string, port: number) => Promise<ServerPingResult>
    touch: (id: string) => Promise<SavedServer[]>
  }
  rooms: {
    status: () => Promise<RoomStatus>
    startHost: (options: RoomHostOptions) => Promise<RoomStatus>
    stopHost: () => Promise<RoomStatus>
    join: (options: RoomJoinOptions) => Promise<RoomStatus>
    leave: () => Promise<RoomStatus>
    lanAddress: () => Promise<{ address: string; interfaces: Array<{ name: string; address: string }> }>
    protocol: () => Promise<{
      name: string
      version: number
      keyExchange: string
      kdf: string
      cipher: string
      handshakeAuth: string
      replayProtection: string
      forwardSecrecy: boolean
    }>
  }
  launch: {
    start: (options: LaunchOptions, taskId: string) => Promise<LaunchResult>
    stop: () => Promise<void>
    status: () => Promise<{ versionId: string; pid: number; startedAt: number } | null>
  }
  events: {
    onProgress: (callback: (event: ProgressEvent) => void) => () => void
    onLog: (callback: (event: LogEvent) => void) => () => void
    onGameExit: (callback: (event: GameExitEvent) => void) => () => void
    onMaximize: (callback: (maximized: boolean) => void) => () => void
    onRoomStatus: (callback: (status: RoomStatus) => void) => () => void
  }
}
