import React, { useEffect, useState } from 'react'
import { Minus, Square, X, Copy } from 'lucide-react'

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.blockdeck.window.isMaximized().then(setMaximized)
    return window.blockdeck.events.onMaximize(setMaximized)
  }, [])

  return (
    <div
      className="titlebar"
      onDoubleClick={() => void window.blockdeck.window.maximize()}
      role="presentation"
    >
      <div className="titlebar-brand">
        <span className="titlebar-brand-mark" />
        <span>BLOCKDECK</span>
        <span className="titlebar-sep">/</span>
        <span className="titlebar-muted">方块工坊</span>
      </div>
      <div className="titlebar-status">
        <span className="signal-dot" />
        <span>LOCAL LAUNCHER</span>
      </div>
      <div className="window-controls" onDoubleClick={(event) => event.stopPropagation()}>
        <button
          className="window-btn"
          onClick={() => void window.blockdeck.window.minimize()}
          aria-label="最小化"
        >
          <Minus size={15} strokeWidth={1.7} />
        </button>
        <button
          className="window-btn"
          onClick={() => void window.blockdeck.window.maximize()}
          aria-label={maximized ? '还原' : '最大化'}
        >
          {maximized ? <Copy size={13} strokeWidth={1.6} /> : <Square size={12} strokeWidth={1.7} />}
        </button>
        <button
          className="window-btn window-close"
          onClick={() => void window.blockdeck.window.close()}
          aria-label="关闭"
        >
          <X size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}
