import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  registerWindowIpcHandlers,
  sendWindowState,
  getWindowedBounds,
  applyWindowedBounds
} from './ipc/windowIpc'
import { registerMusicIpcHandlers } from './ipc/musicIpc'

// Register custom mineradio scheme as privileged
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mineradio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
let mainWindowStateTimer: NodeJS.Timeout | null = null

function scheduleWindowStateSend(win: BrowserWindow, delay = 80): void {
  if (!win || win.isDestroyed()) return
  if (mainWindowStateTimer) clearTimeout(mainWindowStateTimer)
  mainWindowStateTimer = setTimeout(() => {
    mainWindowStateTimer = null
    sendWindowState(win)
  }, delay)
}

function registerCustomProtocol(): void {
  protocol.handle('mineradio', async (request) => {
    try {
      const urlObj = new URL(request.url)
      const pathname = urlObj.pathname
      const targetUrl = urlObj.searchParams.get('url')

      if (!targetUrl) {
        return new Response('Missing target url', { status: 400 })
      }

      const isQQ = targetUrl.includes('qq.com') || targetUrl.includes('qpic.cn')
      const referer = isQQ ? 'https://y.qq.com/' : 'https://music.163.com/'

      if (pathname === '/cover') {
        const response = await net.fetch(targetUrl, {
          headers: {
            'User-Agent': UA,
            Referer: referer
          }
        })
        return response
      }

      if (pathname === '/audio') {
        const headers: Record<string, string> = {
          'User-Agent': UA,
          Referer: referer
        }
        const range = request.headers.get('range')
        if (range) {
          headers['Range'] = range
        }
        const response = await net.fetch(targetUrl, { headers })
        return response
      }

      return new Response('Not found', { status: 404 })
    } catch (err: any) {
      console.error('[Protocol Handler Error]', err)
      return new Response(err.message, { status: 500 })
    }
  })
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

  // Register music API IPC handlers
  registerMusicIpcHandlers()

  // Register custom mineradio:// protocol
  registerCustomProtocol()

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
