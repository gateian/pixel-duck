const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  findVersionFolders: (path) => ipcRenderer.invoke('find-version-folders', path),
});
