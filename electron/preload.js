const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  getLastPath: () => ipcRenderer.invoke('get-last-path'),
  openFolderInExplorer: (folderPath) => ipcRenderer.invoke('open-folder-in-explorer', folderPath),
  findVersionFolders: (path) => ipcRenderer.invoke('find-version-folders', path),
  processSequences: (folderPaths, options) =>
    ipcRenderer.send('process-sequences', folderPaths, options),
  getVersionSettings: (folderPath) => ipcRenderer.invoke('get-version-settings', folderPath),
  saveVersionSettings: (folderPaths, settings) =>
    ipcRenderer.invoke('save-version-settings', folderPaths, settings),
  listAudioFiles: (folderPath) => ipcRenderer.invoke('list-audio-files', folderPath),
  cancelProcessing: () => ipcRenderer.send('cancel-processing'),
  onProcessingUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('processing-update', listener);
    return () => {
      ipcRenderer.removeListener('processing-update', listener);
    };
  },
});
