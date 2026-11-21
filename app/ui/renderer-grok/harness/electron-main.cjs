// Stub-mount host for the 0.18 renderer build in our Electron (P5-50). Not the product main:
// the S0 stub (window.desktop flat bridge + coordinator v1 fake) is injected as a non-isolated
// preload, the same role CDP addScriptToEvaluateOnNewDocument played in S0.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'stub-init.cjs'),
      contextIsolation: false, // stub must define window.desktop / window.coordinatorPort in the page world
      sandbox: false,
      nodeIntegration: false,
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })) // zero popups
  win.webContents.on('will-prevent-unload', (e) => e.preventDefault()) // stub blocks beforeunload; let close proceed
  win.loadFile(path.join(__dirname, '..', '.build', 'frontend-shell', 'index.html'), {
    query: { theme: process.env.GROK_THEME === 'dark' ? 'dark' : 'light' },
  })
})
app.on('window-all-closed', () => app.quit())
