import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  InstalledVersion,
  LoaderKind,
  ModpackImportResult,
  ProgressReporter
} from '@shared/types'
import { getSettings } from './store'
import { listInstalledVersions } from './minecraft'
import { downloadAll, ensureDir, sanitizeFileName, writeJson } from './util'

interface ModrinthFile {
  path: string
  hashes?: { sha1?: string; sha512?: string }
  env?: { client?: string; server?: string }
  downloads?: string[]
  fileSize?: number
}

interface ModrinthIndex {
  name?: string
  versionId?: string
  files?: ModrinthFile[]
  dependencies?: Record<string, string>
  overrides?: string
  clientOverrides?: string
}

interface CurseManifest {
  name?: string
  version?: string
  minecraft?: { version?: string; modLoaders?: Array<{ id?: string; primary?: boolean }> }
  files?: Array<{ projectID?: number; fileID?: number; required?: boolean }>
  overrides?: string
}

const LOADER_LABELS: Record<string, { kind: LoaderKind; label: string }> = {
  'fabric-loader': { kind: 'fabric', label: 'Fabric' },
  'quilt-loader': { kind: 'quilt', label: 'Quilt' },
  forge: { kind: 'forge', label: 'Forge' },
  neoforge: { kind: 'neoforge', label: 'NeoForge' }
}

function safeRelative(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`整合包包含非法路径：${value}`)
  }
  return normalized
}

function destInside(root: string, relative: string): string {
  const target = path.resolve(root, safeRelative(relative))
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('整合包路径越界')
  return target
}

function slug(value: string): string {
  return sanitizeFileName(value)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28) || 'pack'
}

function pickTarget(installed: InstalledVersion[], mcVersion: string, kind: LoaderKind): InstalledVersion | undefined {
  if (kind === 'vanilla') return installed.find((version) => version.id === mcVersion && version.loader === 'vanilla')
  return installed.find(
    (version) => version.loader === kind && version.baseVersion === mcVersion
  )
}

async function copyZipDirectory(
  zip: import('adm-zip'),
  prefix: string,
  targetRoot: string
): Promise<void> {
  const cleanPrefix = prefix.replace(/\\/g, '/').replace(/\/+$/, '')
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const entryName = entry.entryName.replace(/\\/g, '/')
    if (!entryName.startsWith(`${cleanPrefix}/`)) continue
    const relative = entryName.slice(cleanPrefix.length + 1)
    if (!relative) continue
    const dest = destInside(targetRoot, relative)
    await ensureDir(path.dirname(dest))
    await fs.writeFile(dest, entry.getData())
  }
}

async function createPackProfile(input: {
  name: string
  packVersion: string
  target: InstalledVersion
  gameVersion: string
  format: string
}): Promise<{ id: string; instanceDir: string; versionDir: string }> {
  const settings = await getSettings()
  const stamp = Date.now().toString(36)
  const id = `pack-${slug(input.name)}-${stamp}`
  const versionDir = path.join(settings.gameDir, 'versions', id)
  const instanceDir = path.join(versionDir, 'game')
  await ensureDir(instanceDir)
  await ensureDir(path.join(instanceDir, 'mods'))
  await writeJson(path.join(versionDir, `${id}.json`), {
    id,
    inheritsFrom: input.target.id,
    type: 'modified',
    releaseTime: new Date().toISOString(),
    blockdeck: {
      packName: input.name,
      packVersion: input.packVersion,
      gameVersion: input.gameVersion,
      loader: input.target.loader,
      loaderVersion: input.target.loaderVersion,
      isolated: true,
      importedAt: Date.now(),
      source: input.format
    }
  })
  return { id, instanceDir, versionDir }
}

