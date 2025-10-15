const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

const trackerModulePath = path.join(__dirname, '..', 'dist', 'trackerService.js');
const configModulePath = path.join(__dirname, '..', 'dist', 'config.js');

ipcMain.handle('run-scan', async (_event, options = {}) => {
  delete require.cache[trackerModulePath];
  const service = require(trackerModulePath);
  const result = await service.runTracker(options);
  return result;
});

ipcMain.handle('open-link', (_event, url) => shell.openExternal(url));

ipcMain.handle('open-scans', async () => {
  delete require.cache[configModulePath];
  const { loadConfig } = require(configModulePath);
  const config = await loadConfig();
  await shell.openPath(config.scanLogDir);
});