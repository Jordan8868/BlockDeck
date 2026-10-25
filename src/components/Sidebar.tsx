import React from 'react'
import {
  Blocks,
  ChevronRight,
  Globe2,
  House,
  Layers3,
  ScrollText,
  Settings2,
  UserRound
} from 'lucide-react'
import type { PageId } from '@shared/types'
import { useApp } from '../store'
import { Avatar, LogoMark } from './Avatar'

const navItems: Array<{ id: PageId; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'home', label: '主页', hint: '总览', icon: <House size={19} strokeWidth={1.8} /> },
  { id: 'versions', label: '版本库', hint: '游戏版本', icon: <Layers3 size={19} strokeWidth={1.8} /> },
  { id: 'multiplayer', label: '联机大厅', hint: '服务器与加密房间', icon: <Globe2 size={19} strokeWidth={1.8} /> },
  { id: 'mods', label: '模组工坊', hint: 'Modrinth', icon: <Blocks size={19} strokeWidth={1.8} /> },
  { id: 'accounts', label: '账户', hint: '身份', icon: <UserRound size={19} strokeWidth={1.8} /> },
  { id: 'settings', label: '设置', hint: '启动器', icon: <Settings2 size={19} strokeWidth={1.8} /> }
]

export function Sidebar(): React.JSX.Element {
  const {
    page,
    setPage,
    installed,
    installedMods,
    activeAccount,
    appInfo,
    openLogs,
    running
  } = useApp()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LogoMark size={42} />
        <div className="sidebar-brand-text">
          <span className="brand-name">BlockDeck</span>
          <span className="brand-sub">方块工坊</span>
        </div>
        <span className="brand-chip">JAVA</span>
      </div>

      <div className="sidebar-label">工作台</div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              className={`nav-item ${active ? 'is-active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              {item.id === 'versions' && installed.length > 0 ? (
                <span className="nav-count">{installed.length}</span>
              ) : null}
              {item.id === 'mods' && installedMods.length > 0 ? (
                <span className="nav-count">{installedMods.filter((mod) => mod.enabled).length}</span>
              ) : null}
              {active ? <span className="nav-active-bar" /> : null}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-spacer" />

      {running ? (
        <div className="running-mini">
          <span className="running-pulse" />
          <div>
            <strong>游戏运行中</strong>
            <span>{running.versionId}</span>
          </div>
        </div>
      ) : null}

      <button className="account-card" onClick={() => setPage('accounts')}>
        {activeAccount ? (
          <>
            <Avatar
              name={activeAccount.name}
              uuid={activeAccount.uuid}
              skinUrl={activeAccount.skinUrl}
              customSkin={activeAccount.customSkin}
              size={38}
            />
            <span className="account-card-copy">
              <strong>{activeAccount.name}</strong>
              <small>{activeAccount.type === 'microsoft' ? 'Microsoft 正版' : '离线档案'}</small>
            </span>
            <ChevronRight size={16} className="account-card-arrow" />
          </>
        ) : (
          <>
            <span className="account-card-empty-icon">
              <UserRound size={18} />
            </span>
            <span className="account-card-copy">
              <strong>添加账户</strong>
              <small>正版 / 离线</small>
            </span>
            <ChevronRight size={16} className="account-card-arrow" />
          </>
        )}
      </button>

      <div className="sidebar-footer">
        <button className="sidebar-utility" onClick={openLogs}>
          <ScrollText size={15} />
          <span>运行日志</span>
        </button>
        <span className="sidebar-version">v{appInfo?.version ?? '1.2.1'}</span>
      </div>
    </aside>
  )
}
