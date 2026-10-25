import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { JavaInfo, ProgressReporter } from '@shared/types'
import { getSettings } from './store'
import {
  downloadFile,
  ensureDir,
  extractZip,
  fetchText,
  fileSize,
  httpFetch,
  pathExists
} from './util'
import AdmZip from 'adm-zip'

const execFileAsync = promisify(execFile)

interface JavaVersionOutput {
  path: string
  version: string
  major: number
}

const versionCache = new Map<string, JavaInfo | null>()

export function javaExecutable(dirOrExe: string): string {
  if (/java(\.exe)?$/i.test(dirOrExe)) return dirOrExe
  return process.platform === 'win32'
    ? path.join(dirOrExe, 'bin', 'java.exe')
    : path.join(dirOrExe, 'bin', 'java')
}

export async function inspectJava(javaPath: string): Promise<JavaInfo | null> {
  if (versionCache.has(javaPath)) return versionCache.get(javaPath) ?? null
  if (!(await pathExists(javaPath))) {
    versionCache.set(javaPath, null)
    return null
  }
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ['-version'], {
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    const output = `${stderr}\n${stdout}`
    const match = output.match(/version "([^"]+)"/) ?? output.match(/openjdk ([^\s]+)/i)
    if (!match) return null
    const version = match[1]
    let major = 0
    if (version.startsWith('1.')) major = Number(version.split('.')[1])
    else major = Number(version.split(/[.\-+]/)[0])
    if (!Number.isFinite(major)) major = 0
    const info: JavaInfo = {
      path: javaPath,
      version,
      major,
      source: 'system'
    }
    versionCache.set(javaPath, info)
    return info
  } catch {
    versionCache.set(javaPath, null)
    return null
  }
}

export async function findManagedJavas(gameDir: string): Promise<JavaInfo[]> {
  const runtimeDir = path.join(gameDir, 'runtime')
  const entries = await fs.readdir(runtimeDir, { withFileTypes: true }).catch(() => [])
  const result: JavaInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('java-')) continue
    const exe = javaExecutable(path.join(runtimeDir, entry.name))
    const info = await inspectJava(exe)
    if (info) result.push({ ...info, source: 'managed' })
  }
  return result
}

async function findSystemJavas(): Promise<JavaInfo[]> {
  const candidates = new Set<string>()
  if (process.env.JAVA_HOME) candidates.add(javaExecutable(process.env.JAVA_HOME))
  try {
    const command = process.platform === 'win32' ? 'where.exe' : 'which'
    const args = process.platform === 'win32' ? ['java.exe'] : ['java']
    const { stdout } = await execFileAsync(command, args, { timeout: 8000, windowsHide: true })
    for (const line of stdout.split(/\r?\n/)) {
      if (line.trim()) candidates.add(line.trim())
    }
  } catch {
    // no java on PATH
  }
  const result: JavaInfo[] = []
  for (const candidate of candidates) {
    const info = await inspectJava(candidate)
    if (info) result.push(info)
  }
  return result
}

export async function detectJavas(): Promise<{ managed: JavaInfo[]; system: JavaInfo[]; custom: JavaInfo | null }> {
  const settings = await getSettings()
  const [managed, system] = await Promise.all([findManagedJavas(settings.gameDir), findSystemJavas()])
  let custom: JavaInfo | null = null
  if (settings.javaPath) {
    custom = await inspectJava(settings.javaPath)
    if (custom) custom = { ...custom, source: 'custom' }
  }
  return { managed, system, custom }
}

function preferredMajor(required: number): number {
  if (required <= 8) return 8
  if (required <= 11) return 11
  if (required <= 16) return 17
  return required
}

function matches(info: JavaInfo, required: number): boolean {
  if (required <= 8) return info.major === 8
  if (required === 16) return info.major >= 17
  return info.major === required || (info.major > required && info.major <= required + 8)
}

export async function ensureJava(required: number, report: ProgressReporter): Promise<JavaInfo> {
  const settings = await getSettings()
  const wanted = preferredMajor(required)
  if (settings.javaPath) {
    const custom = await inspectJava(settings.javaPath)
    if (custom) return { ...custom, source: 'custom', matches: matches(custom, required) }
  }
  const managed = await findManagedJavas(settings.gameDir)
  const managedMatch = managed.find((java) => matches(java, required))
  if (managedMatch) return managedMatch
  const system = await findSystemJavas()
  const systemMatch = system.find((java) => matches(java, required))
  if (systemMatch) return systemMatch
  if (!settings.autoJava) {
    throw new Error(`未找到兼容的 Java ${required}，请在设置中指定 Java 路径`)
  }
  return downloadJava(wanted, report)
}

