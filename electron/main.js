const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execSync } = require('child_process');

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

// Handle processing image sequence to video
ipcMain.handle('process-sequence', async (event, versionFolderPath) => {
  console.log(`Processing image sequences in version folder: ${versionFolderPath}`);

  try {
    const shotDirs = (await fs.readdir(versionFolderPath, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort();

    console.log(`Found ${shotDirs.length} potential shot directories in ${versionFolderPath}`);

    const videoFiles = [];

    for (const shotDirName of shotDirs) {
      const shotFolderPath = path.join(versionFolderPath, shotDirName);
      console.log(`Processing shot folder: ${shotFolderPath}`);

      const files = (await fs.readdir(shotFolderPath))
        .filter(file => file.toLowerCase().endsWith('.png'))
        .sort();

      if (files.length === 0) {
        console.log(`No PNG files found in ${shotDirName}`);
        continue;
      }

      console.log(`Found ${files.length} PNG files in ${shotDirName}`);

      const firstFile = files[0];
      // Regex to find a sequence of 4 digits, assuming it's part of the frame number
      const match = firstFile.match(/(\d{4})(?=\.png$)/i); 
      if (!match) {
        // Fallback: try to find any number before .png if the 4-digit pattern fails
        const fallbackMatch = firstFile.match(/(\d+)(?=\.png$)/i);
        if (!fallbackMatch) {
            console.log(`Could not determine start number for ${shotDirName} from file ${firstFile}`);
            continue;
        }
         console.log(`Using fallback regex for start number in ${shotDirName}`);
        match = fallbackMatch;
      }
      
      const startNumberStr = match[1]; // Get the matched digits
      const startNumber = parseInt(startNumberStr);
      
      // Construct file pattern: replace the found number sequence with %04d
      const filePattern = firstFile.substring(0, match.index) + '%04d' + firstFile.substring(match.index + startNumberStr.length);
      const outputFile = `${shotDirName}_preview.mp4`;
      const outputPath = path.join(shotFolderPath, outputFile); // Save preview in the shot folder

      try {
        if (await fs.stat(outputPath).then(() => true).catch(() => false)) {
          await fs.unlink(outputPath);
          console.log(`Deleted existing ${outputFile} in ${shotDirName}`);
        }
      } catch (e) {
         // If fs.stat or fs.unlink fails, log it but try to continue
        console.warn(`Could not delete existing file ${outputPath}: ${e.message}`);
      }
      
      const ffmpegCommand = `ffmpeg -framerate 24 -start_number ${startNumber} -i "${path.join(shotFolderPath, filePattern)}" -pix_fmt yuv420p "${outputPath}"`;

      try {
        console.log(`Processing ${shotDirName}... Running command: ${ffmpegCommand}`);
        execSync(ffmpegCommand); // Consider making this async for long processes
        console.log(`Created ${outputFile} in ${shotFolderPath}`);
        videoFiles.push(outputPath);
      } catch (error) {
        console.error(`Error processing ${shotDirName}:`, error.message, error.stderr?.toString());
      }
    }

    if (videoFiles.length > 0) {
      const listFile = path.join(versionFolderPath, 'temp_ffmpeg_list.txt');
      // Ensure paths in list file are suitable for ffmpeg (e.g., relative to a common base or absolute)
      // For simplicity, using absolute paths. Escape single quotes in paths.
      const fileContent = videoFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
      await fs.writeFile(listFile, fileContent);

      const combinedOutput = path.join(versionFolderPath, 'all_shots_combined.mp4');

      try {
        if (await fs.stat(combinedOutput).then(() => true).catch(() => false)) {
          await fs.unlink(combinedOutput);
          console.log(`Deleted existing ${combinedOutput}`);
        }
      } catch (e) {
        console.warn(`Could not delete existing file ${combinedOutput}: ${e.message}`);
      }
      
      const combineCommand = `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy "${combinedOutput}"`;
      try {
        console.log('Creating combined video...');
        console.log(`Running command: ${combineCommand}`);
        execSync(combineCommand); // Consider making this async
        console.log(`Created ${combinedOutput}`);
      } catch (error) {
        console.error('Error creating combined video:', error.message, error.stderr?.toString());
      }

      try {
        await fs.unlink(listFile);
        console.log(`Deleted temp list file: ${listFile}`);
      } catch(e) {
        console.warn(`Could not delete temp list file ${listFile}: ${e.message}`);
      }
      
    } else {
      console.log('No video files were created, skipping combination.');
    }
    return { success: true, message: 'Processing complete.', outputDir: versionFolderPath };
  } catch (error) {
    console.error('Error in process-sequence handler:', error);
    throw error; // Rethrow to be caught by the renderer process if needed
  }
});
