import type { ThemeId } from '@shared/types'

export interface ThemePreset {
  id: ThemeId
  name: string
  tagline: string
  accent: string
  secondary: string
  preview: string
}

export const THEMES: ThemePreset[] = [
  {
    id: 'lime',
    name: '青柠方块',
    tagline: 'BlockDeck 默认',
    accent: '#c8ff62',
    secondary: '#7bf0bb',
    preview: 'linear-gradient(135deg, #0a120d 0%, #1a3313 48%, #c8ff62 100%)'
  },
  {
    id: 'ocean',
    name: '深海信标',
    tagline: '冷冽的蓝绿光',
    accent: '#6bd6ff',
    secondary: '#7fffd4',
    preview: 'linear-gradient(135deg, #061019 0%, #0b2b3a 48%, #6bd6ff 100%)'
  },
  {
    id: 'sunset',
    name: '日落熔岩',
    tagline: '暖橙与珊瑚',
    accent: '#ffb46b',
    secondary: '#ff8f7a',
    preview: 'linear-gradient(135deg, #160c08 0%, #3a1c12 48%, #ffb46b 100%)'
  },
  {
    id: 'violet',
    name: '星云紫晶',
    tagline: '末地般的紫光',
    accent: '#c6a6ff',
    secondary: '#9be7ff',
    preview: 'linear-gradient(135deg, #0b0716 0%, #24163f 48%, #c6a6ff 100%)'
  },
  {
    id: 'sakura',
    name: '樱花原野',
    tagline: '柔和粉樱',
    accent: '#ff9fc5',
    secondary: '#ffd1a8',
    preview: 'linear-gradient(135deg, #140910 0%, #3a1828 48%, #ff9fc5 100%)'
  },
  {
    id: 'mono',
    name: '墨白工业',
    tagline: '极简黑白',
    accent: '#edf5ef',
    secondary: '#b9c7bd',
    preview: 'linear-gradient(135deg, #080a0b 0%, #20282a 48%, #edf5ef 100%)'
  }
]
