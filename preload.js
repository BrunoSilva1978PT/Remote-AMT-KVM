const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    captureScreen: (rect) => ipcRenderer.invoke('capture-screen', rect)
});
