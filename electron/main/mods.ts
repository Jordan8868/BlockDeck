import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  InstalledMod,
  ModInstallResult,
  ModSearchHit,
  ModSearchResult,
  ProgressReporter
} from '@shared/types'
import { getSettings } from './store'
import { listInstalledVersions } from './minecraft'
import {
  downloadFile,
  ensureDir,
  fetchJson,
  pathExists,
  readJson,
  sanitizeFileName,
  writeJson
} from './util'

const API = 'https://api.modrinth.com/v2'
const META_FILE = '.blockdeck-meta.json'

interface ModrinthSearchResponse {
  hits: Array<{
    project_id: string
    slug: string
    title: string
    description: string
    author: string
    icon_url?: string
    downloads: number
    follows: number
    categories: string[]
    versions: string[]
    loaders: string[]
    date_modified: string
  }>
  total_hits: number
  offset: number
  limit: number
}

interface ModrinthVersion {
  id: string
  project_id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  date_published: string
  files: Array<{
    url: string
    filename: string
    primary: boolean
    size: number
    hashes: { sha1?: string; sha512?: string }
  }>
  dependencies: Array<{
    version_id?: string | null
    project_id?: string | null
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
  }>
}

interface MetaEntry {
  projectId: string
  title: string
  fileName: string
  versionId: string
  versionNumber: string
  gameVersion: string
  loader: string
  installedAt: number
}

interface ModMetaFile {
  mods: Record<string, MetaEntry>
}

export interface ModSearchOptions {
  query: string
  gameVersion?: string
  loader?: string
  offset?: number
  limit?: number
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
}

export async function searchMods(options: ModSearchOptions): Promise<ModSearchResult> {
  const facets: string[][] = [['project_type:mod']]
  if (options.gameVersion) facets.push([`versions:${options.gameVersion}`])
  if (options.loader) facets.push([`categories:${options.loader}`])
  const params = new URLSearchParams({
    query: options.query ?? '',
    facets: JSON.stringify(facets),
    index: options.sort ?? 'relevance',
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 20)
  })
  const data = await fetchJson<ModrinthSearchResponse>(`${API}/search?${params.toString()}`)
  const hits: ModSearchHit[] = (data.hits ?? []).map((hit) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url,
    downloads: hit.downloads,
    follows: hit.follows,
    categories: hit.categories ?? [],
    versions: hit.versions ?? [],
    loaders: hit.loaders ?? [],
    dateModified: hit.date_modified
  }))
  return {
    hits,
    totalHits: data.total_hits ?? hits.length,
    offset: data.offset ?? 0,
    limit: data.limit ?? hits.length
  }
}

async function modsDir(): Promise<string> {
  const settings = await getSettings()
  const dir = path.join(settings.gameDir, 'mods')
  await ensureDir(dir)
  return dir
}

async function readMeta(dir: string): Promise<ModMetaFile> {
  return readJson<ModMetaFile>(path.join(dir, META_FILE), { mods: {} })
}

async function writeMeta(dir: string, meta: ModMetaFile): Promise<void> {
  await writeJson(path.join(dir, META_FILE), meta)
}

export async function listInstalledMods(): Promise<InstalledMod[]> {
  const dir = await modsDir()
  const meta = await readMeta(dir)
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const byFile = new Map(Object.values(meta.mods).map((entry) => [entry.fileName, entry]))
  const result: InstalledMod[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.jar(\.disabled)?$/i.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    const stat = await fs.stat(full).catch(() => null)
    const record = byFile.get(entry.name) ?? byFile.get(entry.name.replace(/\.disabled$/, ''))
    result.push({
      fileName: entry.name,
      projectId: record?.projectId,
      projectTitle: record?.title,
      size: stat?.size ?? 0,
      enabled: !entry.name.endsWith('.disabled'),
      path: full
    })
  }
  return result.sort((a, b) => (a.projectTitle ?? a.fileName).localeCompare(b.projectTitle ?? b.fileName))
}

export async function toggleMod(fileName: string, enabled: boolean): Promise<void> {
  const dir = await modsDir()
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('非法的模组文件名')
  }
  const from = path.join(dir, fileName)
  if (!(await pathExists(from))) throw new Error('模组文件不存在')
  const targetName = enabled
    ? fileName.endsWith('.disabled')
      ? fileName.slice(0, -'.disabled'.length)
      : fileName
    : fileName.endsWith('.disabled')
      ? fileName
      : `${fileName}.disabled`
  if (targetName !== fileName) await fs.rename(from, path.join(dir, targetName))
  const meta = await readMeta(dir)
  for (const entry of Object.values(meta.mods)) {
    if (entry.fileName === fileName) entry.fileName = targetName
  }
  await writeMeta(dir, meta)
}

export async function deleteMod(fileName: string): Promise<void> {
  const dir = await modsDir()
  if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error('非法的模组文件名')
  }
  await fs.rm(path.join(dir, fileName), { force: true })
  const meta = await readMeta(dir)
  for (const [projectId, entry] of Object.entries(meta.mods)) {
    if (entry.fileName === fileName) delete meta.mods[projectId]
  }
  await writeMeta(dir, meta)
}

