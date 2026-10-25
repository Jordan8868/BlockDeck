import net from 'node:net'
import os from 'node:os'
import { EventEmitter } from 'node:events'
import type {
  LanAddress,
  RoomHostOptions,
  RoomJoinOptions,
  RoomStatus,
  SecureProtocolInfo
} from '@shared/types'
import {
  SECURE_PROTOCOL,
  SecureConnection,
  SecureLinkError,
  acceptSecureConnection,
  connectSecureConnection,
  createRoomKey,
  fingerprintForRoomKey
} from './secureLink'

interface BaseRoom {
  startedAt: number
  server: net.Server
  connections: number
  fingerprint: string
  code: string
}

interface HostRoom extends BaseRoom {
  role: 'host'
  secret: Buffer
  advertisedHost: string
  port: number
  targetHost: string
  targetPort: number
  name: string
  channels: Set<SecureConnection>
}

interface ClientRoom extends BaseRoom {
  role: 'client'
  secret: Buffer
  remoteHost: string
  remotePort: number
  localPort: number
  channels: Set<SecureConnection>
}

type ActiveRoom = HostRoom | ClientRoom

interface InvitePayload {
  v: number
  h: string
  p: number
  s: string
  n?: string
}

function normalizeHost(host: string): string {
  const value = host.trim()
  if (!value || value.length > 255) throw new Error('主机地址为空或过长')
  if (/[\s/\\<>"']/.test(value)) throw new Error('主机地址包含非法字符')
  return value
}

function normalizePort(port: number): number {
  const value = Number(port)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('端口需在 1–65535 之间')
  }
  return value
}

function encodeInvite(payload: InvitePayload): string {
  return `BDSL1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`
}

function decodeInvite(code: string): {
  host: string
  port: number
  secret: Buffer
  name: string
} {
  const clean = code.trim().replace(/\s+/g, '')
  if (clean.length > 2048) throw new Error('联机码过长')
  if (!clean.startsWith('BDSL1.')) throw new Error('联机码格式不正确')
  let payload: InvitePayload
  try {
    payload = JSON.parse(Buffer.from(clean.slice(6), 'base64url').toString('utf8')) as InvitePayload
  } catch {
    throw new Error('联机码已损坏或不是 BlockDeck 联机码')
  }
  if (payload.v !== 1) throw new Error(`不支持的联机码版本：${payload.v}`)
  const host = normalizeHost(payload.h)
  const port = normalizePort(payload.p)
  if (typeof payload.s !== 'string') throw new Error('联机码缺少房间密钥')
  const secret = Buffer.from(payload.s, 'base64url')
  if (secret.length !== 32) throw new Error('联机码中的房间密钥长度错误')
  return { host, port, secret, name: payload.n?.slice(0, 80) || `${host}:${port}` }
}

function waitForServer(server: net.Server, port: number, host: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取监听端口'))
        return
      }
      resolve(address.port)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

function bridge(
  left: net.Socket,
  right: SecureConnection,
  onClose: () => void
): void {
  let finished = false
  const cleanup = (): void => {
    if (finished) return
    finished = true
    left.destroy()
    right.destroy()
    onClose()
  }
  left.setNoDelay(true)
  left.on('data', (data) => {
    try {
      if (!right.write(data)) left.pause()
    } catch {
      cleanup()
    }
  })
  right.on('data', (data) => {
    if (!left.write(data)) right.pause()
  })
  right.on('drain', () => {
    if (left.isPaused()) left.resume()
  })
  left.on('drain', () => {
    right.resume()
  })
  left.on('error', cleanup)
  right.on('secureError', cleanup)
  left.on('end', cleanup)
  right.on('end', cleanup)
  left.on('close', cleanup)
  right.on('close', cleanup)
}

export class RoomManager extends EventEmitter {
  private room: ActiveRoom | null = null
  private lastError = ''

  getStatus(): RoomStatus {
    const room = this.room
    if (!room) return { active: false, role: null, connections: 0 }
    const base: RoomStatus = {
      active: true,
      role: room.role,
      code: room.code,
      fingerprint: room.fingerprint,
      connections: room.connections,
      startedAt: room.startedAt,
      lastError: this.lastError || undefined
    }
    if (room.role === 'host') {
      return {
        ...base,
        host: room.advertisedHost,
        port: room.port,
        target: `${room.targetHost}:${room.targetPort}`,
        name: room.name
      }
    }
    return {
      ...base,
      host: room.remoteHost,
      port: room.remotePort,
      localAddress: `127.0.0.1:${room.localPort}`
    }
  }

  getProtocol(): SecureProtocolInfo {
    return SECURE_PROTOCOL
  }

  getLanAddress(): LanAddress {
    const entries: Array<{ name: string; address: string }> = []
    for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
      for (const info of addresses ?? []) {
        if (info.family === 'IPv4' && !info.internal) entries.push({ name, address: info.address })
      }
    }
    const preferred =
      entries.find((entry) => /^192\.168\./.test(entry.address)) ??
      entries.find((entry) => /^10\./.test(entry.address)) ??
      entries.find((entry) => /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address)) ??
      entries[0]
    return { address: preferred?.address ?? '127.0.0.1', interfaces: entries }
  }

  async startHost(options: RoomHostOptions): Promise<RoomStatus> {
    if (this.room) throw new Error('请先关闭当前的联机房间')
    const targetHost = normalizeHost(options.targetHost)
    const targetPort = normalizePort(options.targetPort)
    const listenPort = options.listenPort ? normalizePort(options.listenPort) : 25570
    const advertisedHost = normalizeHost(
      options.advertisedHost?.trim() || this.getLanAddress().address
    )
    const name = (options.name?.trim() || os.hostname()).slice(0, 80)
    const secret = createRoomKey()
    const fingerprint = fingerprintForRoomKey(secret)
    this.lastError = ''
    let server: net.Server | null = null

    const hostRoom = {} as HostRoom
    server = net.createServer((client) => this.handleHostClient(client, hostRoom))
    let port: number
    try {
      port = await waitForServer(server, listenPort, '0.0.0.0')
    } catch (error) {
      server.close()
      throw error
    }
    Object.assign(hostRoom, {
      role: 'host' as const,
      secret,
      advertisedHost,
      port,
      targetHost,
      targetPort,
      name,
      server,
      connections: 0,
      fingerprint,
      startedAt: Date.now(),
      code: encodeInvite({
        v: 1,
        h: advertisedHost,
        p: port,
        s: secret.toString('base64url'),
        n: name
      }),
      channels: new Set<SecureConnection>()
    })
    this.room = hostRoom
    server.on('error', (error) => this.fail(`房间服务错误：${error.message}`))
    this.log(`房间已开启 · ${advertisedHost}:${port} → ${targetHost}:${targetPort}`)
    this.log(`安全指纹 ${fingerprint} · 请核对好友看到的指纹`)
    this.emitStatus()
    return this.getStatus()
  }

  async joinRoom(options: RoomJoinOptions): Promise<RoomStatus> {
    if (this.room) throw new Error('请先关闭当前的联机房间')
    const invite = decodeInvite(options.code)
    const localPort = options.localPort ? normalizePort(options.localPort) : 25571
    this.lastError = ''
    let server: net.Server | null = null
    const clientRoom = {} as ClientRoom
    server = net.createServer((local) => this.handleClientConnection(local, clientRoom))
    let actualLocalPort: number
    try {
      actualLocalPort = await waitForServer(server, localPort, '127.0.0.1')
    } catch (error) {
      server.close()
      throw error
    }
    Object.assign(clientRoom, {
      role: 'client' as const,
      secret: invite.secret,
      remoteHost: invite.host,
      remotePort: invite.port,
      localPort: actualLocalPort,
      server,
      connections: 0,
      fingerprint: fingerprintForRoomKey(invite.secret),
      startedAt: Date.now(),
      code: options.code.trim(),
      channels: new Set<SecureConnection>()
    })
    this.room = clientRoom
    server.on('error', (error) => this.fail(`本地联机端口错误：${error.message}`))
    this.log(`已加入加密房间 · 本机入口 127.0.0.1:${actualLocalPort}`)
    this.log(`关闭房间授权前，请不要把入口地址告诉不认识的人`)
    this.emitStatus()
    return this.getStatus()
  }

  async stopHost(): Promise<RoomStatus> {
    if (this.room?.role === 'host') this.shutdown()
    return this.getStatus()
  }

  async leaveRoom(): Promise<RoomStatus> {
    if (this.room?.role === 'client') this.shutdown()
    return this.getStatus()
  }

  dispose(): void {
    this.shutdown()
  }

  private handleHostClient(socket: net.Socket, roomRef: HostRoom): void {
    const room = this.room as HostRoom | null
    if (!room || room.role !== 'host') {
      socket.destroy()
      return
    }
    socket.setNoDelay(true)
    acceptSecureConnection(socket, room.secret)
      .then(async (secure) => {
        if (this.room !== room) {
          secure.destroy()
          return
        }
        if (room.connections >= 12) {
          this.log('房间连接数已达上限（12），拒绝新连接')
          secure.destroy()
          return
        }
        const upstream = net.createConnection({
          host: room.targetHost,
          port: room.targetPort
        })
        upstream.setNoDelay(true)
        let counted = false
        let cleaned = false
        const cleanup = (): void => {
          if (cleaned) return
          cleaned = true
          if (counted && room.connections > 0) room.connections--
          room.channels.delete(secure)
          this.emitStatus()
        }
        upstream.once('error', (error) => {
          this.log(`转发到本机游戏端口失败：${error.message}`)
          secure.destroy()
          cleanup()
        })
        upstream.once('connect', () => {
          counted = true
          room.connections++
          room.channels.add(secure)
          this.log(`好友已通过加密隧道连接到游戏（当前 ${room.connections} 条）`)
          this.emitStatus()
          bridge(upstream, secure, cleanup)
        })
      })
      .catch((error) => {
        const message = error instanceof SecureLinkError ? error.message : String(error)
        this.log(`已拒绝未通过加密握手的连接：${message}`)
        socket.destroy()
      })
  }

  private handleClientConnection(local: net.Socket, roomRef: ClientRoom): void {
    const room = this.room as ClientRoom | null
    if (!room || room.role !== 'client') {
      local.destroy()
      return
    }
    local.setNoDelay(true)
    const remote = net.createConnection({ host: room.remoteHost, port: room.remotePort })
    remote.setNoDelay(true)
    remote.once('error', (error) => {
      this.log(`无法连接房主：${error.message}`)
      local.destroy()
    })
    remote.once('connect', () => {
      connectSecureConnection(remote, room.secret)
        .then((secure) => {
          if (this.room !== room) {
            secure.destroy()
            local.destroy()
            return
          }
          let cleaned = false
          const cleanup = (): void => {
            if (cleaned) return
            cleaned = true
            if (room.connections > 0) room.connections--
            room.channels.delete(secure)
            this.emitStatus()
          }
          room.connections++
          room.channels.add(secure)
          this.log(`本机 Minecraft 已接入加密隧道（当前 ${room.connections} 条）`)
          this.emitStatus()
          bridge(local, secure, cleanup)
        })
        .catch((error) => {
          this.log(`加密握手失败：${error instanceof Error ? error.message : String(error)}`)
          local.destroy()
          remote.destroy()
        })
    })
    local.on('error', () => remote.destroy())
  }

  private shutdown(): void {
    const room = this.room
    if (!room) return
    this.room = null
    for (const channel of room.channels) channel.destroy()
    room.server.close()
    this.log(room.role === 'host' ? '加密房间已关闭' : '已离开加密房间')
    this.emitStatus()
  }

  private fail(message: string): void {
    this.lastError = message
    this.log(message)
    this.emit('lastError', message)
    this.emitStatus()
  }

  private log(message: string): void {
    this.emit('log', message)
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus())
  }
}
