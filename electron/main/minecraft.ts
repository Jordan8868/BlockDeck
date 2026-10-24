import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type {
  DownloadSource,
  InstalledVersion,
  LoaderKind,
  ProgressReporter,
  RemoteVersion,
  VersionManifest,
  VersionType
} from '@shared/types'
import { getSettings } from './store'
import {
  DownloadItem,
  downloadAll,
  ensureDir,
  fetchJson,
  fetchText,
  httpFetch,
  pathExists,
  readJson,
  sleep,
  writeJson
} from './util'

export const MIRROR = 'https://bmclapi2.bangbang93.com'
const OFFICIAL_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const MIRROR_MANIFEST = `${MIRROR}/mc/game/version_manifest_v2.json`
const OFFICIAL_RESOURCES = 'https://resources.download.minecraft.net'
const OFFICIAL_LIBS = 'https://libraries.minecraft.net'

export interface VersionJson {
  id: string
  type: VersionType | 'modified'
  mainClass: string
  inheritsFrom?: string
  jar?: string
  assets?: string
  assetIndex?: { id: string; sha1?: string; size?: number; url?: string; totalSize?: number; virtual?: boolean; map_to_resources?: boolean }
  downloads?: {
    client?: { sha1: string; size: number; url: string }
    server?: { sha1: string; size: number; url: string }
  }
  libraries?: Library[]
  arguments?: {
    game?: LaunchArgument[]
    jvm?: LaunchArgument[]
  }
  minecraftArguments?: string
  javaVersion?: { component?: string; majorVersion?: number }
  logging?: {
    client?: {
      argument: string
      file: { id: string; sha1: string; size: number; url: string }
      type: string
    }
  }
  releaseTime?: string
  time?: string
  complianceLevel?: number
  [key: string]: unknown
}

export interface Library {
  name: string
  url?: string
  rules?: Rule[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  downloads?: {
    artifact?: Artifact
    classifiers?: Record<string, Artifact>
  }
}

interface Artifact {
  path?: string
  sha1?: string
  size?: number
  url?: string
  id?: string
}

interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export type LaunchArgument =
  | string
  | {
      rules?: Rule[]
      value: string | string[]
    }

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  virtual?: boolean
  map_to_resources?: boolean
}

interface ManifestCacheEntry {
  at: number
  data: VersionManifest
}

const manifestCache = new Map<DownloadSource, ManifestCacheEntry>()
const versionCache = new Map<string, { at: number; data: VersionJson }>()
const MANIFEST_TTL = 5 * 60_000
const VERSION_TTL = 10 * 60_000

export function sourceOrder(source: DownloadSource): ('official' | 'mirror')[] {
  if (source === 'mirror') return ['mirror', 'official']
  if (source === 'official') return ['official', 'mirror']
  return ['mirror', 'official']
}

function manifestUrl(kind: 'official' | 'mirror'): string {
  return kind === 'mirror' ? MIRROR_MANIFEST : OFFICIAL_MANIFEST
}

export async function getManifest(
  source: DownloadSource = 'auto',
  force = false
): Promise<VersionManifest> {
  const key: DownloadSource = source
  const cached = manifestCache.get(key)
  if (!force && cached && Date.now() - cached.at < MANIFEST_TTL) return cached.data
  const urls = sourceOrder(source).map(manifestUrl)
  const raw = await fetchJson<{
    latest: { release: string; snapshot: string }
    versions: RemoteVersion[]
  }>(urls, 2)
  if (!raw?.versions?.length) throw new Error('无法读取 Minecraft 版本清单')
  const data: VersionManifest = {
    latest: raw.latest,
    versions: raw.versions.map((version) => ({
      id: version.id,
      type: version.type,
      releaseTime: version.releaseTime,
      url: version.url
    })),
    source
  }
  manifestCache.set(key, { at: Date.now(), data })
  return data
}

export async function getRemoteVersion(id: string): Promise<RemoteVersion | undefined> {
  const manifest = await getManifest('auto')
  return manifest.versions.find((version) => version.id === id)
}