async function listVersions(projectId: string, gameVersion: string, loader: string): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams({
    game_versions: JSON.stringify([gameVersion]),
    loaders: JSON.stringify([loader])
  })
  const versions = await fetchJson<ModrinthVersion[]>(
    `${API}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`
  )
  return (versions ?? [])
    .filter(
      (version) =>
        version.game_versions?.includes(gameVersion) && version.loaders?.includes(loader)
    )
    .sort((a, b) => (b.date_published ?? '').localeCompare(a.date_published ?? ''))
}

async function versionById(id: string): Promise<ModrinthVersion> {
  return fetchJson<ModrinthVersion>(`${API}/version/${encodeURIComponent(id)}`)
}

async function projectTitle(projectId: string): Promise<string> {
  try {
    const project = await fetchJson<{ title?: string; slug?: string }>(
      `${API}/project/${encodeURIComponent(projectId)}`
    )
    return project.title ?? project.slug ?? projectId
  } catch {
    return projectId
  }
}

interface InstallContext {
  gameDir: string
  modsDir: string
  meta: ModMetaFile
  gameVersion: string
  loader: string
  installed: string[]
  skipped: string[]
  seen: Set<string>
  report: ProgressReporter
}

async function installVersion(ctx: InstallContext, version: ModrinthVersion, title: string): Promise<void> {
  if (!version) return
  if (ctx.seen.has(version.project_id)) return
  ctx.seen.add(version.project_id)
  const primary = version.files?.find((file) => file.primary) ?? version.files?.[0]
  if (!primary) throw new Error(`${title} 没有可下载的文件`)

  const existing = ctx.meta.mods[version.project_id]
  if (existing) {
    const existingPath = path.join(ctx.modsDir, existing.fileName)
    if (await pathExists(existingPath)) {
      if (existing.versionId === version.id) {
        ctx.skipped.push(title)
        return
      }
      await fs.rm(existingPath, { force: true })
    }
  }

  const fileName = sanitizeFileName(primary.filename).replace(/\.jar$/i, '') + '.jar'
  ctx.report({ stage: 'mod', message: `下载模组：${title}` })
  let received = 0
  await downloadFile(
    {
      urls: [primary.url],
      dest: path.join(ctx.modsDir, fileName),
      sha1: primary.hashes?.sha1,
      size: primary.size,
      label: title
    },
    (delta) => {
      received += delta
      ctx.report({
        stage: 'mod',
        message: `下载模组：${title}`,
        bytes: received,
        totalBytes: primary.size
      })
    }
  )
  ctx.meta.mods[version.project_id] = {
    projectId: version.project_id,
    title,
    fileName,
    versionId: version.id,
    versionNumber: version.version_number,
    gameVersion: ctx.gameVersion,
    loader: ctx.loader,
    installedAt: Date.now()
  }
  ctx.installed.push(title)

  for (const dependency of version.dependencies ?? []) {
    if (dependency.dependency_type !== 'required') continue
    if (!dependency.project_id) continue
    if (ctx.meta.mods[dependency.project_id]) {
      ctx.skipped.push(await projectTitle(dependency.project_id))
      continue
    }
    let depVersion: ModrinthVersion | null = null
    if (dependency.version_id) {
      try {
        depVersion = await versionById(dependency.version_id)
      } catch {
        depVersion = null
      }
    }
    if (!depVersion) {
      const options = await listVersions(dependency.project_id, ctx.gameVersion, ctx.loader)
      depVersion = options[0] ?? null
    }
    if (depVersion) {
      const depTitle = await projectTitle(dependency.project_id)
      await installVersion(ctx, depVersion, depTitle)
    }
  }
}

export async function installMod(
  projectId: string,
  gameVersion: string,
  loader: string,
  report: ProgressReporter
): Promise<ModInstallResult> {
  const installed = await listInstalledVersions()
  if (!installed.some((version) => version.id === gameVersion || version.baseVersion === gameVersion)) {
    throw new Error(`请先安装 Minecraft ${gameVersion}，再安装该模组`)
  }
  const settings = await getSettings()
  const dir = await modsDir()
  const versions = await listVersions(projectId, gameVersion, loader)
  if (!versions.length) {
    throw new Error('没有找到与该游戏版本 / 加载器兼容的模组文件')
  }
  const meta = await readMeta(dir)
  const first = versions[0]
  const title = await projectTitle(projectId)
  const ctx: InstallContext = {
    gameDir: settings.gameDir,
    modsDir: dir,
    meta,
    gameVersion,
    loader,
    installed: [],
    skipped: [],
    seen: new Set(),
    report
  }
  await installVersion(ctx, first, title)
  await writeMeta(dir, ctx.meta)
  const primary = first.files.find((file) => file.primary) ?? first.files[0]
  return {
    installed: ctx.installed,
    skipped: ctx.skipped,
    projectTitle: title,
    fileName: primary?.filename ?? ''
  }
}

export async function getModrinthProject(projectId: string): Promise<Record<string, unknown>> {
  return fetchJson(`${API}/project/${encodeURIComponent(projectId)}`)
}
