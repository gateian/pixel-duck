const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the Vite dev server URL in development
  if (isDev) {
    // Wait for dev server to start
    const loadURL = async () => {
      try {
        await mainWindow.loadURL('http://localhost:5173');
      } catch (e) {
        console.log('Retrying connection to dev server...');
        setTimeout(loadURL, 1000);
      }
    };
    loadURL();

    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.filePaths[0];
});

ipcMain.handle('find-version-folders', async (event, directoryPath) => {
  try {
    // Recursive function to search directories
    async function searchDirectories(dir) {
      const versionFolders = [];
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);

          // If this directory matches our pattern, add it and don't search deeper
          if (/^v\d+$/.test(entry.name)) {
            versionFolders.push({
              path: fullPath,
              version: entry.name,
            });
          } else {
            // If it's not a version folder, search inside it
            const subFolders = await searchDirectories(fullPath);
            versionFolders.push(...subFolders);
          }
        }
      }

      return versionFolders;
    }

    // Start the recursive search
    const allVersionFolders = await searchDirectories(directoryPath);

    // Sort by version number (ascending)
    allVersionFolders.sort((a, b) => {
      const versionA = parseInt(a.version.slice(1));
      const versionB = parseInt(b.version.slice(1));
      return versionA - versionB;
    });

    console.log('Found folders:', allVersionFolders); // Debug log
    return allVersionFolders;
  } catch (error) {
    console.error('Error scanning directory:', error);
    throw error;
  }
});
