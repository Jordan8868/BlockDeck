import net from 'node:net'
import dns from 'node:dns/promises'
import type { ServerPingResult } from '@shared/types'

function encodeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let current = value >>> 0
  do {
    let byte = current & 0x7f
    current >>>= 7
    if (current !== 0) byte |= 0x80
    bytes.push(byte)
  } while (current !== 0)
  return Buffer.from(bytes)
}

function readVarInt(buffer: Buffer, offset = 0): { value: number; size: number } | null {
  let value = 0
  let size = 0
  while (offset + size < buffer.length) {
    const byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size++
    if ((byte & 0x80) === 0) return { value: value >>> 0, size }
    if (size > 5) throw new Error('VarInt 过长')
  }
  return null
}

function encodeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([encodeVarInt(data.length), data])
}

function stripMinecraftColors(value: string): string {
  return value.replace(/§[0-9a-fk-or]/gi, '')
}

function flattenMotd(value: unknown): string {
  if (typeof value === 'string') return stripMinecraftColors(value)
  if (Array.isArray(value)) return value.map(flattenMotd).join('')
  if (value && typeof value === 'object') {
    const entry = value as { text?: unknown; extra?: unknown }
    const head = typeof entry.text === 'string' ? stripMinecraftColors(entry.text) : ''
    return head + (entry.extra ? flattenMotd(entry.extra) : '')
  }
  return ''
}

async function resolveEndpoint(
  host: string,
  port: number
): Promise<{ host: string; port: number }> {
  if (port !== 25565 || net.isIP(host) !== 0) return { host, port }
  try {
    const records = await dns.resolveSrv(`_minecraft._tcp.${host}`)
    if (records.length) {
      const record = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0]
      return { host: record.name, port: record.port }
    }
  } catch {
    // No SRV record is the common case.
  }
  return { host, port }
}

export async function pingMinecraftServer(
  hostRaw: string,
  portRaw: number
): Promise<ServerPingResult> {
  const checkedAt = Date.now()
  const host = hostRaw.trim()
  const port = Number(portRaw)
  if (!host || host.length > 255) {
    return { online: false, host, port, error: '服务器地址无效', checkedAt }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { online: false, host, port, error: '端口需在 1–65535 之间', checkedAt }
  }
  let endpoint = { host, port }
  try {
    endpoint = await resolveEndpoint(host, port)
  } catch {
    // Keep the literal endpoint.
  }

  return new Promise<ServerPingResult>((resolve) => {
    let settled = false
    let buffer = Buffer.alloc(0)
    const started = Date.now()
    const socket = net.createConnection({ host: endpoint.host, port: endpoint.port })
    socket.setNoDelay(true)
    socket.setTimeout(6000)

    const finish = (result: Omit<ServerPingResult, 'host' | 'port' | 'checkedAt'>): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ...result, host, port, checkedAt })
    }

    socket.on('connect', () => {
      const handshakeBody = Buffer.concat([
        encodeVarInt(0x00),
        encodeVarInt(47),
        encodeString(host),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
        encodeVarInt(1)
      ])
      socket.write(Buffer.concat([encodeVarInt(handshakeBody.length), handshakeBody]))
      socket.write(Buffer.from([0x01, 0x00]))
    })

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length > 2 * 1024 * 1024) {
        finish({ online: false, error: '服务器响应过大' })
        return
      }
      try {
        const packetLength = readVarInt(buffer, 0)
        if (!packetLength) return
        if (buffer.length < packetLength.size + packetLength.value) return
        let offset = packetLength.size
        const packetId = readVarInt(buffer, offset)
        if (!packetId) return
        offset += packetId.size
        if (packetId.value !== 0) {
          finish({ online: false, error: '服务器返回了未知数据包' })
          return
        }
        const stringLength = readVarInt(buffer, offset)
        if (!stringLength) return
        offset += stringLength.size
        if (buffer.length < offset + stringLength.value) return
        const json = buffer.subarray(offset, offset + stringLength.value).toString('utf8')
        const status = JSON.parse(json) as {
          version?: { name?: string }
          players?: { online?: number; max?: number }
          description?: unknown
          favicon?: string
        }
        finish({
          online: true,
          latency: Date.now() - started,
          playersOnline: status.players?.online,
          playersMax: status.players?.max,
          versionName: status.version?.name
            ? stripMinecraftColors(status.version.name)
            : undefined,
          motd: flattenMotd(status.description).trim(),
          favicon: status.favicon
        })
      } catch (error) {
        finish({
          online: false,
          error: error instanceof Error ? error.message : '无法解析服务器响应'
        })
      }
    })

    socket.on('timeout', () => finish({ online: false, error: '连接超时' }))
    socket.on('error', (error) =>
      finish({ online: false, error: error.message || '无法连接服务器' })
    )
    socket.on('close', () => {
      if (!settled) finish({ online: false, error: '服务器关闭了连接' })
    })
  })
}
