import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  AccountState,
  AppInfo,
  GameExitEvent,
  LauncherSettings,
  LoaderInstallRequest,
  LoaderKind,
  LogEvent,
  ProgressEvent,
  RoomHostOptions,
  RoomJoinOptions,
  RoomStatus
} from '@shared/types'
import type { ModSearchParams } from '@shared/ipc'
import { initPaths, getDataDir, getLogsDir } from './paths'
import {
  getAccount,
  getPublicAccountState,
  getSettings,
  removeAccount,
  setActiveAccount,
  updateSettings
} from './store'
import { clearLocalSkin, loginMicrosoft, loginOffline, saveLocalSkin, uploadMinecraftSkin } from './auth'
import {
  deleteVersion,
  getManifest,
  installVanilla,
  listInstalledVersions
} from './minecraft'
import { getLoaderOptions, installLoader } from './loaders'
import { importModpack } from './modpacks'
import { detectJavas, downloadJava } from './java'
import { deleteMod, installMod, listInstalledMods, openModsDir, searchMods, toggleMod } from './mods'
import { getRunningGame, isGameRunning, launchGame, stopGame } from './launch'
import {
  addServer,
  listServers,
  removeServer,
  touchServer,
  updateServer
} from './servers'
import { pingMinecraftServer } from './serverPing'
import { RoomManager } from './rooms'
import { ensureDir, pathExists } from './util'

app.setName('BlockDeck')

// Electron's Chromium sandbox is unavailable in some Windows environments
// (including restricted/remote sessions), where the app otherwise exits before
// any window appears. The launcher only renders local, bundled UI and keeps
// contextIsolation enabled, so we opt out of the OS-level Chromium sandbox for
// maximum compatibility. Set BLOCKDECK_ENABLE_SANDBOX=1 to keep it enabled.
if (process.env.BLOCKDECK_ENABLE_SANDBOX !== '1') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}
initPaths()

let mainWindow: BrowserWindow | null = null
const roomManager = new RoomManager()
roomManager.on('log', (line: string) => logEvent('room', line))
roomManager.on('status', (status: RoomStatus) => send('room:status', status))

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function reporter(taskId: string): (event: Omit<ProgressEvent, 'taskId'>) => void {
  return (event) => send('task:progress', { taskId, ...event })
}

