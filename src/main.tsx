import '@fontsource-variable/outfit'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LauncherProvider } from './store'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <LauncherProvider>
    <App />
  </LauncherProvider>
)