export async function getVersionJson(
  id: string,
  source: DownloadSource = 'auto',
  force = false
): Promise<VersionJson> {
  const key = `${source}:${id}`
  const cached = versionCache.get(key)
  if (!force && cached && Date.now() - cached.at < VERSION_TTL) return cached.data
  const remote = await getRemoteVersion(id)
  const officialUrl = remote?.url
  const urls: string[] = []
  if (source !== 'official') urls.push(`${MIRROR}/version/${encodeURIComponent(id)}/json`)
  if (officialUrl) urls.push(officialUrl)
  if (source === 'official') urls.push(`${MIRROR}/version/${encodeURIComponent(id)}/json`)
  if (!urls.length) throw new Error(`版本 ${id} 不在版本清单中`)
  const data = await fetchJson<VersionJson>(urls, 2)
  if (!data.id) data.id = id
  versionCache.set(key, { at: Date.now(), data })
  return data
}

export function libraryMavenPath(name: string): string {
  const [coordsRaw, extRaw] = name.split('@')
  const parts = coordsRaw.split(':')
  const [group, artifact, version, classifier] = parts
  const ext = extRaw || 'jar'
  const fileName = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${fileName}`
}

export function parseLibraryName(name: string): {
  group: string
  artifact: string
  version: string
  classifier?: string
  ext: string
} {
  const [coordsRaw, ext = 'jar'] = name.split('@')
  const [group, artifact, version, classifier] = coordsRaw.split(':')
  return { group, artifact, version, classifier, ext }
}

export function rulesAllow(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = !rules.some((rule) => rule.action === 'allow')
  for (const rule of rules) {
    let matches = true
    if (rule.os) {
      const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'
      if (rule.os.name && rule.os.name !== osName) matches = false
      if (rule.os.arch) {
        const arch = process.arch === 'x64' ? 'x86_64' : process.arch
        if (rule.os.arch !== arch && rule.os.arch !== 'x86') matches = false
      }
    }
    if (rule.features) {
      for (const [feature, expected] of Object.entries(rule.features)) {
        if (!!features[feature] !== !!expected) matches = false
      }
    }
    if (matches) allowed = rule.action === 'allow'
  }
  return allowed
}

function isNativeLibrary(library: Library): { native: boolean; classifier?: string; legacy: boolean } {
  const parsed = parseLibraryName(library.name)
  if (parsed.classifier && /^natives-windows($|-)/.test(parsed.classifier)) {
    if (parsed.classifier.includes('arm64')) return { native: false, legacy: false }
    return { native: true, classifier: parsed.classifier, legacy: false }
  }
  if (library.natives) {
    const template = library.natives.windows
    if (template) {
      const arch = process.arch === 'x64' ? '64' : '32'
      return { native: true, classifier: template.replace('${arch}', arch), legacy: true }
    }
  }
  return { native: false, legacy: false }
}

export interface PlannedLibraries {
  items: DownloadItem[]
  classpath: string[]
  nativeJars: string[]
}

export function planLibraries(
  libraries: Library[],
  gameDir: string,
  source: DownloadSource,
  features: Record<string, boolean> = {}
): PlannedLibraries {
  const libsDir = path.join(gameDir, 'libraries')
  const items: DownloadItem[] = []
  const classpath: string[] = []
  const nativeJars: string[] = []
  const seen = new Set<string>()

  for (const library of libraries) {
    if (!rulesAllow(library.rules, features)) continue
    const parsed = parseLibraryName(library.name)
    const nativeInfo = isNativeLibrary(library)
    const mavenPath = libraryMavenPath(library.name)
    const isMojangMaven = !library.url || library.url.includes('libraries.minecraft.net')
    const mirrorUrl = `${MIRROR}/maven/${mavenPath}`
    const officialUrl = `${OFFICIAL_LIBS}/${mavenPath}`

    if (nativeInfo.native && nativeInfo.legacy) {
      const artifact = library.downloads?.classifiers?.[nativeInfo.classifier!]
      const libPath = artifact?.path ?? libraryMavenPath(`${library.name}:${nativeInfo.classifier}`)
      const dest = path.join(libsDir, libPath)
      const nativeBase = library.url && !isMojangMaven ? library.url : OFFICIAL_LIBS
      const urls = source === 'official'
        ? [artifact?.url ?? `${nativeBase.replace(/\/$/, '')}/${libPath}`, `${MIRROR}/maven/${libPath}`]
        : [`${MIRROR}/maven/${libPath}`, artifact?.url ?? `${nativeBase.replace(/\/$/, '')}/${libPath}`]
      if (!seen.has(dest)) {
        seen.add(dest)
        items.push({
          urls: urls.filter(Boolean) as string[],
          dest,
          sha1: artifact?.sha1,
          size: artifact?.size,
          label: path.basename(dest)
        })
      }
      nativeJars.push(dest)
      continue
    }

    let artifact = library.downloads?.artifact
    let libPath = artifact?.path ?? mavenPath
    let dest = path.join(libsDir, libPath)

    if (nativeInfo.native) {
      const base = library.url && !isMojangMaven ? library.url : OFFICIAL_LIBS
      const urls = source === 'official'
        ? [artifact?.url ?? `${base.replace(/\/$/, '')}/${libPath}`, `${MIRROR}/maven/${libPath}`]
        : [`${MIRROR}/maven/${libPath}`, artifact?.url ?? `${base.replace(/\/$/, '')}/${libPath}`]
      if (!seen.has(dest)) {
        seen.add(dest)
        items.push({
          urls: urls.filter(Boolean) as string[],
          dest,
          sha1: artifact?.sha1,
          size: artifact?.size,
          label: path.basename(dest)
        })
      }
      nativeJars.push(dest)
      continue
    }

    if (!artifact) {
      const base = library.url && !isMojangMaven ? library.url : OFFICIAL_LIBS
      artifact = {
        url: `${base.replace(/\/$/, '')}/${libPath}`,
        path: libPath
      }
    }
    if (seen.has(dest)) continue
    seen.add(dest)
    const customHost = library.url ?? ''
    const forgeHosted = /maven\.(minecraftforge|neoforged)\.net/i.test(customHost)
    const urls = isMojangMaven || forgeHosted
      ? source === 'official'
        ? [artifact.url ?? officialUrl, mirrorUrl]
        : [mirrorUrl, artifact.url ?? officialUrl]
      : [artifact.url ?? `${customHost.replace(/\/$/, '')}/${libPath}`]
    items.push({
      urls: [...new Set(urls.filter(Boolean))] as string[],
      dest,
      sha1: artifact.sha1,
      size: artifact.size,
      label: path.basename(dest)
    })
    classpath.push(dest)
  }
  return { items, classpath, nativeJars }
}

export async function ensureVersionJson(version: VersionJson, gameDir: string): Promise<string> {
  const dir = path.join(gameDir, 'versions', version.id)
  await ensureDir(dir)
  const file = path.join(dir, `${version.id}.json`)
  await writeJson(file, version)
  return file
}

export interface InstallProgressOptions {
  source: DownloadSource
  report: ProgressReporter
  concurrency?: number
}

export async function installVanilla(
  versionId: string,
  options: InstallProgressOptions
): Promise<void> {
  const { source, report } = options
  report({ stage: 'metadata', message: `读取 ${versionId} 版本信息…` })
  const version = await getVersionJson(versionId, source)
  const settings = await getSettings()
  const gameDir = settings.gameDir
  const versionDir = path.join(gameDir, 'versions', versionId)
  await ensureDir(versionDir)

  const client = version.downloads?.client
  if (!client?.url) throw new Error('该版本没有客户端下载信息')

  report({ stage: 'metadata', message: '获取资源索引…' })
  if (!version.assetIndex?.url) throw new Error('该版本缺少资源索引')
  const assetIndex: AssetIndex = await fetchJson<AssetIndex>([
    version.assetIndex.url,
    `${MIRROR}/assets/indexes/${version.assetIndex.id}.json`,
    `https://launchermeta.mojang.com/v1/packages/${version.assetIndex.sha1}/${version.assetIndex.id}.json`
  ])
  await ensureDir(path.join(gameDir, 'assets', 'indexes'))
  await writeJson(path.join(gameDir, 'assets', 'indexes', `${version.assetIndex.id}.json`), assetIndex)

  const items: DownloadItem[] = []
  const clientDest = path.join(versionDir, `${versionId}.jar`)
  const clientMirror = `${MIRROR}/version/${encodeURIComponent(versionId)}/client`
  items.push({
    urls: source === 'official' ? [client.url, clientMirror] : [clientMirror, client.url],
    dest: clientDest,
    sha1: client.sha1,
    size: client.size,
    label: 'client.jar'
  })

  const planned = planLibraries(version.libraries ?? [], gameDir, source)
  items.push(...planned.items)

  const assetItems: DownloadItem[] = []
  const assetDests = new Set<string>()
  const objectEntries = Object.entries(assetIndex.objects ?? {})
  for (const [, object] of objectEntries) {
    const hash = object.hash
    const rel = `${hash.slice(0, 2)}/${hash}`
    const dest = path.join(gameDir, 'assets', 'objects', hash.slice(0, 2), hash)
    if (assetDests.has(dest)) continue
    assetDests.add(dest)
    assetItems.push({
      urls:
        source === 'official'
          ? [`${OFFICIAL_RESOURCES}/${rel}`, `${MIRROR}/assets/${rel}`]
          : [`${MIRROR}/assets/${rel}`, `${OFFICIAL_RESOURCES}/${rel}`],
      dest,
      sha1: hash,
      size: object.size,
      label: `资源 ${hash.slice(0, 7)}`
    })
  }
  items.push(...assetItems)

  const loggingFile = version.logging?.client?.file
  let logConfigPath: string | null = null
  if (loggingFile?.url) {
    logConfigPath = path.join(gameDir, 'assets', 'log_configs', loggingFile.id)
    items.push({
      urls: [loggingFile.url],
      dest: logConfigPath,
      sha1: loggingFile.sha1,
      size: loggingFile.size,
      label: loggingFile.id
    })
  }

  report({ stage: 'download', message: '准备下载游戏文件…', current: 0, total: items.length, bytes: 0, totalBytes: 0 })
  await downloadAll(items, {
    concurrency: options.concurrency ?? settings.maxConcurrent,
    onProgress: (progress) => {
      report({
        stage: 'download',
        message: progress.label,
        current: progress.completed,
        total: progress.total,
        bytes: progress.bytes,
        totalBytes: progress.totalBytes
      })
    }
  })

  report({ stage: 'natives', message: '释放本地运行库…' })
  await extractNatives(planned.nativeJars, path.join(versionDir, 'natives'))

  if (assetIndex.virtual) {
    report({ stage: 'assets', message: '整理旧版资源文件…' })
    const virtualDir = path.join(gameDir, 'assets', 'virtual', version.assetIndex.id)
    await copyAssetsTo(assetIndex, path.join(gameDir, 'assets', 'objects'), virtualDir)
  }
  if (assetIndex.map_to_resources) {
    report({ stage: 'assets', message: '映射旧版资源文件…' })
    const resourcesDir = path.join(gameDir, 'resources')
    await copyAssetsTo(assetIndex, path.join(gameDir, 'assets', 'objects'), resourcesDir)
  }

  if (logConfigPath && version.logging?.client) {
    const arg = version.logging.client.argument.replace('${path}', logConfigPath)
    const cacheFile = path.join(gameDir, 'versions', versionId, 'logging-argument.txt')
    await fs.writeFile(cacheFile, arg, 'utf8')
  }

  // Write the version JSON last: listInstalledVersions treats a version as installed
  // only when this file exists, so a failed download never looks complete.
  await ensureVersionJson(version, gameDir)

  report({
    stage: 'done',
    message: `${versionId} 安装完成`,
    current: items.length,
    total: items.length,
    done: true
  })
}