function logEvent(source: LogEvent['source'], rawLine: string, taskId?: string): void {
  const line = rawLine.replace(/\[[0-9;]*m/g, '')
  const event: LogEvent = { source, line, time: Date.now(), taskId }
  send('app:log', event)
  void appendLog(source, line)
}

async function appendLog(source: string, line: string): Promise<void> {
  try {
    const logsDir = getLogsDir()
    await ensureDir(logsDir)
    await fs.appendFile(
      path.join(logsDir, 'launcher.log'),
      `[${new Date().toISOString()}] [${source}] ${line}\n`,
      'utf8'
    )
  } catch {
    // logging is best-effort
  }
}

const LOADER_INFO = [
  {
    kind: 'fabric' as LoaderKind,
    label: 'Fabric',
    tagline: '轻量 · 更新最快 · 模组生态活跃',
    accent: '#dbd0b4',
    available: true
  },
  {
    kind: 'forge' as LoaderKind,
    label: 'Forge',
    tagline: '经典 · 大型整合包首选',
    accent: '#e36b4a',
    available: true
  },
  {
    kind: 'neoforge' as LoaderKind,
    label: 'NeoForge',
    tagline: '新一代 · 1.20.2+ 现代模组',
    accent: '#f4a340',
    available: true
  },
  {
    kind: 'quilt' as LoaderKind,
    label: 'Quilt',
    tagline: '开放 · Fabric 的现代分支',
    accent: '#b18cff',
    available: true
  }
]

async function errorMessage(err: unknown): Promise<string> {
  if (err instanceof Error) return err.message
  return String(err)
}

function registerIpc(): void {
  ipcMain.handle('app:info', async (): Promise<AppInfo> => {
    const settings = await getSettings()
    return {
      version: app.getVersion(),
      platform: process.platform,
      dataDir: getDataDir(),
      gameDir: settings.gameDir,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }
  })

  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('仅支持打开网页链接')
    await shell.openExternal(url)
  })

  ipcMain.handle('app:openPath', async (_event, target: string) => {
    if (!target) throw new Error('路径为空')
    await shell.openPath(target)
  })

  ipcMain.handle('app:revealPath', async (_event, target: string) => {
    if (!target) throw new Error('路径为空')
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:recentLogs', async (): Promise<LogEvent[]> => {
    try {
      const file = path.join(getLogsDir(), 'launcher.log')
      const text = await fs.readFile(file, 'utf8')
      const lines = text.split(/\r?\n/).filter(Boolean).slice(-260)
      const events: LogEvent[] = []
      for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.*)$/)
        if (!match) continue
        events.push({
          time: new Date(match[1]).getTime() || Date.now(),
          source: match[2] as LogEvent['source'],
          line: match[3]
        })
      }
      return events
    } catch {
      return []
    }
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_event, patch: Partial<LauncherSettings>) => updateSettings(patch))
  ipcMain.handle('settings:chooseGameDir', async () => {
    const settings = await getSettings()
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Minecraft 游戏目录',
      defaultPath: settings.gameDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const dir = result.filePaths[0]
    await updateSettings({ gameDir: dir })
    return dir
  })
  ipcMain.handle('settings:chooseBackground', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择启动器背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const image = nativeImage.createFromPath(result.filePaths[0])
    if (image.isEmpty()) throw new Error('无法读取这张图片')
    const size = image.getSize()
    const scale = Math.min(1, 2560 / size.width, 1440 / size.height)
    const resized = scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: 'good'
        })
      : image
    const jpeg = resized.toJPEG(86)
    if (jpeg.length > 8 * 1024 * 1024) throw new Error('图片压缩后仍然过大，请换一张')
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  })
  ipcMain.handle('settings:chooseJava', async () => {
    const settings = await getSettings()
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Java 可执行文件',
      defaultPath: settings.javaPath || settings.gameDir,
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    })
    if (result.canceled || !result.filePaths[0]) return null
    await updateSettings({ javaPath: result.filePaths[0] })
    return result.filePaths[0]
  })
  ipcMain.handle('settings:openGameDir', async () => {
    const settings = await getSettings()
    await ensureDir(settings.gameDir)
    await shell.openPath(settings.gameDir)
  })

  ipcMain.handle('accounts:applySkin', async (_event, id: string, model: 'classic' | 'slim') => {
    const account = await getAccount(id)
    if (!account) throw new Error('账户不存在')
    const variant = model === 'slim' ? 'slim' : 'classic'
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Minecraft 皮肤 PNG',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft 皮肤', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePaths[0]) return getPublicAccountState()
    try {
      const image = nativeImage.createFromPath(result.filePaths[0])
      if (image.isEmpty()) throw new Error('无法读取这张图片')
      const size = image.getSize()
      if (!((size.width === 64 && size.height === 64) || (size.width === 64 && size.height === 32))) {
        throw new Error('皮肤必须是 64×64 或 64×32 的 PNG')
      }
      const png = image.toPNG()
      if (!png.length || png.length > 256 * 1024) throw new Error('皮肤文件不能超过 256 KB')
      const dataUrl = `data:image/png;base64,${png.toString('base64')}`
      if (account.type === 'microsoft') {
        await uploadMinecraftSkin(id, dataUrl, png, variant)
      } else {
        await saveLocalSkin(id, dataUrl, variant)
      }
      return getPublicAccountState()
    } catch (err) {
      throw new Error(await errorMessage(err))
    }
  })

  ipcMain.handle('accounts:clearSkin', async (_event, id: string) => {
    await clearLocalSkin(id)
    return getPublicAccountState()
  })

  ipcMain.handle('accounts:state', () => getPublicAccountState())
  ipcMain.handle('accounts:loginMicrosoft', async (): Promise<AccountState> => {
    try {
      const account = await loginMicrosoft(mainWindow)
      await setActiveAccount(account.id)
      return getPublicAccountState()
    } catch (err) {
      throw new Error(await errorMessage(err))
    }
  })
  ipcMain.handle('accounts:loginOffline', async (_event, name: string): Promise<AccountState> => {
    try {
      const account = await loginOffline(name)
      await setActiveAccount(account.id)
      return getPublicAccountState()
    } catch (err) {
      throw new Error(await errorMessage(err))
    }
  })
  ipcMain.handle('accounts:remove', (_event, id: string): Promise<AccountState> => removeAccount(id))
  ipcMain.handle('accounts:setActive', (_event, id: string): Promise<AccountState> =>
    setActiveAccount(id)
  )

  ipcMain.handle('versions:manifest', async (_event, force?: boolean) => {
    const settings = await getSettings()
    return getManifest(settings.downloadSource, !!force)
  })
  ipcMain.handle('versions:installed', () => listInstalledVersions())
  ipcMain.handle('versions:install', async (_event, versionId: string, taskId: string) => {
    const settings = await getSettings()
    const report = reporter(taskId)
    try {
      await installVanilla(versionId, {
        source: settings.downloadSource,
        report,
        concurrency: settings.maxConcurrent
      })
    } catch (err) {
      const message = await errorMessage(err)
      report({ stage: 'error', message, error: message, done: true })
      logEvent('launcher', `[安装失败] ${message}`, taskId)
      throw new Error(message)
    }
  })
  ipcMain.handle('versions:remove', (_event, versionId: string) => deleteVersion(versionId))
  ipcMain.handle('versions:loaders', (_event, mcVersion: string, kind: LoaderKind) =>
    getLoaderOptions(mcVersion, kind)
  )
  ipcMain.handle(
    'versions:installLoader',
    async (_event, request: LoaderInstallRequest, taskId: string) => {
      const settings = await getSettings()
      const report = reporter(taskId)
      try {
        return await installLoader(request.kind, {
          mcVersion: request.mcVersion,
          loaderVersion: request.loaderVersion,
          source: settings.downloadSource,
          report,
          concurrency: settings.maxConcurrent,
          onLog: (line) => logEvent('installer', line, taskId)
        })
      } catch (err) {
        const message = await errorMessage(err)
        report({ stage: 'error', message, error: message, done: true })
        logEvent('launcher', `[加载器安装失败] ${message}`, taskId)
        throw new Error(message)
      }
    }
  )
  ipcMain.handle('versions:importModpack', async (_event, baseVersionId: string | undefined, taskId: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入整合包',
      properties: ['openFile'],
      filters: [
        { name: 'Minecraft 整合包', extensions: ['mrpack', 'zip'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const report = reporter(taskId)
    try {
      return await importModpack(result.filePaths[0], baseVersionId, report)
    } catch (err) {
      const message = await errorMessage(err)
      report({ stage: 'error', message, error: message, done: true })
      throw new Error(message)
    }
  })
  ipcMain.handle('versions:loaderInfo', () => LOADER_INFO)
  ipcMain.handle('versions:openFolder', async (_event, versionId: string) => {
    const settings = await getSettings()
    const dir = path.join(settings.gameDir, 'versions', versionId)
    if (!(await pathExists(dir))) throw new Error('版本目录不存在')
    await shell.openPath(dir)
  })

  ipcMain.handle('servers:list', () => listServers())
  ipcMain.handle('servers:add', (_event, input: { name: string; host: string; port: number; versionId?: string }) =>
    addServer(input)
  )
  ipcMain.handle(
    'servers:update',
    (
      _event,
      id: string,
      patch: Partial<{ name: string; host: string; port: number; versionId: string }>
    ) => updateServer(id, patch)
  )
  ipcMain.handle('servers:remove', (_event, id: string) => removeServer(id))
  ipcMain.handle('servers:ping', (_event, host: string, port: number) =>
    pingMinecraftServer(host, port)
  )
  ipcMain.handle('servers:touch', (_event, id: string) => touchServer(id))

  ipcMain.handle('rooms:status', () => roomManager.getStatus())
  ipcMain.handle('rooms:startHost', (_event, options: RoomHostOptions) =>
    roomManager.startHost(options)
  )
  ipcMain.handle('rooms:stopHost', () => roomManager.stopHost())
  ipcMain.handle('rooms:join', (_event, options: RoomJoinOptions) => roomManager.joinRoom(options))
  ipcMain.handle('rooms:leave', () => roomManager.leaveRoom())
  ipcMain.handle('rooms:lanAddress', () => roomManager.getLanAddress())
  ipcMain.handle('rooms:protocol', () => roomManager.getProtocol())

  ipcMain.handle('java:detect', () => detectJavas())
  ipcMain.handle('java:install', async (_event, major: number, taskId: string) => {
    const report = reporter(taskId)
    try {
      return await downloadJava(major, report)
    } catch (err) {
      const message = await errorMessage(err)
      report({ stage: 'error', message, error: message, done: true })
      throw new Error(message)
    }
  })

  ipcMain.handle('mods:search', (_event, params: ModSearchParams) => searchMods(params))
  ipcMain.handle(
    'mods:install',
    async (
      _event,
      projectId: string,
      gameVersion: string,
      loader: string,
      versionId: string | undefined,
      taskId: string
    ) => {
      const report = reporter(taskId)
      try {
        return await installMod(projectId, gameVersion, loader, versionId, report)
      } catch (err) {
        const message = await errorMessage(err)
        report({ stage: 'error', message, error: message, done: true })
        throw new Error(message)
      }
    }
  )
  ipcMain.handle('mods:installed', (_event, versionId?: string) => listInstalledMods(versionId))
  ipcMain.handle('mods:toggle', (_event, fileName: string, enabled: boolean, versionId?: string) =>
    toggleMod(fileName, enabled, versionId)
  )
  ipcMain.handle('mods:remove', (_event, fileName: string, versionId?: string) => deleteMod(fileName, versionId))
  ipcMain.handle('mods:openFolder', async (_event, versionId?: string) => {
    const dir = await openModsDir(versionId)
    await ensureDir(dir)
    await shell.openPath(dir)
  })

  ipcMain.handle('launch:start', async (_event, options, taskId: string) => {
    if (isGameRunning()) throw new Error('游戏已经在运行中')
    const report = reporter(taskId)
    const settings = await getSettings()
    try {
      const result = await launchGame(options, {
        report,
        onLog: (line) => logEvent('game', line, taskId),
        onExit: (event: GameExitEvent) => send('game:exit', event)
      })
      if (settings.minimizeOnLaunch) mainWindow?.minimize()
      return result
    } catch (err) {
      const message = await errorMessage(err)
      report({ stage: 'error', message, error: message, done: true })
      logEvent('launcher', `[启动失败] ${message}`, taskId)
      throw new Error(message)
    }
  })
  ipcMain.handle('launch:stop', () => stopGame())
  ipcMain.handle('launch:status', () => getRunningGame())
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#070a10',
    title: 'BlockDeck · 方块工坊',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  mainWindow.on('maximize', () => send('window:maximized', true))
  mainWindow.on('unmaximize', () => send('window:maximized', false))
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    app.setAppUserModelId('com.blockdeck.launcher')
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    roomManager.dispose()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
