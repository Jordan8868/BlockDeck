import React from 'react'
import { Check, ChevronUp, CircleAlert, Loader2, Terminal } from 'lucide-react'
import { useApp } from '../store'
import { ProgressBar } from './Bits'
import { errorSummary } from '../lib'

export function TaskDock(): React.JSX.Element | null {
  const { tasks, openLogs } = useApp()
  if (!tasks.length) return null
  const ordered = [...tasks].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return b.startedAt - a.startedAt
  })
  const visible = ordered.slice(0, 2)
  return (
    <div className="task-dock">
      {visible.map((task) => (
        <div
          key={task.id}
          className={`task-card task-${task.status}`}
          onClick={openLogs}
          role="button"
          tabIndex={0}
        >
          <div className="task-head">
            <span className={`task-icon task-icon-${task.kind}`}>
              {task.status === 'running' ? (
                <Loader2 size={15} className="spin" />
              ) : task.status === 'done' ? (
                <Check size={15} />
              ) : (
                <CircleAlert size={15} />
              )}
            </span>
            <div className="task-copy">
              <strong>{task.title}</strong>
              <span>{task.status === 'error' ? errorSummary(task.message) : task.message}</span>
            </div>
            <span className="task-percent">
              {task.status === 'running' && task.percent > 0
                ? `${Math.round(task.percent)}%`
                : task.status === 'done'
                  ? '完成'
                  : '错误'}
            </span>
          </div>
          {task.status === 'running' ? (
            <ProgressBar
              value={task.percent}
              indeterminate={task.percent <= 0}
              thin
              accent="#c8ff62"
            />
          ) : null}
        </div>
      ))}
      <button className="task-log-link" onClick={openLogs}>
        <Terminal size={13} />
        <span>查看运行日志</span>
        <ChevronUp size={13} />
      </button>
    </div>
  )
}
