import type { LoaderKind, VersionType } from '@shared/types'

export const loaderMeta: Record<LoaderKind, { label: string; short: string; color: string; soft: string }> = {
  vanilla: { label: '原版', short: 'VANILLA', color: '#b8c4d9', soft: 'rgba(184,196,217,.12)' },
  fabric: { label: 'Fabric', short: 'FABRIC', color: '#e4d7b8', soft: 'rgba(228,215,184,.12)' },
  forge: { label: 'Forge', short: 'FORGE', color: '#f08562', soft: 'rgba(240,133,98,.13)' },
  neoforge: { label: 'NeoForge', short: 'NEOFORGE', color: '#ffc35c', soft: 'rgba(255,195,92,.13)' },
  quilt: { label: 'Quilt', short: 'QUILT', color: '#b79bff', soft: 'rgba(183,155,255,.13)' }
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!bytes || bytes < 0) return '0 MB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(digits)} MB`
  return `${(bytes / 1024 ** 3).toFixed(digits)} GB`
}

export function formatNumber(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)} 亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)} 万`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function formatDate(iso?: string): string {
  if (!iso) return '未知'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '未知'
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export function relativeTime(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

export const versionTypeMeta: Record<
  string,
  { label: string; color: string; background: string }
> = {
  release: { label: '正式版', color: '#c9ff7a', background: 'rgba(169,255,78,.12)' },
  snapshot: { label: '快照', color: '#c1aaff', background: 'rgba(177,150,255,.12)' },
  old_beta: { label: '旧版 Beta', color: '#ffc375', background: 'rgba(255,184,102,.11)' },
  old_alpha: { label: '旧版 Alpha', color: '#ff9d8a', background: 'rgba(255,143,125,.11)' },
  modified: { label: '整合', color: '#7fe7ff', background: 'rgba(111,218,255,.11)' }
}

export function isRelease(type: string): type is VersionType {
  return type === 'release'
}

export function hueFromString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 360
  return Math.abs(hash)
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜还长'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 23) return '晚上好'
  return '夜深了'
}

export function loaderFromVersionId(id: string): LoaderKind {
  const lower = id.toLowerCase()
  if (lower.includes('neoforge')) return 'neoforge'
  if (lower.includes('forge')) return 'forge'
  if (lower.includes('fabric')) return 'fabric'
  if (lower.includes('quilt')) return 'quilt'
  return 'vanilla'
}

export function downloadSourceLabel(source: string): string {
  if (source === 'official') return '官方源'
  if (source === 'mirror') return '国内镜像'
  return '自动优选'
}

export function errorSummary(message: string): string {
  return message.length > 120 ? `${message.slice(0, 120)}…` : message
}