export async function importModpack(
  filePath: string,
  baseVersionId: string | undefined,
  report: ProgressReporter
): Promise<ModpackImportResult> {
  const settings = await getSettings()
  const installed = await listInstalledVersions()
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(filePath)
  const indexEntry = zip.getEntry('modrinth.index.json')
  const manifestEntry = zip.getEntry('manifest.json')
  report({ stage: 'modpack', message: '读取整合包信息…' })

  if (indexEntry) {
    const index = JSON.parse(zip.readAsText(indexEntry)) as ModrinthIndex
    const dependencies = index.dependencies ?? {}
    const mcVersion = dependencies.minecraft
    if (!mcVersion) throw new Error('整合包没有声明 Minecraft 版本')
    const loaderKey = Object.keys(LOADER_LABELS).find((key) => dependencies[key])
    const kind = loaderKey ? LOADER_LABELS[loaderKey].kind : 'vanilla'
    const target = pickTarget(installed, mcVersion, kind)
    if (!target) {
      const label = loaderKey ? LOADER_LABELS[loaderKey].label : '原版'
      throw new Error(
        `请先安装 Minecraft ${mcVersion} 的${label}版本，再导入这个整合包。`
      )
    }
    const name = index.name?.trim() || path.basename(filePath, path.extname(filePath))
    const packVersion = index.versionId ?? '1.0.0'
    const created = await createPackProfile({
      name,
      packVersion,
      target,
      gameVersion: mcVersion,
      format: 'modrinth'
    })
    const files = (index.files ?? []).filter((file) => file.env?.client !== 'unsupported')
    const items = files.map((file) => ({
      urls: (file.downloads ?? []).filter(Boolean),
      dest: destInside(created.instanceDir, file.path),
      sha1: file.hashes?.sha1,
      size: file.fileSize,
      label: path.basename(file.path)
    }))
    if (items.some((item) => !item.urls.length)) {
      throw new Error('整合包里有文件缺少下载地址，可能已被作者删除')
    }
    report({ stage: 'modpack', message: `下载 ${items.length} 个整合包文件…` })
    await downloadAll(items, {
      concurrency: settings.maxConcurrent,
      onProgress: (progress) => {
        report({
          stage: 'modpack',
          message: `下载整合包文件 ${progress.completed}/${progress.total}`,
          current: progress.completed,
          total: progress.total,
          bytes: progress.bytes,
          totalBytes: progress.totalBytes
        })
      }
    })
    report({ stage: 'modpack', message: '写入配置与覆盖文件…' })
    const overrides = index.overrides ?? 'overrides'
    const clientOverrides = index.clientOverrides ?? 'client-overrides'
    const hasPrefix = (prefix: string): boolean => {
      const clean = prefix.split(String.fromCharCode(92)).join('/').split('/').filter(Boolean).join('/')
      return zip.getEntries().some((entry) => {
        const name = entry.entryName.split(String.fromCharCode(92)).join('/')
        return !entry.isDirectory && name.startsWith(`${clean}/`)
      })
    }
    if (hasPrefix(overrides)) await copyZipDirectory(zip, overrides, created.instanceDir)
    if (hasPrefix(clientOverrides)) await copyZipDirectory(zip, clientOverrides, created.instanceDir)
    report({ stage: 'modpack', message: '整合包导入完成', done: true })
    return {
      versionId: created.id,
      name,
      format: 'modrinth',
      files: items.length
    }
  }

  const target = baseVersionId
    ? installed.find((version) => version.id === baseVersionId)
    : undefined
  if (!target) throw new Error('导入 ZIP 整合包前，请选择一个已安装的基础版本')

  const manifest = manifestEntry
    ? (JSON.parse(zip.readAsText(manifestEntry)) as CurseManifest)
    : null
  if (manifest?.files?.length) {
    throw new Error(
      '这个 CurseForge 整合包需要 CurseForge API 才能下载文件。请使用 Modrinth .mrpack，或导入已经包含 mods/ 的 ZIP。'
    )
  }
  const name = manifest?.name?.trim() || path.basename(filePath, path.extname(filePath))
  const packVersion = manifest?.version ?? '1.0.0'
  const mcVersion = target.baseVersion ?? target.id
  const created = await createPackProfile({
    name,
    packVersion,
    target,
    gameVersion: mcVersion,
    format: 'zip'
  })
  report({ stage: 'modpack', message: '复制整合包文件…' })
  const skip = new Set([manifestEntry ? 'manifest.json' : '', indexEntry ? 'modrinth.index.json' : ''])
  let copied = 0
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const entryName = entry.entryName.replace(/\\/g, '/')
    if (!entryName || skip.has(entryName)) continue
    if (entryName.startsWith('__MACOSX/') || entryName.endsWith('/.DS_Store')) continue
    const relative = entryName.startsWith('overrides/')
      ? entryName.slice('overrides/'.length)
      : entryName
    if (!relative) continue
    const dest = destInside(created.instanceDir, relative)
    await ensureDir(path.dirname(dest))
    await fs.writeFile(dest, entry.getData())
    copied++
    if (copied % 20 === 0) {
      report({ stage: 'modpack', message: `复制文件 ${copied}…`, current: copied })
    }
  }
  await ensureDir(path.join(created.instanceDir, 'mods'))
  report({ stage: 'modpack', message: '整合包导入完成', done: true })
  return { versionId: created.id, name, format: 'zip', files: copied }
}
