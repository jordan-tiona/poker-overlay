import { app, BrowserWindow, ipcMain, desktopCapturer, screen, globalShortcut } from 'electron'
import { join } from 'path'

let overlayWindow: BrowserWindow | null = null
let isClickThrough = true

function createOverlayWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

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

// IPC: capture the Ignition window and return a data URL for OCR.
// On Linux/VirtualBox, window thumbnails are often 1×1; fall back to a
// full-screen capture in that case (requires Ignition to be maximised).
ipcMain.handle('capture-ignition', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  })

  // Try the Ignition window first; accept it only if the thumbnail is real
  const ignitionWindow = sources.find(s =>
    /ignition|poker|hold.?em/i.test(s.name)
  )

  console.log('[capture] sources:', sources.map(s => `${s.id.slice(0,10)} "${s.name}" ${s.thumbnail.getSize().width}x${s.thumbnail.getSize().height}`).join(' | '))

  if (ignitionWindow) {
    const { width, height } = ignitionWindow.thumbnail.getSize()
    console.log(`[capture] Using window "${ignitionWindow.name}" ${width}x${height}`)
    if (width > 200 && height > 200) {
      return { dataUrl: ignitionWindow.thumbnail.toDataURL() }
    }
    console.log('[capture] Window thumbnail too small — falling back to screen')
  } else {
    console.log('[capture] Ignition window not found — falling back to screen')
  }

  // Fall back to primary screen (index 0)
  const screenSource = sources.find(s => s.id.startsWith('screen:'))
  if (screenSource) {
    const { width, height } = screenSource.thumbnail.getSize()
    console.log(`[capture] Screen capture: ${width}x${height}`)
    return { dataUrl: screenSource.thumbnail.toDataURL() }
  }

  return { error: 'No capture source found', sources: sources.map(s => s.name) }
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
