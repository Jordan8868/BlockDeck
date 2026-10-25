import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import net from 'node:net'

const MAGIC = Buffer.from('BDSL1', 'ascii')
const NONCE_BYTES = 16
const KEY_BYTES = 32
const HELLO_BYTES = MAGIC.length + NONCE_BYTES + KEY_BYTES
const AUTH_BYTES = 32
const TAG_BYTES = 16
const FRAME_NONCE_BYTES = 12
const MAX_PLAINTEXT = 1024 * 1024
const MAX_FRAME = MAX_PLAINTEXT + FRAME_NONCE_BYTES + TAG_BYTES
const HANDSHAKE_TIMEOUT_MS = 12_000
const PUBLIC_KEY_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
const DIRECTION_C2S = 1
const DIRECTION_S2C = 2
const AAD_PREFIX = Buffer.from('BDSL1/frame', 'ascii')

export interface SecureProtocolInfo {
  name: string
  version: number
  keyExchange: string
  kdf: string
  cipher: string
  handshakeAuth: string
  replayProtection: string
  forwardSecrecy: boolean
}

export const SECURE_PROTOCOL: SecureProtocolInfo = {
  name: 'BlockDeck Secure Link',
  version: 1,
  keyExchange: 'X25519 ephemeral ECDH',
  kdf: 'HKDF-SHA256',
  cipher: 'AES-256-GCM',
  handshakeAuth: 'HMAC-SHA256 + 256-bit room key',
  replayProtection: 'strict 64-bit sequence + GCM authentication tag',
  forwardSecrecy: true
}

export class SecureLinkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecureLinkError'
  }
}

function rawPublicKey(key: crypto.KeyObject): Buffer {
  return key.export({ type: 'spki', format: 'der' }).subarray(-KEY_BYTES)
}

function importPublicKey(raw: Buffer): crypto.KeyObject {
  return crypto.createPublicKey({
    key: Buffer.concat([PUBLIC_KEY_PREFIX, raw]),
    format: 'der',
    type: 'spki'
  })
}

function uint64(value: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(value))
  return buffer
}

function hmac(key: Buffer, label: string, data?: Buffer): Buffer {
  const digest = crypto.createHmac('sha256', key)
  digest.update(label, 'utf8')
  if (data) digest.update(data)
  return digest.digest()
}

function deriveKeys(
  roomKey: Buffer,
  clientHello: Buffer,
  serverHello: Buffer,
  privateKey: crypto.KeyObject,
  peerPublicRaw: Buffer
): {
  c2sKey: Buffer
  s2cKey: Buffer
  clientAuth: Buffer
  serverAuth: Buffer
  clientNoncePrefix: Buffer
  serverNoncePrefix: Buffer
} {
  const shared = crypto.diffieHellman({
    privateKey,
    publicKey: importPublicKey(peerPublicRaw)
  })
  if (shared.every((byte) => byte === 0)) {
    throw new SecureLinkError('X25519 共享密钥无效')
  }
  const transcript = Buffer.concat([clientHello, serverHello])
  const salt = crypto
    .createHash('sha256')
    .update('BDSL1/1/salt')
    .update(roomKey)
    .update(transcript)
    .digest()
  const master = Buffer.from(
    crypto.hkdfSync('sha256', shared, salt, 'BDSL1/1/master', KEY_BYTES)
  )
  return {
    c2sKey: hmac(master, 'key/c2s'),
    s2cKey: hmac(master, 'key/s2c'),
    clientAuth: hmac(master, 'auth/client', transcript),
    serverAuth: hmac(master, 'auth/server', transcript),
    clientNoncePrefix: hmac(master, 'nonce/client').subarray(0, 4),
    serverNoncePrefix: hmac(master, 'nonce/server').subarray(0, 4)
  }
}

function parseHello(hello: Buffer): { nonce: Buffer; publicKey: Buffer } {
  if (hello.length !== HELLO_BYTES) throw new SecureLinkError('握手包长度错误')
  if (!crypto.timingSafeEqual(hello.subarray(0, MAGIC.length), MAGIC)) {
    throw new SecureLinkError('联机协议不匹配')
  }
  return {
    nonce: hello.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES),
    publicKey: hello.subarray(MAGIC.length + NONCE_BYTES)
  }
}

