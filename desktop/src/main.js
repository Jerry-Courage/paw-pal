const { app, BrowserWindow, shell, ipcMain, Notification, session, Menu, Tray, nativeImage, dialog, systemPreferences } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const LIVE_URL = 'https://paw-pal-frontend-c7x0.onrender.com'
const DEV_URL = 'http://localhost:3000'
const isDev = process.argv.includes('--dev')
const APP_URL = isDev ? DEV_URL : LIVE_URL

let mainWindow = null
let tray = null

// ─── SINGLE INSTANCE LOCK ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ─── PERMISSIONS ─────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-features', 'WebRTC')

function setupPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'notifications',
      'media',           // microphone + camera
      'mediaKeySystem',
      'geolocation',
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'pointerLock',
    ]
    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      console.log(`[Permissions] Denied: ${permission}`)
      callback(false)
    }
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true
  })
}

// ─── MAIN WINDOW ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'FlowState',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0f172a',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Allow microphone, camera, notifications from the web app
      allowRunningInsecureContent: false,
    },
  })

  // Load the live app
  mainWindow.loadURL(APP_URL)

  // Show window once ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) mainWindow.webContents.openDevTools()
  })

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // Handle page title changes
  mainWindow.webContents.on('page-title-updated', (e, title) => {
    mainWindow.setTitle(title || 'FlowState')
  })
}

// ─── TRAY ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open FlowState', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.setToolTip('FlowState')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus() })
}

// ─── APP MENU ─────────────────────────────────────────────────────────────────
function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'FlowState',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/ai'`) },
        { label: 'Library', accelerator: 'CmdOrCtrl+L', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/library'`) },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/dashboard'`) },
        { label: 'AI Chat', accelerator: 'CmdOrCtrl+2', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/ai'`) },
        { label: 'Library', accelerator: 'CmdOrCtrl+3', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/library'`) },
        { label: 'Planner', accelerator: 'CmdOrCtrl+4', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/planner'`) },
        { label: 'Study Groups', accelerator: 'CmdOrCtrl+5', click: () => mainWindow?.webContents.executeJavaScript(`window.location.href='/groups'`) },
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdatesAndNotify() },
        { type: 'separator' },
        { label: 'Report a Bug', click: () => shell.openExternal('https://github.com/Jerry-Courage/paw-pal/issues') },
      ]
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── IPC HANDLERS ─────────────────────────────────────────────────────────────
function setupIPC() {
  // Native desktop notifications
  ipcMain.handle('show-notification', (event, { title, body, icon }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: icon || path.join(__dirname, '../assets/icon.png') }).show()
    }
  })

  // Check microphone permission (macOS)
  ipcMain.handle('check-mic-permission', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status !== 'granted') {
        return await systemPreferences.askForMediaAccess('microphone')
      }
      return true
    }
    return true
  })

  // Check camera permission (macOS)
  ipcMain.handle('check-camera-permission', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('camera')
      if (status !== 'granted') {
        return await systemPreferences.askForMediaAccess('camera')
      }
      return true
    }
    return true
  })

  // Open file dialog
  ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options?.filters || [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'pptx'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result
  })

  // App version
  ipcMain.handle('get-app-version', () => app.getVersion())
}

// ─── AUTO UPDATER ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `FlowState ${info.version} is available. Download now?`,
      buttons: ['Download', 'Later'],
    }).then(result => {
      if (result.response === 0) autoUpdater.downloadUpdate()
    })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart FlowState to apply it.',
      buttons: ['Restart Now', 'Later'],
    }).then(result => {
      if (result.response === 0) autoUpdater.quitAndInstall()
    })
  })
}

// ─── APP LIFECYCLE ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  setupPermissions()
  setupIPC()
  createWindow()
  createTray()
  createMenu()

  if (!isDev) {
    setupAutoUpdater()
    autoUpdater.checkForUpdatesAndNotify()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Prevent navigation away from the app URL
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('http://localhost') && !url.startsWith('https://flowstate')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
})
