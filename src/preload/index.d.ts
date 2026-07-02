import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    desktopWindow: {
      isDesktop: boolean
      minimize: () => Promise<void>
      toggleMaximize: () => Promise<void>
      toggleFullscreen: () => Promise<void>
      exitFullscreenWindowed: () => Promise<void>
      getState: () => Promise<any>
      close: () => Promise<void>
      onStateChange: (callback: (state: any) => void) => () => void
      openNeteaseMusicLogin: () => Promise<any>
      clearNeteaseMusicLogin: () => Promise<any>
      openQQMusicLogin: () => Promise<any>
      clearQQMusicLogin: () => Promise<any>
      apiRequest: (url: string, params?: any, data?: any) => Promise<any>
    }
  }
}