function makeHello(): { hello: Buffer; privateKey: crypto.KeyObject } {
  const pair = crypto.generateKeyPairSync('x25519')
  const publicRaw = rawPublicKey(pair.publicKey)
  const hello = Buffer.concat([MAGIC, crypto.randomBytes(NONCE_BYTES), publicRaw])
  return { hello, privateKey: pair.privateKey }
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function waitForReadable(socket: net.Socket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => finish(new SecureLinkError('加密握手超时')), timeoutMs)
    const finish = (error?: Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.off('readable', onReadable)
      socket.off('end', onEnd)
      socket.off('close', onClose)
      socket.off('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onReadable = (): void => finish()
    const onEnd = (): void => finish(new SecureLinkError('连接在握手完成前关闭'))
    const onClose = (): void => finish(new SecureLinkError('连接在握手完成前关闭'))
    const onError = (error: Error): void => finish(error)
    socket.once('readable', onReadable)
    socket.once('end', onEnd)
    socket.once('close', onClose)
    socket.once('error', onError)
  })
}

async function readExactly(socket: net.Socket, length: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let remaining = length
  const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS
  while (remaining > 0) {
    const available = socket.read(remaining) as Buffer | null
    if (available) {
      chunks.push(available)
      remaining -= available.length
      continue
    }
    if (Date.now() >= deadline) throw new SecureLinkError('加密握手超时')
    await waitForReadable(socket, Math.max(1, deadline - Date.now()))
  }
  return Buffer.concat(chunks)
}

export class SecureConnection extends EventEmitter {
  private readonly socket: net.Socket
  private readonly sendKey: Buffer
  private readonly recvKey: Buffer
  private readonly sendPrefix: Buffer
  private readonly recvPrefix: Buffer
  private readonly sendDirection: number
  private readonly recvDirection: number
  private sendSequence = 0
  private recvSequence = 0
  private recvBuffer = Buffer.alloc(0)
  private closed = false

  constructor(
    socket: net.Socket,
    options: {
      sendKey: Buffer
      recvKey: Buffer
      sendPrefix: Buffer
      recvPrefix: Buffer
      sendDirection: number
      recvDirection: number
    }
  ) {
    super()
    this.socket = socket
    this.sendKey = options.sendKey
    this.recvKey = options.recvKey
    this.sendPrefix = options.sendPrefix
    this.recvPrefix = options.recvPrefix
    this.sendDirection = options.sendDirection
    this.recvDirection = options.recvDirection
    socket.setNoDelay(true)
    socket.setTimeout(0)
    socket.on('data', (chunk: Buffer) => this.consume(chunk))
    socket.on('drain', () => this.emit('drain'))
    socket.on('end', () => {
      this.closed = true
      this.emit('end')
    })
    socket.on('close', () => {
      this.closed = true
      this.emit('close')
    })
    socket.on('error', (error) => {
      this.closed = true
      this.emit('secureError', error)
    })
    socket.resume()
  }

  get remoteAddress(): string {
    return this.socket.remoteAddress ?? ''
  }

  get isClosed(): boolean {
    return this.closed
  }

  write(data: Buffer | string): boolean {
    if (this.closed) throw new SecureLinkError('加密通道已关闭')
    const plaintext = Buffer.isBuffer(data) ? data : Buffer.from(data)
    if (plaintext.length > MAX_PLAINTEXT) throw new SecureLinkError('单个数据帧过大')
    const sequence = this.sendSequence++
    const nonce = Buffer.concat([this.sendPrefix, uint64(sequence)])
    const aad = Buffer.concat([AAD_PREFIX, Buffer.from([this.sendDirection]), uint64(sequence)])
    const cipher = crypto.createCipheriv('aes-256-gcm', this.sendKey, nonce)
    cipher.setAAD(aad)
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()
    const frameLength = FRAME_NONCE_BYTES + encrypted.length + TAG_BYTES
    const frame = Buffer.alloc(4 + frameLength)
    frame.writeUInt32BE(frameLength, 0)
    nonce.copy(frame, 4)
    encrypted.copy(frame, 4 + FRAME_NONCE_BYTES)
    tag.copy(frame, 4 + FRAME_NONCE_BYTES + encrypted.length)
    return this.socket.write(frame)
  }

  pause(): void {
    this.socket.pause()
  }

  resume(): void {
    this.socket.resume()
  }

  end(): void {
    this.socket.end()
  }

  destroy(): void {
    this.closed = true
    this.socket.destroy()
  }

  private fail(message: string, error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.socket.destroy()
    this.emit('secureError', error ?? new SecureLinkError(message))
  }

