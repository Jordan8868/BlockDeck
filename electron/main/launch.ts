import { spawn, execFile } from 'node:child_process'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LaunchOptions, LaunchResult, ProgressReporter } from '@shared/types'
import { getSettings } from './store'
import { ensureFreshAccount } from './auth'
import { ensureJava } from './java'
import {
  LaunchArgument,
  Library,
  ensureVersionFiles,
  extractNatives,
  mergeVersion,
  planLibraries,
  rulesAllow
} from './minecraft'
import { ensureDir, pathExists } from './util'

interface ActiveGame {
  process: ReturnType<typeof spawn>
  versionId: string
  pid: number
  startedAt: number
  stopping: boolean
}

let activeGame: ActiveGame | null = null

export interface LaunchCallbacks {
  report: ProgressReporter
  onLog: (line: string) => void
  onExit: (event: { code: number | null; crashed: boolean; signal: string | null }) => void
}

function flattenArguments(
  args: LaunchArgument[] | undefined,
  replacements: Record<string, string>
): string[] {
  const result: string[] = []
  for (const arg of args ?? []) {
    if (typeof arg === 'string') {
      result.push(replaceTokens(arg, replacements))
      continue
    }
    if (!rulesAllow(arg.rules)) continue
    const values = Array.isArray(arg.value) ? arg.value : [arg.value]
    for (const value of values) result.push(replaceTokens(value, replacements))
  }
  return result
}

function replaceTokens(value: string, replacements: Record<string, string>): string {
  let result = value
  for (const [key, replacement] of Object.entries(replacements)) {
    result = result.split(`\${${key}}`).join(replacement)
  }
  return result
}

