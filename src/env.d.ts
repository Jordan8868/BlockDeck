/// <reference types="vite/client" />
import type { BlockDeckApi } from '@shared/ipc'

declare global {
  interface Window {
    blockdeck: BlockDeckApi
  }
}

export {}
