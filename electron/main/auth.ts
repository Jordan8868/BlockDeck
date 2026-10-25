import { BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import type { Account } from '@shared/types'
import { httpFetch, newId } from './util'
import { getAccount, saveAccount } from './store'

const CLIENT_ID = '00000000402b5328'
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf'
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'
const AUTH_URL = 'https://login.live.com/oauth20_authorize.srf'
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf'

interface MsToken {
  access_token: string
  refresh_token: string
  expires_in: number
}

interface XboxToken {
  Token: string
  DisplayClaims: { xui: Array<{ uhs: string; xid?: string }> }
}

interface XstsToken {
  Token: string
  DisplayClaims: { xui: Array<{ uhs: string; xid?: string }> }
}

interface MinecraftToken {
  access_token: string
  expires_in: number
}

interface MinecraftProfile {
  id: string
  name: string
  skins?: Array<{ id: string; state: string; url: string; variant: string }>
  capes?: Array<{ id: string; state: string; url: string; alias?: string }>
}

export class AuthError extends Error {}

function authUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    prompt: 'select_account',
    display: 'touch'
  })
  return `${AUTH_URL}?${params.toString()}`
}

function extractCode(url: string): string | null {
  if (!url.startsWith(REDIRECT_URI)) return null
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('code')
  } catch {
    return null
  }
}

export async function openMicrosoftLogin(parent?: BrowserWindow | null): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const win = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 560,
      parent: parent ?? undefined,
      modal: !!parent,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0a0e16',
      title: '通过 Microsoft 登录',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:blockdeck-msa',
        webSecurity: true
      }
    })
    win.setMenuBarVisibility(false)

    const chromeVersion = process.versions.chrome ?? '138.0.0.0'
    win.webContents.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
    )

    const finish = (code: string | null, error?: string): void => {
      if (settled) return
      settled = true
      if (!win.isDestroyed()) win.close()
      if (code) resolve(code)
      else reject(new AuthError(error ?? '登录已取消'))
    }

    const inspectUrl = (url: string): boolean => {
      const code = extractCode(url)
      if (code) {
        finish(code)
        return true
      }
      return false
    }

    win.webContents.on('will-redirect', (event, url) => {
      if (inspectUrl(url)) event.preventDefault()
    })
    win.webContents.on('will-navigate', (event, url) => {
      if (inspectUrl(url)) event.preventDefault()
    })
    win.webContents.on('did-navigate', (_event, url) => {
      inspectUrl(url)
    })
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
      if (validatedUrl.startsWith('https://login.live.com') && errorCode !== -3) {
        finish(null, `Microsoft 登录页加载失败：${errorDescription}`)
      }
    })
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (inspectUrl(url)) return { action: 'deny' }
      if (/^https:\/\/([a-z0-9-]+\.)*(live\.com|microsoft\.com|xbox\.com)\//i.test(url)) {
        win.loadURL(url)
      }
      return { action: 'deny' }
    })

    win.on('closed', () => {
      if (!settled) {
        settled = true
        reject(new AuthError('登录窗口已关闭'))
      }
    })

    const timeout = setTimeout(() => {
      finish(null, '登录超时，请重试')
    }, 6 * 60_000)
    win.once('closed', () => clearTimeout(timeout))

    win.loadURL(authUrl()).catch((err) => finish(null, err.message))
    win.once('ready-to-show', () => win.show())
  })
}

async function parseError(response: Response, fallback: string): Promise<string> {
  let detail = ''
  try {
    const text = await response.text()
    try {
      const data = JSON.parse(text) as { errorMessage?: string; error?: string; message?: string }
      detail = data.errorMessage || data.message || data.error || ''
    } catch {
      detail = text.slice(0, 200)
    }
  } catch {
    // ignore
  }
  return detail ? `${fallback}：${detail}` : fallback
}

async function exchangeCode(code: string): Promise<MsToken> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE
  })
  const res = await httpFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) throw new AuthError(await parseError(res, 'Microsoft 令牌交换失败'))
  return (await res.json()) as MsToken
}