function tokenizeLegacyArguments(value: string): string[] {
  return value
    .match(/(?:[^\s"]+|"[^"]*")+/g)
    ?.map((token) => token.replace(/^"|"$/g, '')) ?? []
}

export async function buildLaunchCommand(
  options: LaunchOptions
): Promise<{
  javaPath: string
  args: string[]
  cwd: string
  versionId: string
  mainClass: string
}> {
  const settings = await getSettings()
  const account = await ensureFreshAccount(options.accountId)
  const merged = await mergeVersion(options.versionId)
  await ensureVersionFiles(options.versionId)

  const report: ProgressReporter = () => undefined
  const java = await ensureJava(merged.javaMajor, report)
  const planned = planLibraries(merged.libraries, settings.gameDir, settings.downloadSource)
  const missing = []
  for (const file of planned.classpath) {
    if (!(await pathExists(file))) missing.push(path.basename(file))
  }
  if (missing.length) {
    throw new Error(`启动文件缺失：${missing.slice(0, 4).join('、')}，请重新安装该版本`)
  }
  await extractNatives(planned.nativeJars, merged.nativesDir)
  await ensureDir(merged.nativesDir)
  const tempDir = path.join(settings.gameDir, 'temp')
  await ensureDir(tempDir)

  const classpath = [...planned.classpath, merged.clientJar].join(path.delimiter)
  const assetRoot = path.join(settings.gameDir, 'assets')
  const virtualAssets = merged.assetIndex?.virtual
    ? path.join(assetRoot, 'virtual', merged.assetIndex.id)
    : assetRoot

  const replacements: Record<string, string> = {
    auth_player_name: account.name,
    version_name: merged.id,
    game_directory: settings.gameDir,
    assets_root: assetRoot,
    game_assets: virtualAssets,
    assets_index_name: merged.assetIndex?.id ?? merged.assets ?? 'legacy',
    auth_uuid: account.uuid,
    auth_access_token: account.accessToken ?? '0',
    auth_session: account.accessToken ?? '0',
    auth_xuid: account.xuid ?? '0',
    clientid: randomUUID(),
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    user_properties: '{}',
    profile_name: account.name,
    version_type: merged.type,
    natives_directory: merged.nativesDir,
    launcher_name: 'BlockDeck',
    launcher_version: '1.1.0',
    classpath,
    classpath_separator: path.delimiter,
    library_directory: path.join(settings.gameDir, 'libraries'),
    resolution_width: String(options.width ?? 1280),
    resolution_height: String(options.height ?? 720)
  }

  const jvmTokens = flattenArguments(merged.jvmArgs, replacements)
  if (!jvmTokens.some((token) => token === '-cp' || token === '-classpath')) {
    jvmTokens.push('-Djava.library.path=' + merged.nativesDir, '-cp', classpath)
  } else if (!jvmTokens.some((token) => token.startsWith('-Djava.library.path='))) {
    jvmTokens.unshift('-Djava.library.path=' + merged.nativesDir)
  }

  const gameTokens = merged.minecraftArguments
    ? tokenizeLegacyArguments(merged.minecraftArguments).map((token) =>
        replaceTokens(token, replacements)
      )
    : flattenArguments(merged.gameArgs, replacements)
  if (options.fullscreen && !gameTokens.includes('--fullscreen')) gameTokens.push('--fullscreen')
  if (!options.fullscreen) {
    if (!gameTokens.includes('--width')) gameTokens.push('--width', String(options.width ?? 1280))
    if (!gameTokens.includes('--height')) gameTokens.push('--height', String(options.height ?? 720))
  }
  if (options.serverAddress) {
    const match = options.serverAddress.trim().match(/^(.+):([0-9]{1,5})$/)
    if (!match) throw new Error('服务器地址格式应为 host:port')
    const host = match[1]
    const port = Number(match[2])
    if (!host || port < 1 || port > 65535) throw new Error('服务器地址或端口无效')
    const supportsQuickPlay =
      merged.releaseTime != null &&
      Date.parse(merged.releaseTime) >= Date.parse('2023-06-07T00:00:00Z')
    if (supportsQuickPlay) {
      if (!gameTokens.includes('--quickPlayMultiplayer')) {
        gameTokens.push('--quickPlayMultiplayer', `${host}:${port}`)
      }
    } else if (!gameTokens.includes('--server')) {
      gameTokens.push('--server', host, '--port', String(port))
    }
  }

  const memory = Math.max(512, Math.min(options.memoryMb ?? settings.memoryMb, 32768))
  const args = [
    `-Xms${Math.min(1024, memory)}M`,
    `-Xmx${memory}M`,
    `-Djava.io.tmpdir=${tempDir}`,
    '-Dfile.encoding=UTF-8',
    '-Dsun.stdout.encoding=UTF-8',
    '-Dsun.stderr.encoding=UTF-8',
    '-Dminecraft.launcher.brand=BlockDeck',
    '-Dminecraft.launcher.version=1.1.0',
    ...jvmTokens.filter(
      (token) =>
        !token.startsWith('-Xms') &&
        !token.startsWith('-Xmx') &&
        !token.startsWith('-Djava.io.tmpdir=') &&
        !token.startsWith('-Dfile.encoding=')
    ),
    merged.mainClass,
    ...gameTokens
  ]

  return {
    javaPath: java.path,
    args,
    cwd: settings.gameDir,
    versionId: merged.id,
    mainClass: merged.mainClass
  }
}

export async function launchGame(
  options: LaunchOptions,
  callbacks: LaunchCallbacks
): Promise<LaunchResult> {
  if (activeGame) throw new Error('游戏已经在运行中')
  callbacks.report({ stage: 'launch', message: '检查游戏文件与账户…' })
  const command = await buildLaunchCommand(options)
  callbacks.report({ stage: 'launch', message: '正在启动 Java 进程…' })
  callbacks.onLog(`[BlockDeck] 启动 ${command.versionId}`)
  callbacks.onLog(`[BlockDeck] Java: ${command.javaPath}`)
  callbacks.onLog(`[BlockDeck] 主类: ${command.mainClass}`)

  return new Promise<LaunchResult>((resolve, reject) => {
    let settled = false
    const child = spawn(command.javaPath, command.args, {
      cwd: command.cwd,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const startedAt = Date.now()
    activeGame = {
      process: child,
      versionId: command.versionId,
      pid: child.pid ?? 0,
      startedAt,
      stopping: false
    }

    const wire = (stream: NodeJS.ReadableStream, source: 'stdout' | 'stderr'): void => {
      let buffer = ''
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.length > 0) callbacks.onLog(line)
        }
      })
      stream.on('end', () => {
        if (buffer.trim()) callbacks.onLog(buffer.trim())
      })
      void source
    }
    wire(child.stdout!, 'stdout')
    wire(child.stderr!, 'stderr')

    child.once('spawn', () => {
      settled = true
      callbacks.report({ stage: 'running', message: '游戏已启动', done: true })
      resolve({
        pid: child.pid,
        versionId: command.versionId,
        javaPath: command.javaPath,
        launchedAt: startedAt
      })
    })

    child.on('error', (err) => {
      activeGame = null
      if (!settled) reject(new Error(`无法启动 Java：${err.message}`))
      callbacks.onLog(`[BlockDeck] 启动失败：${err.message}`)
      callbacks.onExit({ code: null, crashed: true, signal: null })
    })

    child.on('exit', (code, signal) => {
      const wasStopping = activeGame?.stopping ?? false
      activeGame = null
      const crashed = !wasStopping && (code !== 0 || signal != null)
      callbacks.onLog(
        `[BlockDeck] 游戏进程结束（退出码 ${code ?? '无'}${signal ? `，信号 ${signal}` : ''}）`
      )
      callbacks.onExit({ code, crashed, signal: signal ?? null })
    })
  })
}

export async function stopGame(): Promise<void> {
  const game = activeGame
  if (!game) return
  game.stopping = true
  if (process.platform === 'win32' && game.pid) {
    await new Promise<void>((resolve) => {
      execFile('taskkill.exe', ['/pid', String(game.pid), '/T', '/F'], { windowsHide: true }, () =>
        resolve()
      )
    })
  } else {
    try {
      game.process.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
}

export function isGameRunning(): boolean {
  return !!activeGame
}

export function getRunningGame(): { versionId: string; pid: number; startedAt: number } | null {
  return activeGame
    ? { versionId: activeGame.versionId, pid: activeGame.pid, startedAt: activeGame.startedAt }
    : null
}

export const __testing = { tokenizeLegacyArguments, replaceTokens, flattenArguments }
export type { Library }