async function copyAssetsTo(
  index: AssetIndex,
  objectsDir: string,
  targetDir: string
): Promise<void> {
  const seen = new Set<string>()
  for (const [name, object] of Object.entries(index.objects ?? {})) {
    const targetName = name
    if (seen.has(targetName)) continue
    seen.add(targetName)
    const src = path.join(objectsDir, object.hash.slice(0, 2), object.hash)
    const dest = path.join(targetDir, ...targetName.split('/'))
    try {
      await ensureDir(path.dirname(dest))
      await fs.copyFile(src, dest)
    } catch {
      // A missing optional asset should not stop the installation.
    }
  }
}

export async function extractNatives(nativeJars: string[], nativesDir: string): Promise<void> {
  await fs.rm(nativesDir, { recursive: true, force: true })
  await ensureDir(nativesDir)
  const AdmZip = (await import('adm-zip')).default
  for (const jar of nativeJars) {
    if (!(await pathExists(jar))) continue
    try {
      const zip = new AdmZip(jar)
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const base = path.basename(entry.entryName)
        if (!/\.(dll|so|dylib)$/i.test(base)) continue
        await fs.writeFile(path.join(nativesDir, base), entry.getData())
      }
    } catch {
      // ignore a corrupt optional native archive; launch will surface missing libs
    }
  }
}