  private consume(chunk: Buffer): void {
    if (this.closed) return
    this.recvBuffer = Buffer.concat([this.recvBuffer, chunk])
    while (this.recvBuffer.length >= 4) {
      const frameLength = this.recvBuffer.readUInt32BE(0)
      if (frameLength < FRAME_NONCE_BYTES + TAG_BYTES || frameLength > MAX_FRAME) {
        this.fail('收到非法加密帧长度')
        return
      }
      if (this.recvBuffer.length < 4 + frameLength) return
      const nonce = this.recvBuffer.subarray(4, 4 + FRAME_NONCE_BYTES)
      const ciphertext = this.recvBuffer.subarray(
        4 + FRAME_NONCE_BYTES,
        4 + frameLength - TAG_BYTES
      )
      const tag = this.recvBuffer.subarray(4 + frameLength - TAG_BYTES, 4 + frameLength)
      this.recvBuffer = this.recvBuffer.subarray(4 + frameLength)

      if (!nonce.subarray(0, 4).equals(this.recvPrefix)) {
        this.fail('加密帧方向或会话不匹配')
        return
      }
      const sequence = Number(nonce.readBigUInt64BE(4))
      if (!Number.isSafeInteger(sequence) || sequence !== this.recvSequence) {
        this.fail('检测到重放或乱序的加密帧')
        return
      }
      const aad = Buffer.concat([
        AAD_PREFIX,
        Buffer.from([this.recvDirection]),
        uint64(sequence)
      ])
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.recvKey, nonce)
        decipher.setAAD(aad)
        decipher.setAuthTag(tag)
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
        this.recvSequence++
        this.emit('data', plaintext)
      } catch {
        this.fail('加密帧校验失败，数据可能被篡改')
        return
      }
    }
  }
}

function connectionForClient(
  socket: net.Socket,
  keys: ReturnType<typeof deriveKeys>
): SecureConnection {
  return new SecureConnection(socket, {
    sendKey: keys.c2sKey,
    recvKey: keys.s2cKey,
    sendPrefix: keys.clientNoncePrefix,
    recvPrefix: keys.serverNoncePrefix,
    sendDirection: DIRECTION_C2S,
    recvDirection: DIRECTION_S2C
  })
}

function connectionForServer(
  socket: net.Socket,
  keys: ReturnType<typeof deriveKeys>
): SecureConnection {
  return new SecureConnection(socket, {
    sendKey: keys.s2cKey,
    recvKey: keys.c2sKey,
    sendPrefix: keys.serverNoncePrefix,
    recvPrefix: keys.clientNoncePrefix,
    sendDirection: DIRECTION_S2C,
    recvDirection: DIRECTION_C2S
  })
}

export async function acceptSecureConnection(
  socket: net.Socket,
  roomKey: Buffer
): Promise<SecureConnection> {
  if (roomKey.length !== KEY_BYTES) throw new SecureLinkError('房间密钥长度错误')
  socket.pause()
  const swallowError = (): void => undefined
  socket.on('error', swallowError)
  try {
    const clientHello = await readExactly(socket, HELLO_BYTES)
    parseHello(clientHello)
    const { hello: serverHello, privateKey } = makeHello()
    socket.write(serverHello)
    const clientPub = parseHello(clientHello).publicKey
    const keys = deriveKeys(roomKey, clientHello, serverHello, privateKey, clientPub)
    const auth = await readExactly(socket, AUTH_BYTES)
    if (!safeEqual(auth, keys.clientAuth)) {
      throw new SecureLinkError('联机码不正确，或握手被中间人篡改')
    }
    socket.write(keys.serverAuth)
    socket.off('error', swallowError)
    return connectionForServer(socket, keys)
  } catch (error) {
    socket.off('error', swallowError)
    socket.destroy()
    throw error instanceof Error ? error : new SecureLinkError('加密握手失败')
  }
}

export async function connectSecureConnection(
  socket: net.Socket,
  roomKey: Buffer
): Promise<SecureConnection> {
  if (roomKey.length !== KEY_BYTES) throw new SecureLinkError('房间密钥长度错误')
  socket.pause()
  const swallowError = (): void => undefined
  socket.on('error', swallowError)
  try {
    const { hello: clientHello, privateKey } = makeHello()
    socket.write(clientHello)
    const serverHello = await readExactly(socket, HELLO_BYTES)
    const serverPub = parseHello(serverHello).publicKey
    const keys = deriveKeys(roomKey, clientHello, serverHello, privateKey, serverPub)
    socket.write(keys.clientAuth)
    const auth = await readExactly(socket, AUTH_BYTES)
    if (!safeEqual(auth, keys.serverAuth)) {
      throw new SecureLinkError('服务器身份校验失败，联机码可能错误')
    }
    socket.off('error', swallowError)
    return connectionForClient(socket, keys)
  } catch (error) {
    socket.off('error', swallowError)
    socket.destroy()
    throw error instanceof Error ? error : new SecureLinkError('加密握手失败')
  }
}

export function fingerprintForRoomKey(roomKey: Buffer): string {
  const digest = crypto
    .createHash('sha256')
    .update('BDSL1/1/fingerprint')
    .update(roomKey)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()
  return digest.match(/.{4}/g)?.join('-') ?? digest
}

export function createRoomKey(): Buffer {
  return crypto.randomBytes(KEY_BYTES)
}

