const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  findVersionFolders: (path) => ipcRenderer.invoke('find-version-folders', path),
  processSequences: (folderPaths) => ipcRenderer.send('process-sequences', folderPaths),
  cancelProcessing: () => ipcRenderer.send('cancel-processing'),
  onProcessingUpdate: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('processing-update', listener);
    return () => {
      ipcRenderer.removeListener('processing-update', listener);
    };
  },
});