export async function listInstalledVersions(): Promise<InstalledVersion[]> {
  const settings = await getSettings()
  const versionsDir = path.join(settings.gameDir, 'versions')
  await ensureDir(versionsDir)
  const entries = await fs.readdir(versionsDir, { withFileTypes: true }).catch(() => [])
  const result: InstalledVersion[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const jsonFile = path.join(versionsDir, entry.name, `${entry.name}.json`)
    const json = await readJson<VersionJson | null>(jsonFile, null)
    if (!json) continue
    let loader: LoaderKind = 'vanilla'
    const lower = entry.name.toLowerCase()
    if (lower.includes('neoforge')) loader = 'neoforge'
    else if (lower.includes('forge')) loader = 'forge'
    else if (lower.includes('fabric')) loader = 'fabric'
    else if (lower.includes('quilt')) loader = 'quilt'
    const baseVersion = json.inheritsFrom
    let loaderVersion: string | undefined
    if (loader === 'fabric') {
      const match = entry.name.match(/^fabric-loader-(.+)-([^-]+)$/)
      loaderVersion = match?.[1]
    } else if (loader === 'quilt') {
      const match = entry.name.match(/^quilt-loader-(.+)-([^-]+)$/)
      loaderVersion = match?.[1]
    } else if (loader === 'forge' || loader === 'neoforge') {
      const match = entry.name.match(/(?:neoforge|forge)-?(.+)$/i)
      if (match) {
        const raw = match[1]
        loaderVersion =
          baseVersion && raw.startsWith(`${baseVersion}-`)
            ? raw.slice(baseVersion.length + 1)
            : raw
      }
    }
    const sizeBytes = await folderSize(path.join(versionsDir, entry.name))
    result.push({
      id: entry.name,
      name: baseVersion ?? entry.name,
      type: (json.type as VersionType | 'modified') ?? 'release',
      releaseTime: json.releaseTime ?? json.time,
      loader,
      baseVersion,
      loaderVersion,
      sizeBytes
    })
  }
  // Loader profiles carry the installer's build timestamp; use the base game's
  // release date wherever the UI presents a game version date.
  for (const version of result) {
    if (version.loader === 'vanilla' || !version.baseVersion) continue
    const base = result.find((entry) => entry.id === version.baseVersion)
    if (base?.releaseTime) version.releaseTime = base.releaseTime
  }
  return result.sort((a, b) => {
    if (a.loader !== b.loader) return a.loader === 'vanilla' ? -1 : 1
    return (b.releaseTime ?? '').localeCompare(a.releaseTime ?? '')
  })
}

