import { ipcMain, BrowserWindow, screen } from 'electron'

let htmlFullscreenActive = false
let windowFullscreenActive = false

const MIN_WINDOWED_WIDTH = 960
const MIN_WINDOWED_HEIGHT = 540
const WINDOWED_SCALE = 3 / 4
const WINDOWED_ASPECT = 16 / 9
const WINDOWED_MARGIN = 32

export interface WindowState {
  isMaximized: boolean
  isNativeFullScreen: boolean
  isHtmlFullScreen: boolean
  isWindowFullScreen: boolean
  isFullScreen: boolean
  isMinimized: boolean
  isVisible: boolean
  isFocused: boolean
  displayId: number
  primaryDisplayId: number
  isPrimaryDisplay: boolean
  hasDisplayOnLeft: boolean
  hasDisplayOnRight: boolean
  displayBounds: {
    x: number
    y: number
    width: number
    height: number
  } | null
}

function rectsOverlapOnY(a: any, b: any): boolean {
  if (!a || !b) return false
  const aTop = Number(a.y) || 0
  const bTop = Number(b.y) || 0
  const aBottom = aTop + (Number(a.height) || 0)
  const bBottom = bTop + (Number(b.height) || 0)
  return aBottom > bTop && bBottom > aTop
}

function getDisplayState(win: BrowserWindow) {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : primary
  const bounds = display && display.bounds ? display.bounds : primary.bounds
  const displayId = display && display.id
  const primaryId = primary && primary.id
  const edgeTolerance = 2

  const hasDisplayOnLeft = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((candidate.bounds.x + candidate.bounds.width) - bounds.x) <= edgeTolerance
  })

  const hasDisplayOnRight = displays.some((candidate) => {
    if (!candidate || candidate.id === displayId || !candidate.bounds) return false
    return rectsOverlapOnY(bounds, candidate.bounds)
      && Math.abs((bounds.x + bounds.width) - candidate.bounds.x) <= edgeTolerance
  })

  return {
    displayId,
    primaryDisplayId: primaryId,
    isPrimaryDisplay: !!(display && primary && display.id === primary.id),
    hasDisplayOnLeft,
    hasDisplayOnRight,
    displayBounds: bounds ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    } : null,
  }
}

export function getWindowState(win: BrowserWindow): WindowState {
  if (!win || win.isDestroyed()) {
    return {
      isMaximized: false,
      isNativeFullScreen: false,
      isHtmlFullScreen: false,
      isWindowFullScreen: false,
      isFullScreen: false,
      isMinimized: false,
      isVisible: false,
      isFocused: false,
      isPrimaryDisplay: true,
      displayId: 0,
      primaryDisplayId: 0,
      hasDisplayOnLeft: false,
      hasDisplayOnRight: false,
      displayBounds: null,
    }
  }
  return {
    isMaximized: win.isMaximized(),
    isNativeFullScreen: win.isFullScreen(),
    isHtmlFullScreen: htmlFullscreenActive,
    isWindowFullScreen: windowFullscreenActive,
    isFullScreen: win.isFullScreen() || htmlFullscreenActive || windowFullscreenActive,
    isMinimized: win.isMinimized(),
    isVisible: win.isVisible(),
    isFocused: win.isFocused(),
    ...getDisplayState(win),
  }
}

export function getWindowedBounds(win?: BrowserWindow): { x: number; y: number; width: number; height: number } {
  const display = win && !win.isDestroyed()
    ? screen.getDisplayMatching(win.getBounds())
    : screen.getPrimaryDisplay()
  const area = display.workArea
  const basis = display.bounds || area
  const maxWidth = Math.max(640, area.width - WINDOWED_MARGIN)
  const maxHeight = Math.max(360, area.height - WINDOWED_MARGIN)

  let width = Math.round(basis.width * WINDOWED_SCALE)
  let height = Math.round(width / WINDOWED_ASPECT)
  const scaledHeight = Math.round(basis.height * WINDOWED_SCALE)

  if (height > scaledHeight) {
    height = scaledHeight
    width = Math.round(height * WINDOWED_ASPECT)
  }

  if (width < MIN_WINDOWED_WIDTH && maxWidth >= MIN_WINDOWED_WIDTH && maxHeight >= MIN_WINDOWED_HEIGHT) {
    width = MIN_WINDOWED_WIDTH
    height = MIN_WINDOWED_HEIGHT
  }

  if (width > maxWidth) {
    width = maxWidth
    height = Math.round(width / WINDOWED_ASPECT)
  }
  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(height * WINDOWED_ASPECT)
  }

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  }
}

export function applyWindowedBounds(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  if (win.isMaximized()) win.unmaximize()
  win.setMinimumSize(MIN_WINDOWED_WIDTH, MIN_WINDOWED_HEIGHT)
  win.setBounds(getWindowedBounds(win), false)
  sendWindowState(win)
}

export function exitFullscreenToWindow(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  windowFullscreenActive = false

  if (!win.isFullScreen()) {
    applyWindowedBounds(win)
    return
  }

  let applied = false
  const applyOnce = (): void => {
    if (applied || !win || win.isDestroyed() || win.isFullScreen()) return
    applied = true
    applyWindowedBounds(win)
  }

  win.once('leave-full-screen', () => setTimeout(applyOnce, 50))
  win.setFullScreen(false)
  setTimeout(applyOnce, 500)
}

export function toggleFullscreen(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  if (win.isFullScreen() || windowFullscreenActive) {
    exitFullscreenToWindow(win)
    return
  }
  windowFullscreenActive = true
  win.setFullScreen(true)
  sendWindowState(win)
}

export function sendWindowState(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('desktop-window-state', getWindowState(win))
}

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const sender = event.sender
  return BrowserWindow.fromWebContents(sender)
}

export function registerWindowIpcHandlers(): void {
  ipcMain.handle('desktop-window-minimize', (event) => {
    getSenderWindow(event)?.minimize()
  })

  ipcMain.handle('desktop-window-toggle-maximize', (event) => {
    const win = getSenderWindow(event)
    if (win) toggleFullscreen(win)
  })

  ipcMain.handle('desktop-window-toggle-fullscreen', (event) => {
    const win = getSenderWindow(event)
    if (win) toggleFullscreen(win)
  })

  ipcMain.handle('desktop-window-exit-fullscreen-windowed', (event) => {
    const win = getSenderWindow(event)
    if (win) exitFullscreenToWindow(win)
  })

  ipcMain.handle('desktop-window-get-state', (event) => {
    const win = getSenderWindow(event)
    return win ? getWindowState(win) : null
  })

  ipcMain.handle('desktop-window-close', (event) => {
    getSenderWindow(event)?.close()
  })
}
