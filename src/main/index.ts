import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  registerWindowIpcHandlers,
  sendWindowState,
  getWindowedBounds,
  applyWindowedBounds
} from './ipc/windowIpc'

let mainWindowStateTimer: NodeJS.Timeout | null = null

function scheduleWindowStateSend(win: BrowserWindow, delay = 80): void {
  if (!win || win.isDestroyed()) return
  if (mainWindowStateTimer) clearTimeout(mainWindowStateTimer)
  mainWindowStateTimer = setTimeout(() => {
    mainWindowStateTimer = null
    sendWindowState(win)
  }, delay)
}

function createWindow(): void {
  const initialBounds = getWindowedBounds()

  // Create the browser window (Mineradio frameless & transparent style).
  const mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 960,
    minHeight: 540,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    sendWindowState(mainWindow)
  })

  mainWindow.webContents.once('did-finish-load', () => {
    sendWindowState(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Window state event listeners
  mainWindow.on('maximize', () => sendWindowState(mainWindow))
  mainWindow.on('unmaximize', () => sendWindowState(mainWindow))
  mainWindow.on('minimize', () => sendWindowState(mainWindow))
  mainWindow.on('restore', () => sendWindowState(mainWindow))
  mainWindow.on('show', () => sendWindowState(mainWindow))
  mainWindow.on('hide', () => sendWindowState(mainWindow))
  mainWindow.on('focus', () => sendWindowState(mainWindow))
  mainWindow.on('blur', () => sendWindowState(mainWindow))
  mainWindow.on('move', () => scheduleWindowStateSend(mainWindow))
  mainWindow.on('resize', () => scheduleWindowStateSend(mainWindow))

  mainWindow.on('enter-full-screen', () => {
    sendWindowState(mainWindow)
  })
  mainWindow.on('leave-full-screen', () => {
    setTimeout(() => applyWindowedBounds(mainWindow), 50)
  })

  mainWindow.on('closed', () => {
    if (mainWindowStateTimer) {
      clearTimeout(mainWindowStateTimer)
      mainWindowStateTimer = null
    }
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register window control IPC handlers
  registerWindowIpcHandlers()

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
