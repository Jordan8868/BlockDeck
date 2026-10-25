import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import type {
  DownloadSource,
  LoaderKind,
  LoaderOptions,
  LoaderVersion,
  ProgressReporter
} from '@shared/types'
import { getSettings } from './store'
import { ensureJava } from './java'
import {
  Library,
  MIRROR,
  VersionJson,
  ensureVersionJson,
  getVersionJson,
  installVanilla,
  listInstalledVersions,
  planLibraries
} from './minecraft'
import {
  downloadAll,
  downloadFile,
  ensureDir,
  fetchJson,
  fetchText,
  pathExists,
  readJson,
  writeJson
} from './util'

export interface LoaderInstallOptions {
  mcVersion: string
  loaderVersion?: string
  source: DownloadSource
  report: ProgressReporter
  onLog?: (line: string) => void
  concurrency?: number
}

/** Child installs (base game, Java) must not finish the loader task early. */
function nestedReport(report: ProgressReporter): ProgressReporter {
  return (event) => {
    const { done: _done, ...rest } = event
    report(rest)
  }
}

const FORGE_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const FORGE_MIRROR_METADATA = `${MIRROR}/maven/net/minecraftforge/forge/maven-metadata.xml`
const NEOFORGE_MIRROR_METADATA = `${MIRROR}/maven/net/neoforged/neoforge/maven-metadata.xml`
const NEOFORGE_LEGACY_MIRROR_METADATA = `${MIRROR}/maven/net/neoforged/forge/maven-metadata.xml`

function parseXmlVersions(xml: string): string[] {
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1]).reverse()
}

