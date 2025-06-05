const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');

const isDev = process.env.NODE_ENV !== 'production';

let mainWindow;
let childProcess = null;
let isCancelled = false;

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

// Handle folder selection
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    console.log('Folder selection cancelled or no path selected');
    return '';
  }
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
            versionFolders.push({
              path: fullPath,
              version: entry.name,
              hasVideo: hasVideo,
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
ipcMain.on('process-sequences', async (event, versionFolderPaths) => {
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

      const shotDirs = (await fs.readdir(versionFolderPath, { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

      console.log(`Found ${shotDirs.length} potential shot directories in ${versionFolderPath}`);

      const videoFiles = [];

      for (const shotDirName of shotDirs) {
        if (isCancelled) break;
        const shotFolderPath = path.join(versionFolderPath, shotDirName);
        console.log(`Processing shot folder: ${shotFolderPath}`);

        const files = (await fs.readdir(shotFolderPath))
          .filter((file) => file.toLowerCase().endsWith('.png'))
          .sort();

        if (files.length === 0) {
          console.log(`No PNG files found in ${shotDirName}`);
          continue;
        }

        console.log(`Found ${files.length} PNG files in ${shotDirName}`);

        const firstFile = files[0];
        let match = firstFile.match(/(\d{4})(?=\.png$)/i);
        if (!match) {
          const fallbackMatch = firstFile.match(/(\d+)(?=\.png$)/i);
          if (!fallbackMatch) {
            console.log(
              `Could not determine start number for ${shotDirName} from file ${firstFile}`,
            );
            continue;
          }
          console.log(`Using fallback regex for start number in ${shotDirName}`);
          match = fallbackMatch;
        }

        const startNumberStr = match[1];
        const startNumber = parseInt(startNumberStr);

        const filePattern =
          firstFile.substring(0, match.index) +
          '%04d' +
          firstFile.substring(match.index + startNumberStr.length);
        const outputFile = `${shotDirName}_preview.mp4`;
        const outputPath = path.join(shotFolderPath, outputFile);

        try {
          if (
            await fs
              .stat(outputPath)
              .then(() => true)
              .catch(() => false)
          ) {
            await fs.unlink(outputPath);
            console.log(`Deleted existing ${outputFile} in ${shotDirName}`);
          }
        } catch (e) {
          console.warn(`Could not delete existing file ${outputPath}: ${e.message}`);
        }

        const ffmpegArgs = [
          '-framerate',
          '24',
          '-start_number',
          startNumber.toString(),
          '-i',
          path.join(shotFolderPath, filePattern),
          '-pix_fmt',
          'yuv420p',
          outputPath,
        ];

        try {
          console.log(
            `Processing ${shotDirName}... Running command: ffmpeg ${ffmpegArgs.join(' ')}`,
          );
          await execFileCancellable('ffmpeg', ffmpegArgs);
        } catch (error) {
          if (isCancelled) {
            console.log(`Processing of ${shotDirName} was cancelled.`);
            break; // Break from the shot-processing loop
          }
          console.error(
            `Error processing ${shotDirName}:`,
            error.message,
            error.stderr?.toString(),
          );
          mainWindow.webContents.send('processing-update', {
            type: 'error',
            message: `Error processing ${shotDirName}: ${error.message}`,
          });
          continue; // Continue to the next shot directory
        }
        console.log(`Created ${outputFile} in ${shotFolderPath}`);
        videoFiles.push(outputPath);
      }

      if (isCancelled) break;

      if (videoFiles.length > 0) {
        const listFile = path.join(versionFolderPath, 'temp_ffmpeg_list.txt');
        const fileContent = videoFiles
          .map((file) => `file '${file.replace(/'/g, "'\\\\''")}'`)
          .join('\n');
        await fs.writeFile(listFile, fileContent);
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

        const combineArgs = [
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listFile,
          '-c',
          'copy',
          combinedOutput,
        ];

        try {
          console.log('Creating combined video...');
          console.log(`Running command: ffmpeg ${combineArgs.join(' ')}`);
          await execFileCancellable('ffmpeg', combineArgs);
          console.log(`Created ${combinedOutput}`);
        } catch (error) {
          if (isCancelled) {
            console.log('Video combination was cancelled.');
            break; // Break from the main folder loop
          }
          console.error('Error creating combined video:', error.message, error.stderr?.toString());
          mainWindow.webContents.send('processing-update', {
            type: 'error',
            message: `Error creating combined video: ${error.message}`,
          });
        }
        try {
          await fs.unlink(listFile);
          console.log(`Deleted temp list file: ${listFile}`);
        } catch (e) {
          console.warn(`Could not delete temp list file ${listFile}: ${e.message}`);
        }
      } else {
        console.log('No video files were created, skipping combination.');
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