export async function folderSize(dir: string): Promise<number> {
  let total = 0
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) total += await folderSize(full)
      else {
        try {
          total += (await fs.stat(full)).size
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }
  return total
}

export async function deleteVersion(versionId: string): Promise<void> {
  const settings = await getSettings()
  const installed = await listInstalledVersions()
  const dependents = installed.filter((version) => version.baseVersion === versionId)
  if (dependents.length) {
    throw new Error(`请先删除依赖该版本的加载器：${dependents.map((v) => v.id).join('、')}`)
  }
  const dir = path.join(settings.gameDir, 'versions', versionId)
  const resolved = path.resolve(dir)
  const versionsRoot = path.resolve(path.join(settings.gameDir, 'versions'))
  if (!resolved.startsWith(versionsRoot + path.sep)) throw new Error('非法的版本路径')
  await fs.rm(resolved, { recursive: true, force: true })
}

export async function loadInstalledVersionJson(versionId: string): Promise<VersionJson> {
  const settings = await getSettings()
  const file = path.join(settings.gameDir, 'versions', versionId, `${versionId}.json`)
  const json = await readJson<VersionJson | null>(file, null)
  if (!json) throw new Error(`未找到版本 ${versionId}，请先安装`)
  return json
}

export interface MergedVersion {
  id: string
  baseId: string
  type: string
  releaseTime?: string
  mainClass: string
  assets: string
  assetIndex: VersionJson['assetIndex']
  libraries: Library[]
  jvmArgs: LaunchArgument[]
  gameArgs: LaunchArgument[]
  minecraftArguments?: string
  javaMajor: number
  logging?: VersionJson['logging']
  clientJar: string
  nativesDir: string
  versionDir: string
}

