import { safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Account, AccountState, LauncherSettings, PublicAccount } from '@shared/types'
import { getAccountsPath, getDefaultGameDir, getSettingsPath } from './paths'
import { ensureDir, readJson, writeJson } from './util'

const defaultSettings = (): LauncherSettings => ({
  gameDir: getDefaultGameDir(),
  javaPath: '',
  autoJava: true,
  memoryMb: 4096,
  downloadSource: 'auto',
  maxConcurrent: 8,
  minimizeOnLaunch: false,
  showSnapshots: false,
  versionIsolation: false,
  theme: 'lime',
  customBackground: '',
  backgroundDim: 0.72
})

interface StoredAccount extends Omit<Account, 'accessToken' | 'refreshToken'> {
  accessToken?: string
  refreshToken?: string
}

interface StoredAccountFile {
  activeId: string | null
  accounts: StoredAccount[]
}

let settingsCache: LauncherSettings | null = null
let accountsCache: StoredAccountFile | null = null

export async function getSettings(): Promise<LauncherSettings> {
  if (settingsCache) return settingsCache
  const stored = await readJson<Partial<LauncherSettings>>(getSettingsPath(), {})
  settingsCache = { ...defaultSettings(), ...stored }
  if (!settingsCache.gameDir) settingsCache.gameDir = getDefaultGameDir()
  await ensureDir(settingsCache.gameDir)
  await ensureDir(path.join(settingsCache.gameDir, 'versions'))
  return settingsCache
}

export async function updateSettings(patch: Partial<LauncherSettings>): Promise<LauncherSettings> {
  const current = await getSettings()
  const next: LauncherSettings = { ...current, ...patch }
  if (next.memoryMb < 512) next.memoryMb = 512
  if (next.memoryMb > 32768) next.memoryMb = 32768
  if (next.maxConcurrent < 1) next.maxConcurrent = 1
  if (next.maxConcurrent > 16) next.maxConcurrent = 16
  if (!['auto', 'official', 'mirror'].includes(next.downloadSource)) next.downloadSource = 'auto'
  if (!['lime', 'ocean', 'sunset', 'violet', 'sakura', 'mono'].includes(next.theme)) next.theme = 'lime'
  if (typeof next.customBackground !== 'string' || !next.customBackground.startsWith('data:image/')) {
    next.customBackground = ''
  }
  if (next.customBackground.length > 12 * 1024 * 1024) next.customBackground = ''
  next.backgroundDim = Math.max(0, Math.min(0.9, Number(next.backgroundDim) || 0.55))
  next.versionIsolation = Boolean(next.versionIsolation)
  settingsCache = next
  await writeJson(getSettingsPath(), next)
  if (next.gameDir) {
    await ensureDir(next.gameDir)
    await ensureDir(path.join(next.gameDir, 'versions'))
  }
  return next
}

function encryptSecret(value?: string): string | undefined {
  if (!value) return undefined
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `safe:${safeStorage.encryptString(value).toString('base64')}`
    }
  } catch {
    // fall through to plain storage
  }
  return `plain:${value}`
}

function decryptSecret(value?: string): string | undefined {
  if (!value) return undefined
  try {
    if (value.startsWith('safe:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'))
    }
    if (value.startsWith('plain:')) return value.slice(6)
    return value
  } catch {
    return undefined
  }
}

async function loadAccounts(): Promise<StoredAccountFile> {
  if (accountsCache) return accountsCache
  const raw = await readJson<{ activeId?: string | null; accounts?: StoredAccount[] }>(
    getAccountsPath(),
    { activeId: null, accounts: [] }
  )
  accountsCache = {
    activeId: raw.activeId ?? null,
    accounts: Array.isArray(raw.accounts)
      ? raw.accounts.map((account) => ({
          ...account,
          accessToken: decryptSecret(account.accessToken),
          refreshToken: decryptSecret(account.refreshToken)
        }))
      : []
  }
  if (
    accountsCache.activeId &&
    !accountsCache.accounts.some((account) => account.id === accountsCache?.activeId)
  ) {
    accountsCache.activeId = accountsCache.accounts[0]?.id ?? null
  }
  return accountsCache
}

async function saveAccounts(data: StoredAccountFile): Promise<void> {
  accountsCache = data
  const serializable: StoredAccountFile = {
    activeId: data.activeId,
    accounts: data.accounts.map((account) => ({
      ...account,
      accessToken: encryptSecret(account.accessToken),
      refreshToken: encryptSecret(account.refreshToken)
    }))
  }
  await writeJson(getAccountsPath(), serializable)
}

export async function getPublicAccountState(): Promise<AccountState> {
  const data = await loadAccounts()
  const now = Date.now()
  const accounts: PublicAccount[] = data.accounts.map((account) => ({
    id: account.id,
    type: account.type,
    name: account.name,
    uuid: account.uuid,
    skinUrl: account.skinUrl,
    customSkin: account.customSkin,
    skinModel: account.skinModel,
    expired: account.type === 'microsoft' && !!account.expiresAt && account.expiresAt < now,
    createdAt: account.createdAt
  }))
  return { accounts, activeId: data.activeId }
}

export async function getAccount(id?: string | null): Promise<Account | null> {
  const data = await loadAccounts()
  const account = data.accounts.find((entry) => entry.id === (id ?? data.activeId))
  if (!account) return null
  return { ...account }
}

export async function saveAccount(account: Account): Promise<void> {
  const data = await loadAccounts()
  const index = data.accounts.findIndex((entry) => entry.id === account.id)
  if (index >= 0) data.accounts[index] = { ...account }
  else data.accounts.push({ ...account })
  if (!data.activeId) data.activeId = account.id
  await saveAccounts(data)
}

export async function removeAccount(id: string): Promise<AccountState> {
  const data = await loadAccounts()
  data.accounts = data.accounts.filter((account) => account.id !== id)
  if (data.activeId === id) data.activeId = data.accounts[0]?.id ?? null
  await saveAccounts(data)
  return getPublicAccountState()
}

export async function setActiveAccount(id: string): Promise<AccountState> {
  const data = await loadAccounts()
  if (!data.accounts.some((account) => account.id === id)) throw new Error('账户不存在')
  data.activeId = id
  await saveAccounts(data)
  return getPublicAccountState()
}

export async function getActiveAccount(): Promise<Account | null> {
  return getAccount()
}

export async function getGameDir(): Promise<string> {
  return (await getSettings()).gameDir
}

export async function setGameDir(dir: string): Promise<LauncherSettings> {
  await ensureDir(dir)
  await ensureDir(path.join(dir, 'versions'))
  return updateSettings({ gameDir: dir })
}

export async function clearCaches(): Promise<void> {
  settingsCache = null
  accountsCache = null
}

export async function backupAccountFile(): Promise<string | null> {
  const src = getAccountsPath()
  try {
    await fs.access(src)
    const dest = `${src}.${Date.now()}.bak`
    await fs.copyFile(src, dest)
    return dest
  } catch {
    return null
  }
}