async function fetchXmlVersions(urls: string[]): Promise<string[]> {
  let lastError: unknown
  for (const url of urls) {
    try {
      const xml = await fetchText(url)
      const versions = parseXmlVersions(xml)
      if (versions.length) return versions
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法读取加载器版本列表')
}

async function fabricOptions(mcVersion: string): Promise<LoaderOptions> {
  let data: Array<{
    loader: { version: string; stable?: boolean }
    intermediary?: { version: string }
  }>
  try {
    data = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`)
  } catch {
    throw new Error(`Fabric 暂不支持 Minecraft ${mcVersion}（需要 1.14 或更高版本）`)
  }
  if (!Array.isArray(data) || !data.length) throw new Error(`Fabric 暂不支持 Minecraft ${mcVersion}`)
  const versions: LoaderVersion[] = data.map((entry) => ({
    version: entry.loader.version,
    label: `Fabric Loader ${entry.loader.version}`,
    stable: entry.loader.stable !== false,
    mcVersion
  }))
  const stable = versions.find((version) => version.stable) ?? versions[0]
  return {
    recommended: stable.version,
    latest: versions[0]?.version,
    versions
  }
}

async function quiltOptions(mcVersion: string): Promise<LoaderOptions> {
  let data: Array<{ loader: { version: string; stable?: boolean } }>
  try {
    data = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`)
  } catch {
    throw new Error(`Quilt 暂不支持 Minecraft ${mcVersion}（需要 1.14 或更高版本）`)
  }
  if (!Array.isArray(data) || !data.length) throw new Error(`Quilt 暂不支持 Minecraft ${mcVersion}`)
  const versions: LoaderVersion[] = data.map((entry) => ({
    version: entry.loader.version,
    label: `Quilt Loader ${entry.loader.version}`,
    stable: entry.loader.stable !== false && !entry.loader.version.includes('beta'),
    mcVersion
  }))
  const stable = versions.find((version) => version.stable) ?? versions[0]
  return { recommended: stable.version, latest: versions[0]?.version, versions }
}

function mcPrefixForNeo(mcVersion: string): string {
  const parts = mcVersion.split('.')
  if (parts[0] !== '1' || parts.length < 3) return ''
  return `${parts[1]}.${parts[2]}.`
}

async function forgeOptions(mcVersion: string): Promise<LoaderOptions> {
  const versions = await fetchXmlVersions([FORGE_METADATA, FORGE_MIRROR_METADATA])
  const all = versions
    .map((full) => {
      const dash = full.indexOf('-')
      if (dash < 0) return null
      const mc = full.slice(0, dash)
      if (mc !== mcVersion) return null
      return full.slice(dash + 1)
    })
    .filter((version): version is string => !!version)
  if (!all.length) throw new Error(`Forge 暂不支持 Minecraft ${mcVersion}`)
  let recommended: string | undefined
  let latest: string | undefined
  try {
    const promos = await fetchJson<{ promos: Record<string, string> }>(
      'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
    )
    recommended = promos.promos?.[`${mcVersion}-recommended`]
    latest = promos.promos?.[`${mcVersion}-latest`]
  } catch {
    // promotions are optional metadata
  }
  const unique = [...new Set(all)]
  const pinned = [recommended, latest].filter(
    (version): version is string => !!version && unique.includes(version)
  )
  const ordered = [...new Set([...pinned, ...unique])].slice(0, 60)
  const versionsList: LoaderVersion[] = ordered.map((version) => ({
    version,
    label: version,
    stable: version === recommended || version === latest,
    mcVersion
  }))
  return {
    recommended: recommended && unique.includes(recommended) ? recommended : unique[0],
    latest: latest && unique.includes(latest) ? latest : unique[0],
    versions: versionsList,
    note: recommended ? `推荐 ${recommended} · 最新 ${latest ?? unique[0]}` : '选择要安装的 Forge 版本'
  }
}

async function neoforgeOptions(mcVersion: string): Promise<LoaderOptions> {
  const legacy = mcVersion === '1.20.1'
  const versions = await fetchXmlVersions([
    legacy ? NEOFORGE_LEGACY_MIRROR_METADATA : NEOFORGE_MIRROR_METADATA,
    legacy
      ? `${MIRROR}/maven/net/neoforged/forge/maven-metadata.xml`
      : `${MIRROR}/maven/net/neoforged/neoforge/maven-metadata.xml`
  ])
  const prefix = legacy ? '1.20.1-' : mcPrefixForNeo(mcVersion)
  if (!prefix) throw new Error(`NeoForge 暂不支持 Minecraft ${mcVersion}`)
  const matching = versions.filter((version) => version.startsWith(prefix))
  if (!matching.length) throw new Error(`该 Minecraft 版本暂无 NeoForge 构建（需要 1.20.1 或 1.20.2+）`)
  const stripped = matching.map((version) => version.slice(prefix.length))
  const list: LoaderVersion[] = stripped.slice(0, 60).map((version, index) => ({
    version: matching[index],
    label: version,
    stable: index === 0,
    mcVersion
  }))
  return {
    recommended: list[0]?.version,
    latest: list[0]?.version,
    versions: list,
    note: legacy ? 'NeoForge 1.20.1 兼容分支' : `NeoForge ${stripped[0]}`
  }
}

export async function getLoaderOptions(mcVersion: string, kind: LoaderKind): Promise<LoaderOptions> {
  if (kind === 'fabric') return fabricOptions(mcVersion)
  if (kind === 'quilt') return quiltOptions(mcVersion)
  if (kind === 'forge') return forgeOptions(mcVersion)
  if (kind === 'neoforge') return neoforgeOptions(mcVersion)
  return { versions: [], note: '原版无需安装加载器' }
}

async function installProfile(
  profile: VersionJson & { libraries?: import('./minecraft').Library[] },
  options: LoaderInstallOptions
): Promise<void> {
  const { source, report, concurrency } = options
  const settings = await getSettings()
  const versionDir = path.join(settings.gameDir, 'versions', profile.id)
  await ensureDir(versionDir)

  const planned = planLibraries(profile.libraries ?? [], settings.gameDir, source)
  report({
    stage: 'loader',
    message: `下载 ${profile.id} 所需的 ${planned.items.length} 个库文件…`,
    current: 0,
    total: planned.items.length,
    bytes: 0,
    totalBytes: 0
  })
  await downloadAll(planned.items, {
    concurrency: concurrency ?? settings.maxConcurrent,
    onProgress: (progress) => {
      report({
        stage: 'loader',
        message: progress.label,
        current: progress.completed,
        total: progress.total,
        bytes: progress.bytes,
        totalBytes: progress.totalBytes
      })
    }
  })
  await ensureVersionJson(profile, settings.gameDir)
}

async function ensureBaseVersion(mcVersion: string, options: LoaderInstallOptions): Promise<void> {
  const installed = await listInstalledVersions()
  const settings = await getSettings()
  const base = installed.find((version) => version.id === mcVersion)
  if (base) {
    const json = path.join(settings.gameDir, 'versions', mcVersion, `${mcVersion}.json`)
    const jar = path.join(settings.gameDir, 'versions', mcVersion, `${mcVersion}.jar`)
    if ((await pathExists(json)) && (await pathExists(jar))) {
      options.report({ stage: 'base', message: `基础版本 ${mcVersion} 已安装` })
      return
    }
  }
  options.report({ stage: 'base', message: `先安装基础版本 ${mcVersion}…` })
  await installVanilla(mcVersion, {
    source: options.source,
    report: nestedReport(options.report),
    concurrency: options.concurrency
  })
}

async function installFabricLike(
  mcVersion: string,
  loaderVersion: string,
  kind: 'fabric' | 'quilt',
  options: LoaderInstallOptions
): Promise<string> {
  const base =
    kind === 'fabric'
      ? `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(
          loaderVersion
        )}/profile/json`
      : `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(
          loaderVersion
        )}/profile/json`
  options.report({ stage: 'loader', message: `获取 ${kind === 'fabric' ? 'Fabric' : 'Quilt'} 安装配置…` })
  const profile = await fetchJson<VersionJson>(base)
  profile.id = profile.id ?? `${kind}-loader-${loaderVersion}-${mcVersion}`
  if (!profile.inheritsFrom) profile.inheritsFrom = mcVersion
  await ensureBaseVersion(mcVersion, options)
  await installProfile(profile, options)
  options.report({ stage: 'done', message: `${profile.id} 安装完成`, done: true })
  return profile.id
}

async function createLauncherProfiles(gameDir: string): Promise<void> {
  const file = path.join(gameDir, 'launcher_profiles.json')
  if (await pathExists(file)) return
  await writeJson(file, {
    profiles: {},
    settings: { enableSnapshots: false, keepLauncherOpen: false, showMenu: false },
    version: 3
  })
}

async function spawnInstaller(
  javaPath: string,
  installerPath: string,
  gameDir: string,
  options: LoaderInstallOptions,
  args: string[]
): Promise<void> {
  const tempDir = path.join(gameDir, 'temp')
  await ensureDir(tempDir)
  const javaArgs = ['-Xmx1G', `-Djava.io.tmpdir=${tempDir}`, '-Dfile.encoding=UTF-8', '-jar', installerPath, ...args]
  options.onLog?.(`$ "${javaPath}" ${javaArgs.join(' ')}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(javaPath, javaArgs, {
      cwd: gameDir,
      windowsHide: true,
      env: { ...process.env }
    })
    let buffer = ''
    let errorLines: string[] = []
    let lastError = ''
    const consume = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        options.onLog?.(line)
        if (/error|failed|exception/i.test(line)) {
          lastError = line.trim()
          errorLines.push(lastError)
          errorLines = errorLines.slice(-6)
        } else if (/download|install|extract/i.test(line)) {
          options.report({ stage: 'installer', message: line.trim().slice(0, 160) })
        }
      }
    }
    child.stdout.on('data', consume)
    child.stderr.on('data', consume)
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('安装器运行超时（15 分钟）'))
    }, 15 * 60_000)
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (buffer.trim()) options.onLog?.(buffer.trim())
      if (code === 0) resolve()
      else {
        reject(
          new Error(
            `安装器退出码 ${code}${lastError ? `：${lastError}` : ''}${
              errorLines.length ? `\n${errorLines.join('\n')}` : ''
            }`
          )
        )
      }
    })
  })
}

async function installLegacyForgeProfile(
  installerPath: string,
  options: LoaderInstallOptions
): Promise<void> {
  const zip = new AdmZip(installerPath)
  const entry = zip.getEntry('install_profile.json')
  if (!entry) throw new Error('旧版 Forge 安装器缺少 install_profile.json，无法自动安装')
  const parsed = JSON.parse(entry.getData().toString('utf8')) as {
    versionInfo?: VersionJson
    install?: { filePath?: string; path?: string }
  }
  const profile = parsed.versionInfo
  if (!profile || !profile.id) {
    throw new Error('旧版 Forge 安装器没有提供客户端版本信息')
  }
  if (!profile.inheritsFrom) profile.inheritsFrom = options.mcVersion
  profile.libraries = (profile.libraries ?? [])
    .filter((library) => (library as Library & { clientreq?: boolean }).clientreq !== false)
    .map((library) => {
      const parts = library.name.split(':')
      // The old installer embedded the universal jar and copied it into the
      // library tree; its install profile points at the unclassified coordinate.
      if (parts[0] === 'net.minecraftforge' && parts[1] === 'forge' && parts.length === 3) {
        return { ...library, name: `${library.name}:universal` }
      }
      return library
    })
  options.report({ stage: 'loader', message: '旧版兼容模式：正在下载 Forge 库文件…' })
  await installProfile(profile, options)
  options.report({ stage: 'installer', message: '旧版 Forge 文件已安装' })
}

async function runInstaller(
  javaPath: string,
  installerPath: string,
  gameDir: string,
  options: LoaderInstallOptions,
  mirrorUrl: string
): Promise<void> {
  const args = ['--installClient', gameDir]
  if (mirrorUrl) args.push('--mirror', mirrorUrl)
  options.report({ stage: 'installer', message: '正在运行安装器（首次安装需要下载依赖，可能耗时数分钟）…' })
  try {
    await spawnInstaller(javaPath, installerPath, gameDir, options, args)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/installClient|unrecognizedoption|not a recognized option/i.test(message)) throw err
    // Forge 1.8.9 and older installers have no headless client switch. Their
    // install_profile.json still contains a complete client version description.
    options.onLog?.('[BlockDeck] 检测到旧版 Forge 安装器，切换到兼容安装模式')
    await installLegacyForgeProfile(installerPath, options)
  }
}

async function installerVersionId(installerPath: string): Promise<string | null> {
  try {
    const zip = new AdmZip(installerPath)
    const entry = zip.getEntry('version.json')
    if (!entry) return null
    const data = JSON.parse(entry.getData().toString('utf8')) as { id?: string }
    return data.id ?? null
  } catch {
    return null
  }
}

async function installWithInstaller(
  mcVersion: string,
  kind: 'forge' | 'neoforge',
  options: LoaderInstallOptions
): Promise<string> {
  const loaderOptions = await getLoaderOptions(mcVersion, kind)
  const selected =
    options.loaderVersion ??
    loaderOptions.recommended ??
    loaderOptions.latest ??
    loaderOptions.versions[0]?.version
  if (!selected) throw new Error(`没有可用的 ${kind === 'forge' ? 'Forge' : 'NeoForge'} 版本`)
  if (!loaderOptions.versions.some((version) => version.version === selected) && options.loaderVersion) {
    // allow manual versions not listed in the trimmed UI list
  }

  const versionMeta = await getVersionJson(mcVersion, options.source)
  const javaMajor = versionMeta.javaVersion?.majorVersion ?? 17
  await ensureBaseVersion(mcVersion, options)
  options.report({ stage: 'java', message: `准备 Java ${javaMajor} 用于安装器…` })
  const java = await ensureJava(javaMajor, nestedReport(options.report))

  const settings = await getSettings()
  const cacheDir = path.join(settings.gameDir, 'cache', 'installers')
  await ensureDir(cacheDir)
  let fileName: string
  let urls: string[]
  if (kind === 'forge') {
    fileName = `forge-${mcVersion}-${selected}-installer.jar`
    const mavenPath = `net/minecraftforge/forge/${mcVersion}-${selected}/forge-${mcVersion}-${selected}-installer.jar`
    urls = [
      `${MIRROR}/maven/${mavenPath}`,
      `https://maven.minecraftforge.net/${mavenPath}`
    ]
  } else if (selected.startsWith('1.20.1-')) {
    fileName = `forge-${selected}-installer.jar`
    const mavenPath = `net/neoforged/forge/${selected}/forge-${selected}-installer.jar`
    urls = [`${MIRROR}/maven/${mavenPath}`, `https://maven.neoforged.net/releases/${mavenPath}`]
  } else {
    fileName = `neoforge-${selected}-installer.jar`
    const mavenPath = `net/neoforged/neoforge/${selected}/neoforge-${selected}-installer.jar`
    urls = [`${MIRROR}/maven/${mavenPath}`, `https://maven.neoforged.net/releases/${mavenPath}`]
  }
  const installerPath = path.join(cacheDir, fileName)
  options.report({ stage: 'installer', message: '下载加载器安装器…' })
  await downloadFile({ urls, dest: installerPath, label: fileName }, undefined, 5 * 60_000)

  await createLauncherProfiles(settings.gameDir)
  const expectedId = await installerVersionId(installerPath)
  const before = new Set((await listInstalledVersions()).map((version) => version.id))
  options.report({ stage: 'installer', message: '运行安装器，请稍候…' })
  if (!expectedId) {
    // Old Forge installers (1.8.9 and earlier) have no headless client mode and
    // no version.json; their install profile is complete enough for us to use.
    options.onLog?.('[BlockDeck] 检测到旧版 Forge 安装器，使用兼容安装模式')
    await installLegacyForgeProfile(installerPath, options)
  } else {
    await runInstaller(java.path, installerPath, settings.gameDir, options, `${MIRROR}/maven`)
  }
  const after = await listInstalledVersions()
  let installed = expectedId ? after.find((version) => version.id === expectedId) : undefined
  if (!installed) {
    installed = after.find(
      (version) =>
        !before.has(version.id) &&
        (version.id.toLowerCase().includes('forge') || version.id.toLowerCase().includes('neoforge'))
    )
  }
  if (!installed) {
    throw new Error('安装器已退出，但没有检测到新版本。请查看安装日志中的错误。')
  }
  options.report({ stage: 'done', message: `${installed.id} 安装完成`, done: true })
  return installed.id
}

export async function installLoader(
  kind: LoaderKind,
  options: LoaderInstallOptions
): Promise<{ versionId: string }> {
  const { mcVersion } = options
  if (kind === 'vanilla') {
    await ensureBaseVersion(mcVersion, options)
    return { versionId: mcVersion }
  }
  if (kind === 'fabric' || kind === 'quilt') {
    const loaderOptions = await getLoaderOptions(mcVersion, kind)
    const selected =
      options.loaderVersion ??
      loaderOptions.recommended ??
      loaderOptions.latest ??
      loaderOptions.versions[0]?.version
    if (!selected) throw new Error('没有可用的加载器版本')
    const versionId = await installFabricLike(mcVersion, selected, kind, options)
    return { versionId }
  }
  if (kind === 'forge' || kind === 'neoforge') {
    const versionId = await installWithInstaller(mcVersion, kind, options)
    return { versionId }
  }
  throw new Error('未知的加载器类型')
}

export async function verifyLoaderProfile(versionId: string): Promise<boolean> {
  const settings = await getSettings()
  return pathExists(path.join(settings.gameDir, 'versions', versionId, `${versionId}.json`))
}