async function refreshMsToken(refreshToken: string): Promise<MsToken> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE
  })
  const res = await httpFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) throw new AuthError(await parseError(res, 'Microsoft 登录状态已失效，请重新登录'))
  return (await res.json()) as MsToken
}

async function xboxAuthenticate(msAccessToken: string): Promise<XboxToken> {
  const attempt = async (ticket: string): Promise<Response> =>
    httpFetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: ticket
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT'
      })
    })
  let res = await attempt(msAccessToken)
  if (!res.ok) res = await attempt(`d=${msAccessToken}`)
  if (!res.ok) throw new AuthError(await parseError(res, 'Xbox Live 身份验证失败'))
  return (await res.json()) as XboxToken
}

const XSTS_ERRORS: Record<string, string> = {
  '2148916227': '该 Microsoft 账号已被 Xbox Live 封禁。',
  '2148916233': '该账号尚未创建 Xbox 档案。请先在 xbox.com 登录一次并完成档案创建。',
  '2148916235': '该账号所在地区无法使用 Xbox Live。',
  '2148916236': '该账号需要在 Xbox 页面完成成人验证。',
  '2148916237': '该账号需要在 Xbox 页面完成成人验证。',
  '2148916238': '未成年人账号需要由家庭组织者加入 Microsoft 家庭后才能登录。',
  '2148916262': 'Xbox Live 返回了未知限制，请稍后重试。'
}

