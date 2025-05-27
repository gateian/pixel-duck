const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  findVersionFolders: (path) => ipcRenderer.invoke('find-version-folders', path),
  processSequence: (folderPath) => ipcRenderer.invoke('process-sequence', folderPath),
});
