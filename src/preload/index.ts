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
