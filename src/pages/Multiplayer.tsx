import React, { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Fingerprint,
  Globe2,
  Info,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Router,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unplug,
  Users,
  Wifi,
  WifiOff,
  X
} from 'lucide-react'
import type {
  InstalledVersion,
  RoomStatus,
  SavedServer,
  SecureProtocolInfo,
  ServerPingResult
} from '@shared/types'
import { cleanError, useApp } from '../store'
import { PageHeader } from '../components/Page'
import { LoaderBadge, Spinner } from '../components/Bits'
import { ConfirmDialog, Modal, ModalHeader } from '../components/Modal'
import { formatNumber, loaderMeta, relativeTime } from '../lib'

type Tab = 'servers' | 'rooms'

const emptyRoom: RoomStatus = { active: false, role: null, connections: 0 }

function parseAddress(value: string): { host: string; port: number } {
  let clean = value.trim().replace(/^minecraft:\/\//i, '').replace(/\/+$/, '')
  if (!clean) throw new Error('请填写服务器地址')
  if (clean.startsWith('[')) {
    const end = clean.indexOf(']')
    if (end < 0) throw new Error('IPv6 地址格式不正确')
    const host = clean.slice(1, end)
    const rest = clean.slice(end + 1)
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : 25565
    return { host, port }
  }
  const colon = clean.lastIndexOf(':')
  if (colon > 0 && /^\d{1,5}$/.test(clean.slice(colon + 1))) {
    const host = clean.slice(0, colon)
    const port = Number(clean.slice(colon + 1))
    if (!host) throw new Error('服务器地址为空')
    if (port < 1 || port > 65535) throw new Error('端口需在 1–65535 之间')
    return { host, port }
  }
  return { host: clean, port: 25565 }
}

function addressOf(server: SavedServer): string {
  return `${server.host}:${server.port}`
}

function versionLabel(version: InstalledVersion): string {
  return version.loader === 'vanilla'
    ? version.baseVersion ?? version.id
    : `${version.baseVersion ?? version.id} · ${loaderMeta[version.loader].label}`
}

function copyText(text: string, onDone: () => void): void {
  void navigator.clipboard.writeText(text).then(onDone).catch(() => undefined)
}

export function MultiplayerPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('servers')
  return (
    <div className="page multiplayer-page">
      <PageHeader
        eyebrow="MULTIPLAYER / 联机大厅"
        title="去别人的世界，或让世界找到你"
        subtitle="服务器状态查询与一键加入；自研 BDSL-1 加密房间，联机流量不经过第三方中转。"
        actions={
          <span className="mp-security-pill">
            <ShieldCheck size={14} />
            BDSL-1 · AES-256-GCM
          </span>
        }
      />
      <div className="page-tabs">
        <button className={tab === 'servers' ? 'is-active' : ''} onClick={() => setTab('servers')}>
          <Globe2 size={14} /> 服务器
        </button>
        <button className={tab === 'rooms' ? 'is-active' : ''} onClick={() => setTab('rooms')}>
          <LockKeyhole size={14} /> 加密房间
        </button>
      </div>
      {tab === 'servers' ? <ServersTab /> : <RoomsTab />}
    </div>
  )
}

