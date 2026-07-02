import { contextBridge, ipcRenderer } from 'electron'

const desktopWindow = {
  isDesktop: true,
  minimize: (): Promise<void> => ipcRenderer.invoke('desktop-window-minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('desktop-window-toggle-maximize'),
  toggleFullscreen: (): Promise<void> => ipcRenderer.invoke('desktop-window-toggle-fullscreen'),
  exitFullscreenWindowed: (): Promise<void> => ipcRenderer.invoke('desktop-window-exit-fullscreen-windowed'),
  getState: (): Promise<any> => ipcRenderer.invoke('desktop-window-get-state'),
  close: (): Promise<void> => ipcRenderer.invoke('desktop-window-close'),

  // Listeners
  onStateChange: (callback: (state: any) => void): (() => void) => {
    const listener = (_event: any, state: any): void => callback(state)
    ipcRenderer.on('desktop-window-state', listener)
    return (): void => {
      ipcRenderer.removeListener('desktop-window-state', listener)
    }
  },

  // Music Login Orchestration
  openNeteaseMusicLogin: (): Promise<any> => ipcRenderer.invoke('netease-music-open-login'),
  clearNeteaseMusicLogin: (): Promise<any> => ipcRenderer.invoke('netease-music-clear-login'),
  openQQMusicLogin: (): Promise<any> => ipcRenderer.invoke('qq-music-open-login'),
  clearQQMusicLogin: (): Promise<any> => ipcRenderer.invoke('qq-music-clear-login'),

  // Unified Serverless API Broker
  apiRequest: (url: string, params?: any, data?: any): Promise<any> => {
    return ipcRenderer.invoke('api-request', { url, params, data })
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('desktopWindow', desktopWindow)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.desktopWindow = desktopWindow
}

// Add desktop styles on load
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('desktop-shell-root')
  document.body.classList.add('desktop-shell')
})
