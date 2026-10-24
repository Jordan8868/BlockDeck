import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('shared') } },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: '.',
    resolve: {
      alias: {
        '@shared': resolve('shared'),
        '@': resolve('src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