function ServersTab(): React.JSX.Element {
  const { installed, selectedInstalled, running, launchVersion, setPage, toast } = useApp()
  const [servers, setServers] = useState<SavedServer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ServerPingResult>>({})
  const [pinging, setPinging] = useState<Record<string, boolean>>({})
  const [pingingAll, setPingingAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SavedServer | null>(null)
  const [serverVersion, setServerVersion] = useState('')

  const selected = servers.find((server) => server.id === selectedId) ?? null
  const selectedStatus = selected ? statuses[selected.id] : undefined
  const selectedPinging = selected ? !!pinging[selected.id] : false

  const refreshServers = async (): Promise<void> => {
    try {
      const list = await window.blockdeck.servers.list()
      setServers(list)
      if (!selectedId && list[0]) setSelectedId(list[0].id)
      if (selectedId && !list.some((server) => server.id === selectedId)) {
        setSelectedId(list[0]?.id ?? null)
      }
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!installed.length) {
      setServerVersion('')
      return
    }
    const preferred =
      (selected?.versionId && installed.some((version) => version.id === selected.versionId)
        ? selected.versionId
        : selectedInstalled?.id && installed.some((version) => version.id === selectedInstalled.id)
          ? selectedInstalled.id
          : installed[0].id)
    setServerVersion(preferred)
  }, [installed, selected?.versionId, selectedInstalled?.id])

  const ping = async (server: SavedServer, notify = false): Promise<void> => {
    setPinging((prev) => ({ ...prev, [server.id]: true }))
    try {
      const result = await window.blockdeck.servers.ping(server.host, server.port)
      setStatuses((prev) => ({ ...prev, [server.id]: result }))
      if (notify && !result.online) toast(result.error ?? '服务器没有响应', 'error')
    } catch (error) {
      if (notify) toast(cleanError(error), 'error')
    } finally {
      setPinging((prev) => ({ ...prev, [server.id]: false }))
    }
  }

  useEffect(() => {
    if (!selected) return
    if (!statuses[selected.id]) void ping(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const pingAll = async (): Promise<void> => {
    if (!servers.length) return
    setPingingAll(true)
    await Promise.all(servers.map((server) => ping(server)))
    setPingingAll(false)
  }

  const remove = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      const list = await window.blockdeck.servers.remove(deleteTarget.id)
      setServers(list)
      if (selectedId === deleteTarget.id) setSelectedId(list[0]?.id ?? null)
      toast('服务器已移除', 'success')
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const quickJoin = async (): Promise<void> => {
    if (!selected) return
    if (running) {
      toast('游戏已经在运行中', 'error')
      return
    }
    if (!serverVersion) {
      toast('请先在版本库安装一个游戏版本', 'error')
      return
    }
    try {
      await window.blockdeck.servers.update(selected.id, { versionId: serverVersion })
      const touched = await window.blockdeck.servers.touch(selected.id)
      setServers(touched)
      await launchVersion(serverVersion, {
        serverAddress: addressOf(selected),
        title: `加入 ${selected.name}`
      })
    } catch (error) {
      toast(cleanError(error), 'error')
    }
  }

  const statusText = (status?: ServerPingResult): string => {
    if (!status) return '等待检测'
    if (!status.online) return '离线 / 超时'
    return `${status.playersOnline ?? '?'} / ${status.playersMax ?? '?'} 在线`
  }

  return (
    <>
      <div className="mp-server-layout">
        <section className="mp-server-list panel">
          <div className="mp-list-head">
            <div>
              <div className="eyebrow">SAVED WORLDS</div>
              <h2>我的服务器</h2>
            </div>
            <div className="mp-list-actions">
              <button
                className="icon-btn"
                title="刷新全部状态"
                onClick={() => void pingAll()}
                disabled={pingingAll || !servers.length}
              >
                {pingingAll ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> 添加
              </button>
            </div>
          </div>
          {loading ? (
            <div className="mp-list-loading">
              <Spinner size={18} />
              正在读取服务器列表…
            </div>
          ) : servers.length ? (
            <div className="mp-server-list-scroll">
              {servers.map((server) => {
                const status = statuses[server.id]
                return (
                  <button
                    key={server.id}
                    className={`mp-server-row ${selectedId === server.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(server.id)}
                  >
                    <span className={`mp-status-dot ${status?.online ? 'is-online' : status ? 'is-offline' : ''}`} />
                    <span className="mp-server-row-copy">
                      <strong>{server.name}</strong>
                      <small>{addressOf(server)}</small>
                    </span>
                    <span className="mp-server-row-status">
                      {pinging[server.id] ? (
                        <Loader2 size={13} className="spin" />
                      ) : status?.online ? (
                        <span>{status.latency}ms</span>
                      ) : (
                        <span className="is-muted">—</span>
                      )}
                    </span>
                    <ChevronRight size={14} className="mp-server-row-arrow" />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mp-list-empty">
              <span className="empty-icon">
                <Globe2 size={25} />
              </span>
              <strong>还没有服务器</strong>
              <p>添加一个服务器，查看在线人数并一键加入。</p>
              <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> 添加服务器
              </button>
            </div>
          )}
          <div className="mp-list-foot">
            <span className="signal-dot" />
            状态查询会连接服务器获取公开信息
          </div>
        </section>

        <section className="mp-server-detail panel">
          {selected ? (
            <>
              <div className="mp-detail-head">
                <span className="mp-detail-icon">
                  {selectedStatus?.favicon ? (
                    <img src={selectedStatus.favicon} alt="" />
                  ) : (
                    <Server size={24} />
                  )}
                </span>
                <div className="mp-detail-title">
                  <div className="eyebrow">SERVER PROFILE</div>
                  <h2>{selected.name}</h2>
                  <span>{addressOf(selected)}</span>
                </div>
                <span
                  className={`mp-status-pill ${selectedStatus?.online ? 'is-online' : selectedStatus ? 'is-offline' : ''}`}
                >
                  {selectedPinging ? (
                    <Loader2 size={12} className="spin" />
                  ) : selectedStatus?.online ? (
                    <Wifi size={12} />
                  ) : (
                    <WifiOff size={12} />
                  )}
                  {selectedPinging ? '检测中' : selectedStatus?.online ? '在线' : '未连接'}
                </span>
                <div className="mp-detail-actions">
                  <button
                    className="icon-btn"
                    title="刷新状态"
                    onClick={() => void ping(selected, true)}
                    disabled={selectedPinging}
                  >
                    {selectedPinging ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <RefreshCw size={15} />
                    )}
                  </button>
                  <button
                    className="icon-btn danger-hover"
                    title="移除服务器"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className={`mp-motd ${selectedStatus?.online ? '' : 'is-empty'}`}>
                {selectedStatus?.online ? (
                  <span>{selectedStatus.motd || '这个服务器没有填写公告。'}</span>
                ) : (
                  <span>{selectedStatus?.error ?? '连接服务器后显示公告与在线状态。'}</span>
                )}
              </div>

              <div className="mp-detail-grid">
                <div>
                  <span>在线玩家</span>
                  <strong>{statusText(selectedStatus)}</strong>
                </div>
                <div>
                  <span>服务器版本</span>
                  <strong>{selectedStatus?.versionName ?? '—'}</strong>
                </div>
                <div>
                  <span>延迟</span>
                  <strong>
                    {selectedStatus?.online && selectedStatus.latency != null
                      ? `${selectedStatus.latency} ms`
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>最近加入</span>
                  <strong>{selected.lastPlayedAt ? relativeTime(new Date(selected.lastPlayedAt).toISOString()) : '从未'}</strong>
                </div>
              </div>

              <div className="mp-launch-box">
                <div className="mp-launch-label">
                  <span className="setting-icon">
                    <Play size={14} />
                  </span>
                  <div>
                    <strong>启动并直接加入</strong>
                    <span>使用下方版本启动 Minecraft，并自动连接服务器。</span>
                  </div>
                </div>
                <div className="mp-launch-controls">
                  <div className="select-wrap compact">
                    <select
                      value={serverVersion}
                      onChange={(event) => setServerVersion(event.target.value)}
                      disabled={!installed.length}
                    >
                      {installed.length ? (
                        installed.map((version) => (
                          <option key={version.id} value={version.id}>
                            {versionLabel(version)}
                          </option>
                        ))
                      ) : (
                        <option value="">尚未安装游戏版本</option>
                      )}
                    </select>
                  </div>
                  {installed.length ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => void quickJoin()}
                      disabled={!!running}
                    >
                      {running ? <Loader2 size={15} className="spin" /> : <Play size={14} fill="currentColor" />}
                      {running ? '游戏运行中' : '启动并加入'}
                    </button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setPage('versions')}>
                      <Plus size={14} /> 去安装版本
                    </button>
                  )}
                </div>
              </div>

              <div className="mp-detail-tip">
                <Info size={13} />
                服务器状态通过 Minecraft 状态协议查询；加入时由游戏客户端直接连接，不经过 BlockDeck 中转。
              </div>
            </>
          ) : (
            <div className="mp-detail-empty">
              <span className="mp-orb">
                <Globe2 size={34} />
              </span>
              <h2>把服务器放进收藏夹</h2>
              <p>添加常用服务器，查看在线人数、版本与延迟，一键启动并加入。</p>
              <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                <Plus size={15} /> 添加第一个服务器
              </button>
            </div>
          )}
        </section>
      </div>

      <AddServerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(server, list) => {
          setServers(list)
          setSelectedId(server.id)
          setAddOpen(false)
          void ping(server)
        }}
        onError={(message) => toast(message, 'error')}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="移除这个服务器？"
        message={`将从收藏夹移除 ${deleteTarget?.name ?? ''}，不会影响服务器本身。`}
        confirmLabel="移除服务器"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}

function AddServerModal({
  open,
  onClose,
  onAdded,
  onError
}: {
  open: boolean
  onClose: () => void
  onAdded: (server: SavedServer, list: SavedServer[]) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setAddress('')
    setError('')
    setSaving(false)
  }, [open])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    let parsed: { host: string; port: number }
    try {
      parsed = parseAddress(address)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    setSaving(true)
    try {
      const list = await window.blockdeck.servers.add({
        name: name.trim() || parsed.host,
        host: parsed.host,
        port: parsed.port
      })
      const server = list.find((entry) => entry.host === parsed.host && entry.port === parsed.port)
      if (server) onAdded(server, list)
      else {
        onError('服务器已添加，但列表刷新失败')
        onClose()
      }
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={470}>
      <ModalHeader
        eyebrow="NEW SERVER"
        title="添加服务器"
        subtitle="保存后可以检测状态并一键加入。"
        onClose={onClose}
        icon={<Server size={19} />}
      />
      <form className="mp-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>显示名称 <em>可选</em></span>
          <input
            className="mp-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：朋友的生存服"
            maxLength={48}
          />
        </label>
        <label>
          <span>服务器地址 <em>host:port</em></span>
          <input
            className="mp-input"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="play.example.com:25565"
            autoFocus
            spellCheck={false}
          />
        </label>
        <div className="mp-form-hint">
          <Info size={13} />
          支持域名与 IPv4；不填写端口时默认使用 25565。
        </div>
        {error ? <div className="mp-form-error">{error}</div> : null}
        <div className="mp-form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving || !address.trim()}>
            {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
            添加服务器
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RoomsTab(): React.JSX.Element {
  const {
    installed,
    selectedInstalled,
    running,
    launchVersion,
    setPage,
    toast
  } = useApp()
  const [room, setRoom] = useState<RoomStatus>(emptyRoom)
  const [protocol, setProtocol] = useState<SecureProtocolInfo | null>(null)
  const [lanAddress, setLanAddress] = useState('')
  const [lanInterfaces, setLanInterfaces] = useState<Array<{ name: string; address: string }>>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [roomVersion, setRoomVersion] = useState('')
  const [host, setHost] = useState({
    target: '127.0.0.1:25565',
    advertisedHost: '',
    listenPort: '25570',
    name: '我的世界'
  })
  const [join, setJoin] = useState({ code: '', localPort: '25571' })

  useEffect(() => {
    let mounted = true
    void Promise.all([
      window.blockdeck.rooms.status(),
      window.blockdeck.rooms.lanAddress(),
      window.blockdeck.rooms.protocol()
    ])
      .then(([status, lan, info]) => {
        if (!mounted) return
        setRoom(status)
        setProtocol(info)
        setLanAddress(lan.address)
        setLanInterfaces(lan.interfaces)
        setHost((current) => ({
          ...current,
          advertisedHost: current.advertisedHost || lan.address
        }))
      })
      .catch(() => undefined)
    const unsubscribe = window.blockdeck.events.onRoomStatus((status) => {
      if (mounted) setRoom(status)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!installed.length) {
      setRoomVersion('')
      return
    }
    if (!installed.some((version) => version.id === roomVersion)) {
      setRoomVersion(selectedInstalled?.id ?? installed[0].id)
    }
  }, [installed, roomVersion, selectedInstalled?.id])

  const startHost = async (): Promise<void> => {
    setBusy(true)
    try {
      const target = parseAddress(host.target)
      const status = await window.blockdeck.rooms.startHost({
        targetHost: target.host,
        targetPort: target.port,
        listenPort: Number(host.listenPort) || 25570,
        advertisedHost: host.advertisedHost.trim() || lanAddress,
        name: host.name.trim() || '我的世界'
      })
      setRoom(status)
      toast('加密房间已开启，把联机码发给好友吧', 'success')
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const stopHost = async (): Promise<void> => {
    setBusy(true)
    try {
      setRoom(await window.blockdeck.rooms.stopHost())
      toast('加密房间已关闭')
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const joinRoom = async (): Promise<void> => {
    setBusy(true)
    try {
      const status = await window.blockdeck.rooms.join({
        code: join.code.trim(),
        localPort: Number(join.localPort) || 25571
      })
      setRoom(status)
      toast('已加入加密房间', 'success')
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const leaveRoom = async (): Promise<void> => {
    setBusy(true)
    try {
      setRoom(await window.blockdeck.rooms.leave())
      toast('已离开加密房间')
    } catch (error) {
      toast(cleanError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string, message: string): void => {
    copyText(text, () => {
      setCopied(true)
      toast(message, 'success')
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  const launchIntoRoom = async (): Promise<void> => {
    if (!room.localAddress) return
    if (!roomVersion) {
      toast('请先在版本库安装一个游戏版本', 'error')
      return
    }
    if (running) {
      toast('游戏已经在运行中', 'error')
      return
    }
    await launchVersion(roomVersion, {
      serverAddress: room.localAddress,
      title: '加入加密联机房间'
    })
  }

  const hostActive = room.active && room.role === 'host'
  const clientActive = room.active && room.role === 'client'
  const canHost = !room.active
  const canJoin = !room.active
  const targetHint = host.target || '127.0.0.1:25565'

  return (
    <div className="mp-room-stack">
      <div className="mp-security-banner">
        <span className="mp-security-banner-icon">
          <ShieldCheck size={21} />
        </span>
        <div>
          <strong>BDSL-1 端到端加密联机</strong>
          <p>
            自研联机协议，使用 X25519 临时密钥交换、HKDF-SHA256 与 AES-256-GCM。
            每个 TCP 连接独立握手，严格序号防重放，联机流量不经过第三方中转。
          </p>
        </div>
        <span className="mp-security-tag">
          <LockKeyhole size={12} /> 无中转
        </span>
      </div>

      <div className="mp-room-grid">
        <section className={`room-card panel ${hostActive ? 'is-running' : ''}`}>
          <div className="room-card-head">
            <span className="room-card-icon host">
              <Router size={19} />
            </span>
            <div>
              <div className="eyebrow">HOST A ROOM</div>
              <h2>创建加密房间</h2>
            </div>
            <span className={`room-role-pill ${hostActive ? 'is-live' : ''}`}>
              {hostActive ? '运行中' : '房主'}
            </span>
          </div>

          {hostActive ? (
            <div className="room-live">
              <div className="room-live-top">
                <span className="room-live-dot" />
                <strong>好友可以通过联机码加入</strong>
                <span className="room-live-count">
                  <Users size={12} /> {room.connections} 条连接
                </span>
              </div>
              <label className="mp-field-label">联机码 · 只发给信任的人</label>
              <div className="room-code-box">
                <textarea readOnly value={room.code ?? ''} onFocus={(e) => e.target.select()} />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => copy(room.code ?? '', '联机码已复制')}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <div className="room-fingerprint">
                <Fingerprint size={14} />
                <span>安全指纹</span>
                <strong>{room.fingerprint}</strong>
              </div>
              <div className="room-facts">
                <div>
                  <span>对外入口</span>
                  <strong>{room.host}:{room.port}</strong>
                </div>
                <div>
                  <span>转发至</span>
                  <strong>{room.target}</strong>
                </div>
              </div>
              <div className="room-note">
                <Info size={13} />
                让好友在同一局域网，或把 {room.host}:{room.port} 暴露到公网（端口映射 / 公网 IP）。
                你需要在 Minecraft 中先「对局域网开放」或运行本地服务端。
              </div>
              <button className="btn btn-ghost btn-wide" disabled={busy} onClick={() => void stopHost()}>
                {busy ? <Loader2 size={15} className="spin" /> : <Unplug size={15} />}
                关闭加密房间
              </button>
            </div>
          ) : (
            <div className="room-form">
              <div className="mp-field-label">游戏地址（本机/可达服务端）</div>
              <input
                className="mp-input"
                value={host.target}
                onChange={(event) => setHost({ ...host, target: event.target.value })}
                placeholder="127.0.0.1:25565"
                spellCheck={false}
                disabled={!canHost}
              />
              <div className="mp-inline-hint">
                Minecraft 对局域网开放后，聊天栏会显示端口，例如「本地游戏已在端口 51234 开放」。
              </div>
              <div className="mp-form-row">
                <label>
                  <span>监听端口</span>
                  <input
                    className="mp-input"
                    value={host.listenPort}
                    onChange={(event) => setHost({ ...host, listenPort: event.target.value })}
                    inputMode="numeric"
                    disabled={!canHost}
                  />
                </label>
                <label>
                  <span>房间名称</span>
                  <input
                    className="mp-input"
                    value={host.name}
                    onChange={(event) => setHost({ ...host, name: event.target.value })}
                    maxLength={32}
                    disabled={!canHost}
                  />
                </label>
              </div>
              <label>
                <span>给好友显示的地址</span>
                <div className="mp-address-row">
                  <input
                    className="mp-input"
                    value={host.advertisedHost}
                    onChange={(event) => setHost({ ...host, advertisedHost: event.target.value })}
                    placeholder="192.168.1.10"
                    spellCheck={false}
                    disabled={!canHost}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!lanAddress || !canHost}
                    onClick={() => setHost({ ...host, advertisedHost: lanAddress })}
                  >
                    使用本机地址
                  </button>
                </div>
              </label>
              {lanInterfaces.length > 1 ? (
                <div className="mp-interface-list">
                  {lanInterfaces.slice(0, 4).map((entry) => (
                    <button key={entry.address} onClick={() => setHost({ ...host, advertisedHost: entry.address })}>
                      {entry.address}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mp-form-note">
                <Network size={13} />
                同一局域网可直接使用；公网联机需要端口映射或公网 IP。没有第三方中转服务器。
              </div>
              {!canHost ? (
                <div className="mp-form-error">你正在加入其它房间，请先离开后再创建房间。</div>
              ) : null}
              <button
                className="btn btn-primary btn-wide"
                onClick={() => void startHost()}
                disabled={busy || !canHost || !host.target.trim()}
              >
                {busy ? <Loader2 size={15} className="spin" /> : <Radio size={15} />}
                开启加密房间
              </button>
            </div>
          )}
        </section>

        <section className={`room-card panel ${clientActive ? 'is-running' : ''}`}>
          <div className="room-card-head">
            <span className="room-card-icon join">
              <KeyRound size={19} />
            </span>
            <div>
              <div className="eyebrow">JOIN A ROOM</div>
              <h2>加入加密房间</h2>
            </div>
            <span className={`room-role-pill ${clientActive ? 'is-live' : ''}`}>
              {clientActive ? '已连接' : '好友'}
            </span>
          </div>

          {clientActive ? (
            <div className="room-live">
              <div className="room-live-top">
                <span className="room-live-dot" />
                <strong>本机入口已开放</strong>
                <span className="room-live-count">
                  <Users size={12} /> {room.connections} 条连接
                </span>
              </div>
              <label className="mp-field-label">在 Minecraft 多人游戏中添加</label>
              <div className="room-address-box">
                <code>{room.localAddress}</code>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => copy(room.localAddress ?? '', '本机入口已复制')}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  复制
                </button>
              </div>
              <div className="room-fingerprint">
                <Fingerprint size={14} />
                <span>安全指纹</span>
                <strong>{room.fingerprint}</strong>
              </div>
              <div className="room-facts">
                <div>
                  <span>房主入口</span>
                  <strong>{room.host}:{room.port}</strong>
                </div>
                <div>
                  <span>本机端口</span>
                  <strong>{room.localAddress}</strong>
                </div>
              </div>
              <div className="room-note">
                <Info size={13} />
                核对安全指纹是否与房主一致；如不一致，请不要输入任何游戏账号信息。
              </div>
              <div className="mp-room-launch">
                <div className="select-wrap compact">
                  <select
                    value={roomVersion}
                    onChange={(event) => setRoomVersion(event.target.value)}
                    disabled={!installed.length}
                  >
                    {installed.length ? (
                      installed.map((version) => (
                        <option key={version.id} value={version.id}>
                          {versionLabel(version)}
                        </option>
                      ))
                    ) : (
                      <option value="">尚未安装游戏版本</option>
                    )}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!installed.length || !!running}
                  onClick={() => void launchIntoRoom()}
                >
                  {running ? <Loader2 size={15} className="spin" /> : <Play size={14} fill="currentColor" />}
                  {running ? '游戏运行中' : '启动并进入'}
                </button>
              </div>
              {!installed.length ? (
                <button className="text-action" onClick={() => setPage('versions')}>
                  先去安装一个游戏版本 <ChevronRight size={13} />
                </button>
              ) : null}
              <button className="btn btn-ghost btn-wide" disabled={busy} onClick={() => void leaveRoom()}>
                {busy ? <Loader2 size={15} className="spin" /> : <Unplug size={15} />}
                离开房间
              </button>
            </div>
          ) : (
            <div className="room-form">
              <label>
                <span>联机码</span>
                <textarea
                  className="mp-code-input"
                  value={join.code}
                  onChange={(event) => setJoin({ ...join, code: event.target.value })}
                  placeholder="粘贴房主发来的 BDSL1.… 联机码"
                  spellCheck={false}
                  disabled={!canJoin}
                />
              </label>
              <div className="mp-form-row one">
                <label>
                  <span>本机入口端口</span>
                  <input
                    className="mp-input"
                    value={join.localPort}
                    onChange={(event) => setJoin({ ...join, localPort: event.target.value })}
                    inputMode="numeric"
                    disabled={!canJoin}
                  />
                </label>
              </div>
              <div className="mp-form-note">
                <LockKeyhole size={13} />
                加入后启动器会在 127.0.0.1 提供一个加密入口；联机码本身是房间密钥，请妥善保管。
              </div>
              {!canJoin ? (
                <div className="mp-form-error">你正在运行一个房间，请先关闭当前房间。</div>
              ) : null}
              <button
                className="btn btn-primary btn-wide"
                onClick={() => void joinRoom()}
                disabled={busy || !canJoin || !join.code.trim()}
              >
                {busy ? <Loader2 size={15} className="spin" /> : <ArrowRight size={15} />}
                加入加密房间
              </button>
            </div>
          )}
        </section>
      </div>

      <SecurityPanel protocol={protocol} targetHint={targetHint} />
    </div>
  )
}

function SecurityPanel({
  protocol,
  targetHint
}: {
  protocol: SecureProtocolInfo | null
  targetHint: string
}): React.JSX.Element {
  const info = protocol ?? {
    name: 'BlockDeck Secure Link',
    version: 1,
    keyExchange: 'X25519 ephemeral ECDH',
    kdf: 'HKDF-SHA256',
    cipher: 'AES-256-GCM',
    handshakeAuth: 'HMAC-SHA256 + 256-bit room key',
    replayProtection: 'strict 64-bit sequence + GCM authentication tag',
    forwardSecrecy: true
  }
  return (
    <section className="mp-security panel">
      <div className="mp-security-head">
        <span className="mp-security-icon">
          <ShieldCheck size={21} />
        </span>
        <div>
          <div className="eyebrow">PROTOCOL / BDSL-1</div>
          <h2>安全模型</h2>
          <p>
            自研的是联机协议，不是新的密码算法。所有密码学原语均使用 Node.js / OpenSSL 的标准实现。
          </p>
        </div>
        <span className="version-badge">v{info.version}</span>
      </div>
      <div className="mp-protocol-grid">
        <div>
          <span>密钥交换</span>
          <strong>{info.keyExchange}</strong>
          <small>每连接临时密钥，具备前向保密</small>
        </div>
        <div>
          <span>密钥派生</span>
          <strong>{info.kdf}</strong>
          <small>房间密钥 + 握手转录绑定</small>
        </div>
        <div>
          <span>数据加密</span>
          <strong>{info.cipher}</strong>
          <small>认证加密，密文被篡改即断开</small>
        </div>
        <div>
          <span>身份认证</span>
          <strong>HMAC-SHA256</strong>
          <small>256 位房间密钥挑战应答</small>
        </div>
        <div>
          <span>重放保护</span>
          <strong>严格 64 位序号</strong>
          <small>乱序 / 重放 / 伪造帧会被拒绝</small>
        </div>
        <div>
          <span>传输路径</span>
          <strong>点对点直连</strong>
          <small>无第三方中转，不经过 BlockDeck 服务器</small>
        </div>
      </div>
      <div className="mp-security-foot">
        <div>
          <span className="signal-dot" />
          联机目标示例：{targetHint}
        </div>
        <span>仅把联机码发给信任的人 · 联机码等同密码</span>
      </div>
    </section>
  )
}
