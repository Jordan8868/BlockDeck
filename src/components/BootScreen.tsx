import React from 'react'
import { LogoMark } from './Avatar'

export function BootScreen(): React.JSX.Element {
  return (
    <div className="boot-screen">
      <div className="boot-orbit boot-orbit-a" />
      <div className="boot-orbit boot-orbit-b" />
      <div className="boot-core">
        <LogoMark size={64} />
        <div className="boot-word">BlockDeck</div>
        <div className="boot-caption">正在唤醒方块工坊</div>
        <div className="boot-loading">
          <span />
        </div>
      </div>
    </div>
  )
}
