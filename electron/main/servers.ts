import path from 'node:path'
import type { SavedServer } from '@shared/types'
import { getDataDir } from './paths'
import { newId, readJson, writeJson } from './util'

const FILE = 'servers.json'

interface ServerFile {
  servers: SavedServer[]
}

function normalizeHost(value: string): string {
  let host = value.trim()
  host = host.replace(/^minecraft:\/\//i, '').replace(/\/+$/, '')
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (!host || host.length > 255) throw new Error('服务器地址为空或过长')
  if (/[\s/\\<>"']/.test(host)) throw new Error('服务器地址包含非法字符')
  return host
}

function normalizePort(value: number): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('端口需在 1–65535 之间')
  }
  return port
}

function filePath(): string {
  return path.join(getDataDir(), FILE)
}

async function load(): Promise<ServerFile> {
  const data = await readJson<ServerFile>(filePath(), { servers: [] })
  return { servers: Array.isArray(data.servers) ? data.servers : [] }
}

async function save(data: ServerFile): Promise<SavedServer[]> {
  await writeJson(filePath(), data)
  return sort(data.servers)
}

function sort(servers: SavedServer[]): SavedServer[] {
  return [...servers].sort((a, b) => {
    const played = (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0)
    return played || b.createdAt - a.createdAt
  })
}

export async function listServers(): Promise<SavedServer[]> {
  return sort((await load()).servers)
}

export async function addServer(input: {
  name: string
  host: string
  port: number
  versionId?: string
}): Promise<SavedServer[]> {
  const data = await load()
  const host = normalizeHost(input.host)
  const port = normalizePort(input.port)
  if (data.servers.some((server) => server.host === host && server.port === port)) {
    throw new Error('这个服务器已经在列表里了')
  }
  const server: SavedServer = {
    id: newId(),
    name: input.name.trim() || `${host}:${port}`,
    host,
    port,
    versionId: input.versionId,
    createdAt: Date.now()
  }
  data.servers.push(server)
  return save(data)
}

export async function updateServer(
  id: string,
  patch: Partial<Pick<SavedServer, 'name' | 'host' | 'port' | 'versionId'>>
): Promise<SavedServer[]> {
  const data = await load()
  const server = data.servers.find((entry) => entry.id === id)
  if (!server) throw new Error('服务器不存在')
  if (patch.host !== undefined) server.host = normalizeHost(patch.host)
  if (patch.port !== undefined) server.port = normalizePort(patch.port)
  if (patch.name !== undefined) server.name = patch.name.trim() || `${server.host}:${server.port}`
  if (patch.versionId !== undefined) server.versionId = patch.versionId
  return save(data)
}

export async function removeServer(id: string): Promise<SavedServer[]> {
  const data = await load()
  data.servers = data.servers.filter((server) => server.id !== id)
  return save(data)
}

export async function touchServer(id: string): Promise<SavedServer[]> {
  const data = await load()
  const server = data.servers.find((entry) => entry.id === id)
  if (server) server.lastPlayedAt = Date.now()
  return save(data)
}

export async function getServer(id: string): Promise<SavedServer | null> {
  return (await load()).servers.find((server) => server.id === id) ?? null
}
