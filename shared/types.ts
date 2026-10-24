export type DownloadSource = 'auto' | 'official' | 'mirror'

export interface LauncherSettings {
  gameDir: string
  javaPath: string
  autoJava: boolean
  memoryMb: number
  downloadSource: DownloadSource
  maxConcurrent: number
  minimizeOnLaunch: boolean
  showSnapshots: boolean
}

export type AccountType = 'microsoft' | 'offline'

export interface Account {
  id: string
  type: AccountType
  name: string
  uuid: string
  skinUrl?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  xuid?: string
  createdAt: number
}

export interface PublicAccount {
  id: string
  type: AccountType
  name: string
  uuid: string
  skinUrl?: string
  expired?: boolean
  createdAt: number
}

export interface AccountState {
  accounts: PublicAccount[]
  activeId: string | null
}

export type VersionType = 'release' | 'snapshot' | 'old_beta' | 'old_alpha'

export interface RemoteVersion {
  id: string
  type: VersionType
  releaseTime: string
  url: string
}

export interface VersionManifest {
  latest: { release: string; snapshot: string }
  versions: RemoteVersion[]
  source: DownloadSource
}

export type LoaderKind = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

export interface InstalledVersion {
  id: string
  name: string
  type: VersionType | 'modified'
  releaseTime?: string
  loader: LoaderKind
  baseVersion?: string
  loaderVersion?: string
  sizeBytes: number
}

export interface LoaderVersion {
  version: string
  label: string
  stable: boolean
  mcVersion?: string
}

export interface LoaderOptions {
  recommended?: string
  latest?: string
  versions: LoaderVersion[]
  note?: string
}

export interface LoaderInfo {
  kind: LoaderKind
  label: string
  tagline: string
  accent: string
  available: boolean
}

export interface JavaInfo {
  path: string
  version: string
  major: number
  source: 'system' | 'managed' | 'custom'
  matches?: boolean
}

export interface ProgressEvent {
  taskId: string
  stage: string
  message: string
  current?: number
  total?: number
  bytes?: number
  totalBytes?: number
  done?: boolean
  error?: string
}

export interface LogEvent {
  taskId?: string
  source: 'launcher' | 'game' | 'installer' | 'download' | 'room'
  line: string
  time: number
}

export interface SavedServer {
  id: string
  name: string
  host: string
  port: number
  versionId?: string
  createdAt: number
  lastPlayedAt?: number
}

export interface ServerPingResult {
  online: boolean
  host: string
  port: number
  latency?: number
  playersOnline?: number
  playersMax?: number
  versionName?: string
  motd?: string
  favicon?: string
  error?: string
  checkedAt: number
}

export type RoomRole = 'host' | 'client'

export interface RoomStatus {
  active: boolean
  role: RoomRole | null
  code?: string
  host?: string
  port?: number
  target?: string
  localAddress?: string
  fingerprint?: string
  connections: number
  startedAt?: number
  name?: string
  lastError?: string
}

export interface RoomHostOptions {
  targetHost: string
  targetPort: number
  listenPort?: number
  advertisedHost?: string
  name?: string
}

export interface RoomJoinOptions {
  code: string
  localPort?: number
}

export interface LanAddress {
  address: string
  interfaces: Array<{ name: string; address: string }>
}

export interface SecureProtocolInfo {
  name: string
  version: number
  keyExchange: string
  kdf: string
  cipher: string
  handshakeAuth: string
  replayProtection: string
  forwardSecrecy: boolean
}

export interface GameExitEvent {
  code: number | null
  crashed: boolean
  signal?: string | null
}

export interface ModSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl?: string
  downloads: number
  follows: number
  categories: string[]
  versions: string[]
  loaders: string[]
  dateModified: string
}

export interface ModSearchResult {
  hits: ModSearchHit[]
  totalHits: number
  offset: number
  limit: number
}

export interface InstalledMod {
  fileName: string
  projectId?: string
  projectTitle?: string
  size: number
  enabled: boolean
  path: string
}

export interface ModInstallResult {
  installed: string[]
  skipped: string[]
  projectTitle: string
  fileName: string
}

export interface AppInfo {
  version: string
  platform: string
  dataDir: string
  gameDir: string
  electron: string
  chrome: string
  node: string
}

export interface LaunchOptions {
  versionId: string
  accountId: string
  memoryMb?: number
  width?: number
  height?: number
  fullscreen?: boolean
  serverAddress?: string
}

export interface LaunchResult {
  pid?: number
  versionId: string
  javaPath: string
  launchedAt: number
}

export interface VersionFileCheck {
  installed: boolean
  complete: boolean
  missing: string[]
}

export type PageId = 'home' | 'versions' | 'multiplayer' | 'mods' | 'accounts' | 'settings'

export interface LoaderInstallRequest {
  mcVersion: string
  kind: LoaderKind
  loaderVersion?: string
}

export interface InstallModsRequest {
  projectId: string
  gameVersion: string
  loader: string
}

export interface ProgressReporter {
  (event: Omit<ProgressEvent, 'taskId'>): void
}
