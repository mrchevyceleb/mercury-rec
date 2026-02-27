const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

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

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
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

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    });
  });

  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-close', () => mainWindow.close());

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