async function latestTunaZip(major: number): Promise<string | null> {
  try {
    const html = await fetchText(
      `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jre/x64/windows/`
    )
    const matches = [...html.matchAll(/href="([^"]+\.zip)"/g)].map((match) => match[1])
    if (!matches.length) return null
    const files = matches
      .map((file) => decodeURIComponent(file))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    return `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/${major}/jre/x64/windows/${encodeURIComponent(files[0])}`
  } catch {
    return null
  }
}

async function downloadUrlCandidates(major: number): Promise<string[]> {
  const candidates: string[] = []
  const tuna = await latestTunaZip(major)
  if (tuna) candidates.push(tuna)
  candidates.push(
    `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/x64/jre/hotspot/normal/eclipse`
  )
  return [...new Set(candidates)]
}

async function contentLength(urls: string[]): Promise<number> {
  for (const url of urls) {
    try {
      const res = await httpFetch(url, { method: 'HEAD', timeoutMs: 20_000 })
      const length = Number(res.headers.get('content-length') ?? 0)
      if (res.ok && length > 0) return length
    } catch {
      // try next
    }
  }
  return 0
}

async function findJavaInDir(dir: string, depth = 0): Promise<string | null> {
  if (depth > 5) return null
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  if (entries.some((entry) => entry.isFile() && /^java(\.exe)?$/i.test(entry.name))) {
    return path.join(dir, entries.find((entry) => /^java(\.exe)?$/i.test(entry.name))!.name)
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findJavaInDir(path.join(dir, entry.name), depth + 1)
    if (found) return found
  }
  return null
}

export async function downloadJava(major: number, report: ProgressReporter): Promise<JavaInfo> {
  const settings = await getSettings()
  const runtimeRoot = path.join(settings.gameDir, 'runtime')
  const target = path.join(runtimeRoot, `java-${major}`)
  const existing = javaExecutable(target)
  if (await pathExists(existing)) {
    const info = await inspectJava(existing)
    if (info) return { ...info, source: 'managed' }
  }

  const urls = await downloadUrlCandidates(major)
  report({ stage: 'java', message: `正在下载 Java ${major} 运行环境（约 45 MB）…`, bytes: 0, totalBytes: 0 })
  const total = await contentLength(urls)
  const zipPath = path.join(runtimeRoot, `java-${major}.zip`)
  await ensureDir(runtimeRoot)
  let received = 0
  await downloadFile(
    { urls, dest: zipPath, label: `Java ${major} 运行时` },
    (delta) => {
      received += delta
      report({
        stage: 'java',
        message: `正在下载 Java ${major} 运行环境…`,
        bytes: received,
        totalBytes: total
      })
    },
    15 * 60_000
  )

  report({ stage: 'java', message: '正在解压 Java 运行环境…' })
  const temp = path.join(runtimeRoot, `.java-${major}-${Date.now()}`)
  await ensureDir(temp)
  await extractZip(zipPath, temp)
  const javaExe = await findJavaInDir(temp)
  if (!javaExe) throw new Error('Java 运行时解压失败（未找到 java 可执行文件）')
  const home = path.dirname(path.dirname(javaExe))
  await fs.rm(target, { recursive: true, force: true })
  try {
    await fs.rename(home, target)
  } catch {
    await fs.cp(home, target, { recursive: true })
  }
  await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined)
  await fs.rm(zipPath, { force: true }).catch(() => undefined)
  const info = await inspectJava(javaExecutable(target))
  if (!info) throw new Error('Java 运行时安装完成后无法启动')
  versionCache.set(info.path, info)
  report({ stage: 'java', message: `Java ${info.version} 已就绪`, done: true, bytes: 1, totalBytes: 1 })
  return { ...info, source: 'managed' }
}

export async function checkJavaPath(file: string): Promise<JavaInfo | null> {
  return inspectJava(file)
}

export async function getRuntimeSummary(): Promise<{
  managed: JavaInfo[]
  system: JavaInfo[]
  custom: JavaInfo | null
}> {
  return detectJavas()
}

export async function javaExists(file: string): Promise<boolean> {
  return (await fileSize(file)) >= 0
}

export async function extractJavaZip(zipPath: string, dest: string): Promise<void> {
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(dest, true)
}
