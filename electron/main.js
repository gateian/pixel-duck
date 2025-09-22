const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const Store = require('electron-store');

const store = new Store();
const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;
let childProcess = null;
let isCancelled = false;

// Image sequence detection config
const IMAGE_SEQUENCE_REGEX = /^(.+)\.(\d{4,})\.(png|jpe?g)$/i; // <name>.<0000+>.<ext>

const execFileCancellable = (command, args) => {
  return new Promise((resolve, reject) => {
    if (isCancelled) {
      return reject(new Error('Cancelled'));
    }
    // execFile does not use a shell, so we can kill the process directly
    childProcess = execFile(command, args, (error, stdout, stderr) => {
      childProcess = null;
      if (error) {
        console.log(`Exec error: code=${error.code}, signal=${error.signal}`);
        if (isCancelled) {
          reject(new Error('Cancelled'));
        } else {
          error.stderr = stderr;
          reject(error);
        }
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

// Recursively search for a single image sequence inside a directory tree.
// A valid sequence has files matching <base>.<xxxx>.<ext> (xxxx >= 4 digits),
// contains frame 0000, and has at least 20 frames in total.
// Returns null if none found.
async function findImageSequenceRecursive(rootDir) {
  async function scanDir(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    // First, try to detect a sequence in this directory
    const files = entries.filter((e) => !e.isDirectory()).map((e) => e.name);
    const groups = new Map(); // key: base|ext|digits -> { indices:Set<number>, base, ext, digits }

    for (const fileName of files) {
      const match = fileName.match(IMAGE_SEQUENCE_REGEX);
      if (!match) continue;
      const base = match[1];
      const numberStr = match[2];
      const ext = match[3].toLowerCase();
      const digits = numberStr.length;
      const index = parseInt(numberStr, 10);
      const key = `${base}|${ext}|${digits}`;
      if (!groups.has(key)) {
        groups.set(key, { indices: new Set(), base, ext, digits });
      }
      groups.get(key).indices.add(index);
    }

    for (const group of groups.values()) {
      if (group.indices.has(0) && group.indices.size >= 20) {
        return {
          directory: currentDir,
          baseName: group.base,
          ext: group.ext,
          digits: group.digits,
          startNumber: 0,
          frameCount: group.indices.size,
        };
      }
    }

    // Otherwise, recurse into subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subPath = path.join(currentDir, entry.name);
      const found = await scanDir(subPath);
      if (found) return found;
    }

    return null;
  }

  try {
    return await scanDir(rootDir);
  } catch (err) {
    console.error(`Error while scanning for image sequence in ${rootDir}:`, err);
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

// Read per-version settings; returns defaults when not present
ipcMain.handle('get-version-settings', async (_event, folderPath) => {
  const defaults = { panoramic: false };
  try {
    const settingsPath = path.join(folderPath, 'pixelduck-settings.json');
    const content = await fs.readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(content);
    return { ...defaults, ...parsed };
  } catch (e) {
    return defaults;
  }
});

// Save per-version settings (only create file when something changes from defaults)
// File: pixelduck-settings.json
ipcMain.handle('save-version-settings', async (_event, folderPaths, settings) => {
  const defaults = { panoramic: false };
  const normalized = { panoramic: !!settings?.panoramic };
  const fileName = 'pixelduck-settings.json';

  await Promise.all(
    folderPaths.map(async (folderPath) => {
      try {
        // Read existing if present
        const settingsPath = path.join(folderPath, fileName);
        let existing = null;
        try {
          const content = await fs.readFile(settingsPath, 'utf-8');
          existing = JSON.parse(content);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.warn(`Could not read settings for ${folderPath}:`, err.message);
          }
        }

        const newSettings = { ...(existing || {}), ...normalized };

        // If settings equal defaults and no file existed, skip creating.
        const equalsDefaults = JSON.stringify(newSettings) === JSON.stringify(defaults);
        if (!existing && equalsDefaults) {
          return; // do not create file for defaults
        }

        // If file exists and contents are unchanged, skip writing
        if (existing && JSON.stringify(existing) === JSON.stringify(newSettings)) {
          return;
        }

        await fs.writeFile(settingsPath, JSON.stringify(newSettings, null, 2), 'utf-8');
      } catch (e) {
        console.error(`Failed saving settings in ${folderPath}:`, e.message);
        // Swallow errors to avoid breaking UI flow
      }
    }),
  );
});

// Handle folder selection
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    console.log('Folder selection cancelled or no path selected');
    return '';
  }
  const folderPath = result.filePaths[0];
  store.set('last-path', folderPath);
  return folderPath;
});

ipcMain.handle('get-last-path', () => {
  return store.get('last-path');
});

ipcMain.handle('open-folder-in-explorer', (event, folderPath) => {
  shell.openPath(folderPath);
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
            let hasVideo = false;
            const videoFilePath = path.join(fullPath, 'all_shots_combined.mp4');
            try {
              await fs.stat(videoFilePath);
              hasVideo = true;
              console.log(
                `Video check: Found '${videoFilePath}'. Setting hasVideo = true for ${fullPath}.`,
              );
            } catch (error) {
              if (error.code === 'ENOENT') {
                console.log(
                  `Video check: '${videoFilePath}' not found. Setting hasVideo = false for ${fullPath}.`,
                );
              } else {
                console.error(
                  `Video check: Error fs.stat('${videoFilePath}') for ${fullPath}:`,
                  error.message,
                );
              }
              // hasVideo remains false
            }

            let shotCount = 0;
            let frameCount = 0;
            let panoramic = false;
            try {
              const sequence = await findImageSequenceRecursive(fullPath);
              if (sequence) {
                shotCount = 1;
                frameCount = sequence.frameCount;
              }
              // Load settings to expose panoramic flag in listing
              try {
                const settingsPath = path.join(fullPath, 'pixelduck-settings.json');
                const content = await fs.readFile(settingsPath, 'utf-8');
                const parsed = JSON.parse(content);
                panoramic = !!parsed?.panoramic;
              } catch (e) {
                // ignore
              }
            } catch (e) {
              console.error(`Error analyzing folder contents for ${fullPath}:`, e);
            }

            versionFolders.push({
              path: fullPath,
              version: entry.name,
              hasVideo: hasVideo,
              shotCount,
              frameCount,
              panoramic,
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

ipcMain.on('cancel-processing', () => {
  console.log('Received cancellation request.');
  isCancelled = true;
  if (childProcess) {
    // SIGKILL is a more forceful way to terminate, ensuring it stops immediately.
    childProcess.kill('SIGKILL');
    console.log('Sent SIGKILL to child process.');
  }
});

// Handle processing image sequence to video
ipcMain.on('process-sequences', async (event, versionFolderPaths, options = {}) => {
  console.log(`Received request to process ${versionFolderPaths.length} sequences.`);
  isCancelled = false; // Reset cancellation flag on new job
  const totalFolders = versionFolderPaths.length;
  mainWindow.webContents.send('processing-update', { type: 'start', total: totalFolders });

  let completedFolders = 0;

  for (const versionFolderPath of versionFolderPaths) {
    if (isCancelled) break;
    const version = path.basename(versionFolderPath);
    mainWindow.webContents.send('processing-update', {
      type: 'progress',
      completed: completedFolders,
      total: totalFolders,
      currentFolder: version,
    });

    try {
      console.log(`Processing image sequences in version folder: ${versionFolderPath}`);
      // Find the single sequence anywhere inside the version folder
      const sequence = await findImageSequenceRecursive(versionFolderPath);
      if (!sequence) {
        console.log('No valid image sequence found (needs 0000 and at least 20 frames).');
        mainWindow.webContents.send('processing-update', {
          type: 'error',
          message: `No valid image sequence found in ${version}`,
        });
        completedFolders++;
        continue;
      }

      const filePattern = `${sequence.baseName}.%0${sequence.digits}d.${sequence.ext}`;
      const inputPatternFullPath = path.join(sequence.directory, filePattern);
      const combinedOutput = path.join(versionFolderPath, 'all_shots_combined.mp4');

      try {
        if (
          await fs
            .stat(combinedOutput)
            .then(() => true)
            .catch(() => false)
        ) {
          await fs.unlink(combinedOutput);
          console.log(`Deleted existing ${combinedOutput}`);
        }
      } catch (e) {
        console.warn(`Could not delete existing file ${combinedOutput}: ${e.message}`);
      }

      // Load per-folder settings (if any) and merge with incoming options
      let panoramic = false;
      try {
        const settingsPath = path.join(versionFolderPath, 'pixelduck-settings.json');
        const content = await fs.readFile(settingsPath, 'utf-8');
        const parsed = JSON.parse(content);
        panoramic = !!parsed?.panoramic;
      } catch (e) {
        // ignore missing file or parse errors; fall back to options
      }
      if (options && typeof options.panoramic === 'boolean') {
        panoramic = !!options.panoramic;
      }

      // High-quality encoding defaults
      const qualityArgs = [
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-preset',
        'slow',
        '-pix_fmt',
        'yuv420p',
      ];

      // VR equirectangular metadata and parameters for flat 360 video
      // We set spherical video metadata so headsets recognize it as 360.
      const vrMetadataArgs = panoramic
        ? [
            '-vf',
            // Ensure no resizing by default; if input is already equirect, we just pass through.
            // Users can resize upstream if needed. Keeping original width/height preserves quality.
            'scale=iw:ih',
            '-metadata',
            'spherical-video=true',
            '-metadata',
            'stereo=mono',
            '-metadata',
            'projection=equirectangular',
            '-movflags',
            '+faststart',
          ]
        : ['-movflags', '+faststart'];

      const ffmpegArgs = [
        '-framerate',
        '24',
        '-start_number',
        sequence.startNumber.toString(),
        '-i',
        inputPatternFullPath,
        ...qualityArgs,
        ...vrMetadataArgs,
        combinedOutput,
      ];

      try {
        console.log(`Running command: ffmpeg ${ffmpegArgs.join(' ')}`);
        await execFileCancellable('ffmpeg', ffmpegArgs);
        console.log(`Created ${combinedOutput}`);
      } catch (error) {
        if (isCancelled) {
          console.log('Video creation was cancelled.');
          break; // Break from the main folder loop
        }
        console.error('Error creating video:', error.message, error.stderr?.toString());
        mainWindow.webContents.send('processing-update', {
          type: 'error',
          message: `Error creating video for ${version}: ${error.message}`,
        });
      }
    } catch (error) {
      if (!isCancelled) {
        console.error('Error in process-sequence handler for folder:', versionFolderPath, error);
        mainWindow.webContents.send('processing-update', {
          type: 'error',
          message: `An error occurred while processing ${version}: ${error.message}`,
        });
      }
    }
    completedFolders++;
  }

  if (isCancelled) {
    console.log('Processing was cancelled by the user.');
  }

  mainWindow.webContents.send('processing-update', { type: 'end' });
  console.log('All processing finished or was cancelled.');
});