async function xstsAuthorize(xboxToken: string): Promise<XstsToken> {
  const res = await httpFetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xboxToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  if (!res.ok) {
    let xerr = ''
    try {
      const data = (await res.json()) as { XErr?: number }
      xerr = String(data.XErr ?? '')
    } catch {
      // ignore
    }
    throw new AuthError(XSTS_ERRORS[xerr] ?? `Xbox Live 授权失败${xerr ? `（错误 ${xerr}）` : ''}`)
  }
  return (await res.json()) as XstsToken
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function formatUuid(uuid: string): string {
  const clean = uuid.replace(/-/g, '').toLowerCase()
  if (clean.length !== 32) return uuid
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

async function completeMinecraftLogin(msToken: MsToken): Promise<Account> {
  const xbox = await xboxAuthenticate(msToken.access_token)
  const userhash = xbox.DisplayClaims?.xui?.[0]?.uhs
  if (!userhash) throw new AuthError('Xbox Live 未返回用户标识')
  const xsts = await xstsAuthorize(xbox.Token)
  const identityToken = `XBL3.0 x=${userhash};${xsts.Token}`

  const mcRes = await httpFetch(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identityToken })
    }
  )
  if (!mcRes.ok) throw new AuthError(await parseError(mcRes, 'Minecraft 服务登录失败'))
  const mcToken = (await mcRes.json()) as MinecraftToken

  const entitlementsRes = await httpFetch('https://api.minecraftservices.com/entitlements/mcstore', {
    headers: { Authorization: `Bearer ${mcToken.access_token}` }
  })
  if (entitlementsRes.ok) {
    const entitlements = (await entitlementsRes.json()) as { items?: Array<{ name: string }> }
    const names = (entitlements.items ?? []).map((item) => item.name)
    if (!names.some((name) => name === 'game_minecraft' || name === 'product_minecraft')) {
      throw new AuthError('该 Microsoft 账号未拥有 Minecraft Java 版。')
    }
  }

  const profileRes = await httpFetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcToken.access_token}` }
  })
  if (!profileRes.ok) {
    throw new AuthError(await parseError(profileRes, '无法获取 Minecraft 档案，请确认账号已购买 Java 版'))
  }
  const profile = (await profileRes.json()) as MinecraftProfile
  const payload = decodeJwtPayload(mcToken.access_token)
  const skin = profile.skins?.find((entry) => entry.state === 'ACTIVE')

  return {
    id: `msa:${profile.id}`,
    type: 'microsoft',
    name: profile.name,
    uuid: formatUuid(profile.id),
    skinUrl: skin?.url,
    accessToken: mcToken.access_token,
    refreshToken: msToken.refresh_token,
    expiresAt: Date.now() + Math.max(60, mcToken.expires_in || 86_400) * 1000,
    xuid: typeof payload.xuid === 'string' ? payload.xuid : xsts.DisplayClaims?.xui?.[0]?.xid,
    createdAt: Date.now()
  }
}

export async function loginMicrosoft(parent?: BrowserWindow | null): Promise<Account> {
  const code = await openMicrosoftLogin(parent)
  const token = await exchangeCode(code)
  const account = await completeMinecraftLogin(token)
  const existing = await getAccount(account.id)
  if (existing) account.createdAt = existing.createdAt
  await saveAccount(account)
  return account
}

export async function ensureFreshAccount(accountId?: string | null): Promise<Account> {
  const account = await getAccount(accountId)
  if (!account) throw new AuthError('请先选择一个账户')
  if (account.type === 'offline') return account
  if (!account.expiresAt || account.expiresAt > Date.now() + 10 * 60_000) return account
  if (!account.refreshToken) throw new AuthError('Microsoft 登录已过期，请重新登录')
  const token = await refreshMsToken(account.refreshToken)
  const refreshed = await completeMinecraftLogin(token)
  refreshed.id = account.id
  refreshed.createdAt = account.createdAt
  await saveAccount(refreshed)
  return refreshed
}

function offlineUuid(name: string): string {
  const hash = createOfflineHash(`OfflinePlayer:${name}`)
  const bytes = Buffer.from(hash, 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x30
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function createOfflineHash(input: string): string {
  // MD5 is required by the Minecraft offline UUID convention.
  return createHash('md5').update(input, 'utf8').digest('hex')
}

export async function loginOffline(nameRaw: string): Promise<Account> {
  const name = nameRaw.trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new AuthError('离线用户名需为 3–16 位，只能包含字母、数字和下划线')
  }
  const uuid = offlineUuid(name)
  const account: Account = {
    id: `offline:${uuid}`,
    type: 'offline',
    name,
    uuid,
    accessToken: '0',
    createdAt: Date.now()
  }
  const existing = await getAccount(account.id)
  if (existing) account.createdAt = existing.createdAt
  await saveAccount(account)
  return account
}

export function randomClientId(): string {
  return newId()
}

function dataUrlBytes(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new AuthError('皮肤数据格式不正确')
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

export async function saveLocalSkin(
  accountId: string,
  dataUrl: string,
  model: 'classic' | 'slim'
): Promise<Account> {
  const account = await getAccount(accountId)
  if (!account) throw new AuthError('账户不存在')
  account.customSkin = dataUrl
  account.skinModel = model
  await saveAccount(account)
  return account
}

export async function uploadMinecraftSkin(
  accountId: string,
  dataUrl: string,
  png: Buffer,
  model: 'classic' | 'slim'
): Promise<Account> {
  const account = await ensureFreshAccount(accountId)
  if (account.type !== 'microsoft') throw new AuthError('只有 Microsoft 正版账户可以上传皮肤')
  if (!account.accessToken) throw new AuthError('Microsoft 登录已过期，请重新登录')

  const form = new FormData()
  form.append('variant', model)
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'skin.png')
  const res = await httpFetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.accessToken}` },
    body: form,
    timeoutMs: 60_000
  })
  if (!res.ok) throw new AuthError(await parseError(res, 'Minecraft 皮肤上传失败'))

  const profileRes = await httpFetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${account.accessToken}` }
  })
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as MinecraftProfile
    const skin = profile.skins?.find((entry) => entry.state === 'ACTIVE')
    account.skinUrl = skin?.url ?? account.skinUrl
  }
  account.customSkin = dataUrl
  account.skinModel = model
  await saveAccount(account)
  return account
}

export async function clearLocalSkin(accountId: string): Promise<Account> {
  const account = await getAccount(accountId)
  if (!account) throw new AuthError('账户不存在')
  account.customSkin = undefined
  account.skinModel = undefined
  await saveAccount(account)
  return account
}
