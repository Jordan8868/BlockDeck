import React, { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useApp } from './store'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { TaskDock } from './components/TaskDock'
import { LogDrawer } from './components/LogDrawer'
import { BootScreen } from './components/BootScreen'
import { HomePage } from './pages/Home'
import { VersionsPage } from './pages/Versions'
import { MultiplayerPage } from './pages/Multiplayer'
import { ModsPage } from './pages/Mods'
import { AccountsPage } from './pages/Accounts'
import { SettingsPage } from './pages/Settings'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="crash-screen">
          <div className="crash-icon">
            <AlertTriangle size={30} />
          </div>
          <h1>界面遇到了一点问题</h1>
          <p>{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={15} /> 重新载入
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function PageRouter(): React.JSX.Element {
  const { page } = useApp()
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 })
  }, [page])
  const pages: Record<string, React.JSX.Element> = {
    home: <HomePage />,
    versions: <VersionsPage />,
    multiplayer: <MultiplayerPage />,
    mods: <ModsPage />,
    accounts: <AccountsPage />,
    settings: <SettingsPage />
  }
  return (
    <div className="page-wrap" key={page}>
      {pages[page]}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const { ready, settings } = useApp()
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])
  if (!ready) return <BootScreen />
  const customBackground = settings.customBackground
  const backgroundStyle = customBackground
    ? {
        backgroundImage: `linear-gradient(rgba(3, 7, 9, ${settings.backgroundDim}), rgba(3, 7, 9, ${Math.min(0.92, settings.backgroundDim + 0.11)})), url("${customBackground}")`
      }
    : undefined
  return (
    <ErrorBoundary>
      <div className={`app ${customBackground ? 'has-custom-bg' : ''}`}>
        {backgroundStyle ? <div className="custom-background" style={backgroundStyle} aria-hidden /> : null}
        <div className="ambient" aria-hidden>
          <span className="ambient-orb ambient-orb-a" />
          <span className="ambient-orb ambient-orb-b" />
          <span className="ambient-orb ambient-orb-c" />
          <span className="ambient-grid" />
        </div>
        <TitleBar />
        <div className="shell">
          <Sidebar />
          <main className="main-scroll" id="main-scroll">
            <PageRouter />
          </main>
        </div>
        <TaskDock />
        <LogDrawer />
      </div>
    </ErrorBoundary>
  )
}
