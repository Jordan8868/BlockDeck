import { contextBridge, ipcRenderer } from 'electron'
import type { BlockDeckApi } from '@shared/ipc'
import type { GameExitEvent, LogEvent, ProgressEvent, RoomStatus } from '@shared/types'

const api: BlockDeckApi = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
    openPath: (target) => ipcRenderer.invoke('app:openPath', target),
    revealPath: (target) => ipcRenderer.invoke('app:revealPath', target),
    recentLogs: () => ipcRenderer.invoke('app:recentLogs')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    chooseGameDir: () => ipcRenderer.invoke('settings:chooseGameDir'),
    chooseJava: () => ipcRenderer.invoke('settings:chooseJava'),
    openGameDir: () => ipcRenderer.invoke('settings:openGameDir')
  },
  accounts: {
    state: () => ipcRenderer.invoke('accounts:state'),
    loginMicrosoft: () => ipcRenderer.invoke('accounts:loginMicrosoft'),
    loginOffline: (name) => ipcRenderer.invoke('accounts:loginOffline', name),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    setActive: (id) => ipcRenderer.invoke('accounts:setActive', id)
  },
  versions: {
    manifest: (force) => ipcRenderer.invoke('versions:manifest', force),
    installed: () => ipcRenderer.invoke('versions:installed'),
    install: (versionId, taskId) => ipcRenderer.invoke('versions:install', versionId, taskId),
    remove: (versionId) => ipcRenderer.invoke('versions:remove', versionId),
    loaders: (mcVersion, kind) => ipcRenderer.invoke('versions:loaders', mcVersion, kind),
    installLoader: (request, taskId) =>
      ipcRenderer.invoke('versions:installLoader', request, taskId),
    loaderInfo: () => ipcRenderer.invoke('versions:loaderInfo'),
    openFolder: (versionId) => ipcRenderer.invoke('versions:openFolder', versionId)
  },
  java: {
    detect: () => ipcRenderer.invoke('java:detect'),
    install: (major, taskId) => ipcRenderer.invoke('java:install', major, taskId)
  },
  mods: {
    search: (params) => ipcRenderer.invoke('mods:search', params),
    install: (projectId, gameVersion, loader, taskId) =>
      ipcRenderer.invoke('mods:install', projectId, gameVersion, loader, taskId),
    installed: () => ipcRenderer.invoke('mods:installed'),
    toggle: (fileName, enabled) => ipcRenderer.invoke('mods:toggle', fileName, enabled),
    remove: (fileName) => ipcRenderer.invoke('mods:remove', fileName)
  },
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    add: (input) => ipcRenderer.invoke('servers:add', input),
    update: (id, patch) => ipcRenderer.invoke('servers:update', id, patch),
    remove: (id) => ipcRenderer.invoke('servers:remove', id),
    ping: (host, port) => ipcRenderer.invoke('servers:ping', host, port),
    touch: (id) => ipcRenderer.invoke('servers:touch', id)
  },
  rooms: {
    status: () => ipcRenderer.invoke('rooms:status'),
    startHost: (options) => ipcRenderer.invoke('rooms:startHost', options),
    stopHost: () => ipcRenderer.invoke('rooms:stopHost'),
    join: (options) => ipcRenderer.invoke('rooms:join', options),
    leave: () => ipcRenderer.invoke('rooms:leave'),
    lanAddress: () => ipcRenderer.invoke('rooms:lanAddress'),
    protocol: () => ipcRenderer.invoke('rooms:protocol')
  },
  launch: {
    start: (options, taskId) => ipcRenderer.invoke('launch:start', options, taskId),
    stop: () => ipcRenderer.invoke('launch:stop'),
    status: () => ipcRenderer.invoke('launch:status')
  },
  events: {
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ProgressEvent): void =>
        callback(payload)
      ipcRenderer.on('task:progress', listener)
      return () => ipcRenderer.removeListener('task:progress', listener)
    },
    onLog: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: LogEvent): void =>
        callback(payload)
      ipcRenderer.on('app:log', listener)
      return () => ipcRenderer.removeListener('app:log', listener)
    },
    onGameExit: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: GameExitEvent): void =>
        callback(payload)
      ipcRenderer.on('game:exit', listener)
      return () => ipcRenderer.removeListener('game:exit', listener)
    },
    onMaximize: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
        callback(maximized)
      ipcRenderer.on('window:maximized', listener)
      return () => ipcRenderer.removeListener('window:maximized', listener)
    },
    onRoomStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: RoomStatus): void =>
        callback(status)
      ipcRenderer.on('room:status', listener)
      return () => ipcRenderer.removeListener('room:status', listener)
    }
  }
}

contextBridge.exposeInMainWorld('blockdeck', api)
