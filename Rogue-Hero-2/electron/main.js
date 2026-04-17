const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    // Start maximized; will go fullscreen on F11 or via menu
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    show: false, // don't flash while loading
    backgroundColor: '#0a0a12',
    title: 'Rogue Hero',
    autoHideMenuBar: true, // hide the menu bar (press Alt to reveal)
    webPreferences: {
      // ES Modules work fine when loaded via file:// inside Electron
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load the game
  mainWindow.loadFile('index.html');

  // Show window once fully loaded to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Start in fullscreen for a proper game feel
    mainWindow.setFullScreen(true);
  });

  // Open external links in the OS browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- App lifecycle ---

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps stay active until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});

// Handle second-instance (bring existing window to front)
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
