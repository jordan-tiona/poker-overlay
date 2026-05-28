import { app, BrowserWindow, ipcMain, desktopCapturer, screen as electronScreen, globalShortcut } from 'electron'
import { join } from 'path'

let overlayWindow: BrowserWindow | null = null
let isClickThrough = true

function createOverlayWindow(): void {
  const { width, height } = electronScreen.getPrimaryDisplay().workAreaSize

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,       // start non-focusable (click-through mode)
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Make the window click-through by default; toggle on hotkey
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.NODE_ENV === 'development') {
    overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Toggle mouse interaction via Ctrl+Shift+P
function registerHotkeys(): void {
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (!overlayWindow) return
    isClickThrough = !isClickThrough
    overlayWindow.setIgnoreMouseEvents(isClickThrough, { forward: true })
    overlayWindow.setFocusable(!isClickThrough)
    if (!isClickThrough) overlayWindow.focus()
    overlayWindow.webContents.send('click-through-changed', isClickThrough)
  })

  // Open/close DevTools
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    overlayWindow?.webContents.openDevTools({ mode: 'detach' })
  })

  // Quit
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    app.quit()
  })
}

// IPC: renderer tells us when mouse enters/leaves interactive panel area.
// We also toggle focusability so that <select> dropdowns and inputs work
// when the mouse is over the panel, without stealing focus from the game
// window the rest of the time.
ipcMain.on('set-ignore-mouse-events', (_event, ignore: boolean) => {
  if (!overlayWindow) return
  overlayWindow.setIgnoreMouseEvents(ignore, { forward: true })
  overlayWindow.setFocusable(!ignore)
  if (!ignore) overlayWindow.focus()
})

// Returns true if a thumbnail has actual pixel content (not a black frame).
// GPU-accelerated windows (Ignition uses DirectX) return black thumbnails
// via window capture — screen capture must be used instead.
function hasContent(source: Electron.DesktopCapturerSource): boolean {
  const { width, height } = source.thumbnail.getSize()
  if (width < 200 || height < 200) return false
  const bmp = source.thumbnail.toBitmap()
  // Sample centre pixel — black frame = all zeros
  const idx = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
  return bmp[idx] + bmp[idx + 1] + bmp[idx + 2] > 10
}

ipcMain.handle('capture-ignition', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  })

  // Identify the game table window (even if its thumbnail is black)
  const gameWindow = sources.find(s =>
    /hold.?em|\$[\d.]+\/\$[\d.]+/i.test(s.name)
  )

  // Try window capture first — works if GPU compositing is accessible
  if (gameWindow && hasContent(gameWindow)) {
    console.log(`[capture] window (GPU ok): "${gameWindow.name}"`)
    return { dataUrl: gameWindow.thumbnail.toDataURL() }
  }

  if (gameWindow) {
    console.log(`[capture] window "${gameWindow.name}" is black (GPU barrier) — using screen`)
  } else {
    console.log('[capture] game window not found — using screen')
  }

  // Fall back to screen capture — always bypasses GPU compositing.
  // Prefer the screen that the overlay is NOT on: the overlay and game
  // are typically on different monitors, and we know the overlay's display.
  const overlayBounds = overlayWindow?.getBounds() ?? { x: 0, y: 0 }
  const overlayDisplay = electronScreen.getDisplayNearestPoint(overlayBounds)

  const screenCandidates = sources
    .filter(s => s.id.startsWith('screen:') && hasContent(s))
    .map(s => {
      // Match screen source index to display order so we can deprioritise
      // the overlay's screen. Source IDs are "screen:N:0" where N is index.
      const idx = parseInt(s.id.split(':')[1])
      const displays = electronScreen.getAllDisplays()
      const display = displays[idx]
      const isOverlayScreen = display?.id === overlayDisplay.id
      const { width, height } = s.thumbnail.getSize()
      const bmp = s.thumbnail.toBitmap()
      const ci = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
      const brightness = bmp[ci] + bmp[ci + 1] + bmp[ci + 2]
      return { s, brightness, isOverlayScreen }
    })
    // Game screen first; break ties by darkest (poker table is very dark)
    .sort((a, b) => Number(a.isOverlayScreen) - Number(b.isOverlayScreen) || a.brightness - b.brightness)

  for (const { s, brightness, isOverlayScreen } of screenCandidates) {
    console.log(`[capture] screen "${s.name}" brightness=${brightness} overlayScreen=${isOverlayScreen}`)
    return { dataUrl: s.thumbnail.toDataURL() }
  }

  return { error: 'No usable capture source', sources: sources.map(s => s.name) }
})

app.whenReady().then(() => {
  createOverlayWindow()
  registerHotkeys()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow()
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})