export async function mergeVersion(versionId: string): Promise<MergedVersion> {
  const settings = await getSettings()
  const child = await loadInstalledVersionJson(versionId)
  const chain: VersionJson[] = [child]
  let current = child
  const guard = new Set<string>()
  while (current.inheritsFrom) {
    if (guard.has(current.inheritsFrom)) throw new Error('版本继承链存在循环')
    guard.add(current.inheritsFrom)
    const parent = await loadInstalledVersionJson(current.inheritsFrom)
    chain.push(parent)
    current = parent
  }
  const parent = chain.length > 1 ? chain[chain.length - 1] : undefined
  const baseId = parent?.id ?? child.id

  const libraries: Library[] = []
  const libraryKeys = new Set<string>()
  for (const version of chain) {
    for (const library of version.libraries ?? []) {
      // Modern version JSON lists the normal jar and its native jar as two
      // separate libraries with the same Maven name. Include the native
      // metadata in the key so merging an inheriting profile keeps both.
      const key = `${library.name}|${Object.keys(library.natives ?? {}).sort().join(',')}|${Object.keys(
        library.downloads?.classifiers ?? {}
      )
        .sort()
        .join(',')}`
      if (!libraryKeys.has(key)) {
        libraryKeys.add(key)
        libraries.push(library)
      }
    }
  }

  const gameArgs: LaunchArgument[] = []
  const jvmArgs: LaunchArgument[] = []
  for (const version of [...chain].reverse()) {
    if (version.arguments?.jvm) jvmArgs.push(...version.arguments.jvm)
    if (version.arguments?.game) gameArgs.push(...version.arguments.game)
  }

  const assetIndex = chain.find((version) => version.assetIndex)?.assetIndex
  const assets = chain.find((version) => version.assets)?.assets
  if (!assetIndex || !assets) throw new Error('版本缺少资源索引')
  const javaMajor =
    chain.find((version) => version.javaVersion?.majorVersion)?.javaVersion?.majorVersion ??
    (assetIndex.id && Number(assetIndex.id.split('.')[1]) <= 16 ? 8 : 17)

  const clientVersion = chain.find((version) => version.downloads?.client)?.id ?? baseId
  const jarName = child.jar ?? parent?.jar ?? clientVersion
  const clientJar = path.join(settings.gameDir, 'versions', clientVersion, `${clientVersion}.jar`)
  const versionDir = path.join(settings.gameDir, 'versions', versionId)
  const nativesDir = path.join(versionDir, 'natives')

  return {
    id: child.id,
    baseId,
    type: child.type ?? parent?.type ?? 'release',
    releaseTime: child.releaseTime ?? parent?.releaseTime,
    mainClass: child.mainClass,
    assets,
    assetIndex,
    libraries,
    jvmArgs,
    gameArgs,
    minecraftArguments: child.minecraftArguments ?? parent?.minecraftArguments,
    javaMajor,
    logging: chain.find((version) => version.logging?.client)?.logging,
    clientJar: path.join(settings.gameDir, 'versions', jarName, `${jarName}.jar`),
    nativesDir,
    versionDir
  }
}

export async function ensureVersionFiles(versionId: string): Promise<void> {
  const merged = await mergeVersion(versionId)
  const missing: string[] = []
  if (!(await pathExists(merged.clientJar))) missing.push('client.jar')
  if (!(await pathExists(path.join(merged.versionDir, `${versionId}.json`)))) missing.push('version.json')
  if (merged.assetIndex) {
    const index = path.join(
      (await getSettings()).gameDir,
      'assets',
      'indexes',
      `${merged.assetIndex.id}.json`
    )
    if (!(await pathExists(index))) missing.push('assets index')
  }
  if (missing.length) throw new Error(`版本文件不完整（缺少 ${missing.join('、')}），请重新安装`)
}

export function sha1OfString(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

export async function readAssetObject(gameDir: string, hash: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(gameDir, 'assets', 'objects', hash.slice(0, 2), hash))
  } catch {
    return null
  }
}

export async function waitForFile(file: string, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await pathExists(file)) return true
    await sleep(150)
  }
  return false
}

export async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await httpFetch(url, { method: 'HEAD', timeoutMs: 15_000 })
    return res.ok
  } catch {
    return false
  }
}

export async function getText(url: string): Promise<string> {
  return fetchText(url)
}
