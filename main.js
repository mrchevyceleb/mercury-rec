const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

// --- Settings persistence ---
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

function getFfmpegPath() {
  const ffmpegStatic = require('ffmpeg-static');
  if (app.isPackaged) {
    const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) return unpacked;
    const resourcePath = path.join(
      process.resourcesPath,
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
    if (fs.existsSync(resourcePath)) return resourcePath;
  }
  return ffmpegStatic;
}

// Prevent Chromium's GPU compositor from breaking window transparency on
// Windows 11. Only needed on Windows; on Mac it can cause rendering issues.
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

let mainWindow;

function createWindow() {
  const isWin = process.platform === 'win32';

  const windowOptions = {
    width: 380,
    height: 560,
    show: false,
    resizable: false,
    maximizable: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // Windows-only options that can crash on other platforms
  if (isWin) {
    windowOptions.thickFrame = false;
    windowOptions.backgroundMaterial = 'none';
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    // Force Windows 11 DWM to recompute the window region without OS chrome.
    if (isWin) {
      const bounds = mainWindow.getBounds();
      mainWindow.setBounds({ ...bounds, width: bounds.width + 1 });
      mainWindow.setBounds(bounds);
    }
    mainWindow.show();
  });
}

ipcMain.handle('convert-to-mp3', async (_event, arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const timestamp = Date.now();
  const inputPath = path.join(os.tmpdir(), `recording-${timestamp}.webm`);
  const outputPath = path.join(os.tmpdir(), `recording-${timestamp}.mp3`);

  fs.writeFileSync(inputPath, buffer);

  const ffmpegPath = getFfmpegPath();

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-codec:a', 'libmp3lame',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      outputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      try {
        if (code === 0) {
          const mp3Buffer = fs.readFileSync(outputPath);
          resolve(mp3Buffer);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
        }
      } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      }
    });

    proc.on('error', (err) => {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      reject(err);
    });
  });
});

ipcMain.handle('save-file', async (_event, arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const defaultName = `recording-${timestamp}.mp3`;
  const settings = loadSettings();

  // Auto-save if a default folder is configured
  if (settings.defaultSaveFolder) {
    try {
      const filePath = path.join(settings.defaultSaveFolder, defaultName);
      fs.writeFileSync(filePath, buffer);
      return { success: true, filePath };
    } catch (err) {
      // Folder may have been deleted; fall through to dialog
    }
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('music'), defaultName),
    filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }],
  });

  if (canceled || !filePath) {
    return { cancelled: true };
  }

  fs.writeFileSync(filePath, buffer);
  return { success: true, filePath };
});

ipcMain.handle('get-platform', () => process.platform);

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.handle('save-settings', (_event, settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('choose-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose default save folder',
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-close', () => mainWindow.close());

  createWindow();

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    // Silently ignore update errors (e.g. unsigned Mac builds)
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
