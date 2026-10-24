import React, { useState } from 'react'
import {
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  WifiOff
} from 'lucide-react'
import { useApp } from '../store'
import { PageHeader } from '../components/Page'
import { Avatar } from '../components/Avatar'
import { ConfirmDialog } from '../components/Modal'
import { formatDate } from '../lib'
import type { PublicAccount } from '@shared/types'

function MicrosoftMark(): React.JSX.Element {
  return (
    <span className="ms-mark" aria-hidden>
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

export function AccountsPage(): React.JSX.Element {
  const {
    accountState,
    activeAccount,
    loginMicrosoft,
    loginOffline,
    removeAccount,
    setActiveAccount,
    toast
  } = useApp()
  const [msLoading, setMsLoading] = useState(false)
  const [offlineName, setOfflineName] = useState('')
  const [offlineLoading, setOfflineLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PublicAccount | null>(null)
  const validName = /^[A-Za-z0-9_]{3,16}$/.test(offlineName.trim())

  const handleMicrosoft = async (): Promise<void> => {
    setMsLoading(true)
    await loginMicrosoft()
    setMsLoading(false)
  }

  const handleOffline = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (!validName) {
      toast('用户名需为 3–16 位字母、数字或下划线', 'error')
      return
    }
    setOfflineLoading(true)
    const ok = await loginOffline(offlineName.trim())
    if (ok) setOfflineName('')
    setOfflineLoading(false)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    await removeAccount(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="page accounts-page">
      <PageHeader
        eyebrow="IDENTITY / 账户"
        title="带上你的身份，进入世界"
        subtitle="Microsoft 正版账户与本地离线档案并存，随时切换。"
        actions={
          <div className="account-summary-pill">
            <span className={`presence-dot ${activeAccount ? 'is-online' : ''}`} />
            {activeAccount ? `当前：${activeAccount.name}` : '当前未登录'}
          </div>
        }
      />

      <div className="auth-grid">
        <article className="auth-card auth-microsoft">
          <div className="auth-card-glow" />
          <div className="auth-card-top">
            <span className="auth-provider">
              <MicrosoftMark />
              MICROSOFT
            </span>
            <span className="secure-tag">
              <ShieldCheck size={13} /> 正版验证
            </span>
          </div>
          <h2>使用 Microsoft<br />账户登录</h2>
          <p>
            通过 Xbox Live 安全验证，自动获取正版档案、皮肤与披风。需要账号已拥有 Minecraft
            Java 版。
          </p>
          <div className="auth-features">
            <span>
              <Check size={13} /> 正版服务器
            </span>
            <span>
              <Check size={13} /> 皮肤同步
            </span>
            <span>
              <Check size={13} /> 令牌加密
            </span>
          </div>
          <button className="ms-login-btn" onClick={() => void handleMicrosoft()} disabled={msLoading}>
            {msLoading ? <Loader2 size={18} className="spin" /> : <MicrosoftMark />}
            <span>{msLoading ? '请在弹出的窗口完成登录…' : '登录 Microsoft 账户'}</span>
            {!msLoading ? <ArrowRight size={17} /> : null}
          </button>
          <div className="auth-footnote">
            <LockKeyhole size={12} />
            登录窗口由 Microsoft 官方页面提供，BlockDeck 不会读取你的密码。
          </div>
          <div className="auth-visual" aria-hidden>
            <span className="auth-cube auth-cube-1" />
            <span className="auth-cube auth-cube-2" />
            <span className="auth-cube auth-cube-3" />
            <span className="auth-grid-lines" />
          </div>
        </article>

        <article className="auth-card auth-offline">
          <div className="auth-card-top">
            <span className="auth-provider offline-provider">
              <WifiOff size={15} />
              OFFLINE
            </span>
            <span className="soft-tag">本地档案</span>
          </div>
          <h2>创建一个<br />离线角色</h2>
          <p>
            不需要网络与正版账号，适合单人游戏、局域网与测试模组。用户名会生成本地 UUID。
          </p>
          <form onSubmit={(event) => void handleOffline(event)} className="offline-form">
            <label htmlFor="offline-name">玩家名</label>
            <div className={`offline-input ${offlineName && !validName ? 'has-error' : ''}`}>
              <UserRound size={17} />
              <input
                id="offline-name"
                value={offlineName}
                onChange={(event) => setOfflineName(event.target.value)}
                placeholder="例如 Steve_2026"
                maxLength={16}
                autoComplete="off"
                spellCheck={false}
              />
              <span className="input-count">{offlineName.length}/16</span>
            </div>
            <div className="offline-hint">
              {offlineName && !validName
                ? '3–16 位，仅限字母、数字、下划线'
                : '离线名无法加入正版验证服务器'}
            </div>
            <button
              className="btn btn-primary btn-wide"
              type="submit"
              disabled={!validName || offlineLoading}
            >
              {offlineLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
              创建离线档案
            </button>
          </form>
          <div className="offline-art" aria-hidden>
            <span className="offline-bit b1" />
            <span className="offline-bit b2" />
            <span className="offline-bit b3" />
            <span className="offline-bit b4" />
            <span className="offline-bit b5" />
            <span className="offline-avatar-art">?</span>
          </div>
        </article>
      </div>

      <section className="accounts-panel panel">
        <div className="accounts-head">
          <div>
            <div className="eyebrow">SAVED PROFILES</div>
            <h2>账户列表</h2>
          </div>
          <span className="accounts-count">{accountState.accounts.length} 个档案</span>
        </div>

        {accountState.accounts.length ? (
          <div className="accounts-list">
            {accountState.accounts.map((account) => {
              const active = account.id === accountState.activeId
              return (
                <div className={`account-row ${active ? 'is-active' : ''}`} key={account.id}>
                  <Avatar name={account.name} uuid={account.uuid} skinUrl={account.skinUrl} size={46} />
                  <div className="account-row-copy">
                    <div className="account-row-name">
                      <strong>{account.name}</strong>
                      {active ? <span className="active-pill">当前使用</span> : null}
                      {account.expired ? <span className="expired-pill">登录已过期</span> : null}
                    </div>
                    <span>
                      {account.type === 'microsoft' ? (
                        <>
                          <MicrosoftMark /> Microsoft 正版账户
                        </>
                      ) : (
                        <>
                          <UserRound size={12} /> 离线档案
                        </>
                      )}
                      <span className="dot-sep">·</span>
                      创建于 {formatDate(new Date(account.createdAt).toISOString())}
                    </span>
                    <code>{account.uuid}</code>
                  </div>
                  <div className="account-row-type">
                    {account.type === 'microsoft' ? (
                      <span className="type-badge ms">
                        <ShieldCheck size={13} /> 正版
                      </span>
                    ) : (
                      <span className="type-badge">
                        <WifiOff size={13} /> 本地
                      </span>
                    )}
                  </div>
                  <div className="account-row-actions">
                    {!active ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => void setActiveAccount(account.id)}>
                        切换
                      </button>
                    ) : (
                      <span className="current-check">
                        <Check size={14} /> 使用中
                      </span>
                    )}
                    <button
                      className="icon-btn danger-hover"
                      title="移除账户"
                      onClick={() => setDeleteTarget(account)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="accounts-empty">
            <span className="empty-icon">
              <KeyRound size={26} />
            </span>
            <h3>还没有保存的账户</h3>
            <p>登录 Microsoft 正版账户，或在上方创建一个离线角色。</p>
          </div>
        )}
      </section>

      <div className="account-security-note">
        <span className="security-icon">
          <LockKeyhole size={16} />
        </span>
        <div>
          <strong>凭证安全</strong>
          <p>
            Microsoft 访问令牌仅保存在本机，并使用 Windows DPAPI 加密。BlockDeck
            不会上传账户信息，也不会记录密码。
          </p>
        </div>
        <Sparkles size={18} className="security-spark" />
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="移除这个账户？"
        message={`将从启动器中移除 ${deleteTarget?.name ?? ''}，不会影响 Microsoft 账号或游戏存档。`}
        confirmLabel="移除账户"
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
