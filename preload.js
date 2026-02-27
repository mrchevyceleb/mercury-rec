const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('audioRecorder', {
  convertToMp3: (arrayBuffer) => ipcRenderer.invoke('convert-to-mp3', arrayBuffer),
  saveFile: (arrayBuffer) => ipcRenderer.invoke('save-file', arrayBuffer)
});
