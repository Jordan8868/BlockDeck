import { app, net } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import AdmZip from 'adm-zip'

export const USER_AGENT = 'BlockDeck/1.1.0 (Minecraft launcher; +https://blockdeck.local)'

export function newId(): string {
  return randomUUID()
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file))
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function sha1Text(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

export async function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function fileSize(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).size
  } catch {
    return -1
  }
}

export type FetchLike = typeof fetch

function resolveFetch(): FetchLike {
  if (app.isReady()) {
    return ((input: RequestInfo | URL, init?: RequestInit) =>
      net.fetch(input as string, init)) as unknown as FetchLike
  }
  return fetch
}

export interface HttpOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  method?: string
  body?: string
}

export async function httpFetch(url: string, options: HttpOptions = {}): Promise<Response> {
  const fetcher = resolveFetch()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000)
  try {
    return await fetcher(url, {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers ?? {})
      },
      body: options.body,
      signal: controller.signal,
      cache: 'no-store'
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchText(url: string, attempts = 3): Promise<string> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await httpFetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err
      if (i < attempts - 1) await sleep(500 * (i + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function fetchJson<T>(urls: string | string[], attempts = 3): Promise<T> {
  const list = Array.isArray(urls) ? urls : [urls]
  let lastError: unknown
  for (const url of list) {
    for (let i = 0; i < attempts; i++) {
      try {
        const text = await fetchText(url, 1)
        return JSON.parse(text) as T
      } catch (err) {
        lastError = err
        if (i < attempts - 1) await sleep(400 * (i + 1))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export interface DownloadItem {
  urls: string[]
  dest: string
  sha1?: string
  size?: number
  label?: string
  optional?: boolean
}

export interface DownloadProgress {
  completed: number
  total: number
  bytes: number
  totalBytes: number
  label: string
}

async function isDownloaded(item: DownloadItem): Promise<boolean> {
  const size = await fileSize(item.dest)
  if (size < 0) return false
  if (item.size != null && item.size > 0 && size !== item.size) return false
  if (item.sha1) {
    try {
      return (await sha1File(item.dest)) === item.sha1.toLowerCase()
    } catch {
      return false
    }
  }
  return true
}

export async function downloadFile(
  item: DownloadItem,
  onBytes?: (delta: number) => void,
  timeoutMs = 180_000
): Promise<void> {
  let lastError: unknown
  for (const url of item.urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const tmp = `${item.dest}.${process.pid}.${Date.now()}.part`
      try {
        await ensureDir(path.dirname(item.dest))
        const res = await httpFetch(url, { timeoutMs })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const hash = createHash('sha1')
        let received = 0
        const meter = new Transform({
          transform(chunk: Buffer, _enc, callback) {
            hash.update(chunk)
            received += chunk.length
            onBytes?.(chunk.length)
            callback(null, chunk)
          }
        })
        await pipeline(
          Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
          meter,
          createWriteStream(tmp)
        )
        if (item.size != null && item.size > 0 && received !== item.size) {
          throw new Error(`文件大小不匹配 (${received}/${item.size})`)
        }
        if (item.sha1 && hash.digest('hex') !== item.sha1.toLowerCase()) {
          throw new Error('SHA1 校验失败')
        }
        await fs.rename(tmp, item.dest)
        return
      } catch (err) {
        lastError = err
        await fs.rm(tmp, { force: true }).catch(() => undefined)
        if (attempt === 0) await sleep(350)
      }
    }
  }
  throw new Error(
    `下载失败：${item.label ?? path.basename(item.dest)} — ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

export async function downloadAll(
  items: DownloadItem[],
  options: {
    concurrency?: number
    onProgress?: (progress: DownloadProgress) => void
  } = {}
): Promise<{ downloaded: number; skipped: number }> {
  const unique = new Map<string, DownloadItem>()
  for (const item of items) {
    if (!unique.has(item.dest)) unique.set(item.dest, item)
  }
  const queue = [...unique.values()]
  let downloaded = 0
  let skipped = 0
  let bytesDone = 0
  let completed = 0
  const totalBytes = queue.reduce((sum, item) => sum + (item.size ?? 0), 0)

  const prechecked: DownloadItem[] = []
  for (const item of queue) {
    if (await isDownloaded(item)) {
      skipped++
      completed++
      bytesDone += item.size ?? 0
    } else {
      prechecked.push(item)
    }
  }
  const total = queue.length
  const emit = (label: string): void => {
    options.onProgress?.({
      completed,
      total,
      bytes: bytesDone,
      totalBytes,
      label
    })
  }
  emit('检查本地文件')

  let cursor = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor++
      if (index >= prechecked.length) return
      const item = prechecked[index]
      emit(`下载 ${item.label ?? path.basename(item.dest)}`)
      const before = await fileSize(item.dest)
      if (before > 0 && !item.size) bytesDone += before
      await downloadFile(item, (delta) => {
        bytesDone += delta
        emit(`下载 ${item.label ?? path.basename(item.dest)}`)
      })
      downloaded++
      completed++
      emit(`完成 ${item.label ?? path.basename(item.dest)}`)
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(options.concurrency ?? 8, 16)) },
    () => worker()
  )
  await Promise.all(workers)
  return { downloaded, skipped }
}

export async function extractZip(zipFile: string, dest: string): Promise<void> {
  await ensureDir(dest)
  const zip = new AdmZip(zipFile)
  zip.extractAllTo(dest, true)
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.+$/g, '')
    .slice(0, 180)
}

export async function removeEmptyDirs(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => removeEmptyDirs(path.join(dir, entry.name)))
    )
    if ((await fs.readdir(dir)).length === 0) await fs.rmdir(dir)
  } catch {
    // ignore
  }
}
