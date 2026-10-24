import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let dataDir = ''
let gameDirOverride = ''

export function initPaths(): void {
  const envData = process.env.BLOCKDECK_DATA_DIR
  if (envData) {
    dataDir = path.resolve(envData)
    app.setPath('userData', dataDir)
  } else {
    dataDir = app.getPath('userData')
  }
  fs.mkdirSync(dataDir, { recursive: true })

  gameDirOverride = process.env.BLOCKDECK_GAME_DIR
    ? path.resolve(process.env.BLOCKDECK_GAME_DIR)
    : ''
}

export function getDataDir(): string {
  return dataDir
}

export function getDefaultGameDir(): string {
  if (gameDirOverride) return gameDirOverride
  if (process.env.BLOCKDECK_DATA_DIR) return path.join(dataDir, 'game')
  return path.join(app.getPath('appData'), '.blockdeck', 'minecraft')
}

export function getSettingsPath(): string {
  return path.join(dataDir, 'settings.json')
}

export function getAccountsPath(): string {
  return path.join(dataDir, 'accounts.json')
}

export function getCacheDir(): string {
  return path.join(dataDir, 'cache')
}

export function getLogsDir(): string {
  return path.join(dataDir, 'logs')
}
