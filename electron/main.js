const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { execFile, spawn } = require('child_process');
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

// Spawn ffmpeg with progress reporting using -progress pipe:1
// Emits progress via onProgress callback as a fraction [0,1]
const runFfmpegWithProgress = (args, totalFrames, onProgress) => {
  return new Promise((resolve, reject) => {
    if (isCancelled) return reject(new Error('Cancelled'));

    const proc = spawn('ffmpeg', args, { windowsHide: true });
    childProcess = proc;

    let stdoutBuffer = '';
    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      let current = {};
      for (const line of lines) {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          current[key] = value;
        }
        if (line.startsWith('progress=')) {
          // End of a progress block
          // Compute fraction using frame or out_time_ms
          let fraction = 0;
          const frameNum = parseInt(current['frame'] || current['frames'] || '0', 10);
          if (Number.isFinite(frameNum) && frameNum > 0 && totalFrames > 0) {
            fraction = Math.min(frameNum / totalFrames, 1);
          } else if (current['out_time_ms']) {
            const outTimeMs = parseInt(current['out_time_ms'], 10);
            if (Number.isFinite(outTimeMs) && totalFrames > 0) {
              // Estimate duration from frames and a default 24 fps
              const durationMs = (totalFrames / 24) * 1000;
              fraction = Math.min(outTimeMs / durationMs, 1);
            }
          }
          try {
            if (typeof onProgress === 'function')
              onProgress(fraction, Number.isFinite(frameNum) ? frameNum : undefined);
          } catch (_) {}
          current = {};
        }
      }
    });

    let stderrBuffer = '';
    proc.stderr.on('data', (chunk) => {
      // Keep for debugging if needed; avoid flooding logs
      stderrBuffer += chunk.toString();
    });

    proc.on('error', (err) => {
      childProcess = null;
      reject(err);
    });

    proc.on('close', (code, signal) => {
      childProcess = null;
      if (isCancelled) return reject(new Error('Cancelled'));
      if (code === 0) resolve({ code });
      else {
        const error = new Error(`ffmpeg exited with code ${code} signal ${signal || ''}`.trim());
        error.stderr = stderrBuffer;
        reject(error);
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
    const groups = new Map(); // key: base|ext -> { indices:Set<number>, base, ext, digits:number }

    for (const fileName of files) {
      const match = fileName.match(IMAGE_SEQUENCE_REGEX);
      if (!match) continue;
      const base = match[1];
      const numberStr = match[2];
      const ext = match[3].toLowerCase();
      const index = parseInt(numberStr, 10);
      const key = `${base}|${ext}`;
      if (!groups.has(key)) {
        groups.set(key, { indices: new Set(), base, ext, digits: 0 });
      }
      const group = groups.get(key);
      group.indices.add(index);
      // Track zero padding width using the length of the numeric substring for index 0
      if (index === 0) {
        group.digits = Math.max(group.digits, numberStr.length);
      }
    }

    for (const group of groups.values()) {
      if (group.indices.has(0) && group.indices.size >= 20) {
        return {
          directory: currentDir,
          baseName: group.base,
          ext: group.ext,
          digits: group.digits || 4,
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

function isAudioFileName(fileName) {
  return /\.(wav|mp3)$/i.test(fileName);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 800,
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
  const defaults = { panoramic: false, frameRate: 24 };
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
  const defaults = { panoramic: false, frameRate: 24 };
  let frameRate = Number(settings?.frameRate);
  if (!Number.isFinite(frameRate)) frameRate = defaults.frameRate;
  frameRate = Math.max(1, Math.min(120, Math.round(frameRate)));
  const normalized = { panoramic: !!settings?.panoramic, frameRate };
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
            let frameRate = 24;
            let audioCount = 0;
            try {
              const sequence = await findImageSequenceRecursive(fullPath);
              if (sequence) {
                shotCount = 1;
                frameCount = sequence.frameCount;
                try {
                  const seqDirEntries = await fs.readdir(sequence.directory, {
                    withFileTypes: true,
                  });
                  audioCount = seqDirEntries.filter(
                    (e) => !e.isDirectory() && isAudioFileName(e.name),
                  ).length;
                } catch (_) {}
              }
              // Load settings to expose panoramic flag in listing
              try {
                const settingsPath = path.join(fullPath, 'pixelduck-settings.json');
                const content = await fs.readFile(settingsPath, 'utf-8');
                const parsed = JSON.parse(content);
                panoramic = !!parsed?.panoramic;
                if (Number.isFinite(Number(parsed?.frameRate))) {
                  frameRate = Math.max(1, Math.min(120, Math.round(Number(parsed.frameRate))));
                }
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
              audioCount,
              frameRate,
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

      // Build explicit list of frame files (sorted by index) to handle gaps and mixed padding
      const seqEntries = await fs.readdir(sequence.directory, { withFileTypes: true });
      const matchedFrames = seqEntries
        .filter((e) => !e.isDirectory())
        .map((e) => e.name)
        .map((name) => {
          const m = name.match(IMAGE_SEQUENCE_REGEX);
          if (!m) return null;
          const base = m[1];
          const ext = m[3].toLowerCase();
          if (base !== sequence.baseName || ext !== sequence.ext.toLowerCase()) return null;
          return { name, index: parseInt(m[2], 10) };
        })
        .filter(Boolean)
        .sort((a, b) => a.index - b.index)
        .map((f) => path.join(sequence.directory, f.name));

      const frameFiles = matchedFrames;
      if (frameFiles.length < 20) {
        throw new Error('Not enough frames after listing actual files.');
      }

      // Create concat demuxer list with per-frame durations at configured fps
      const imagesListPath = path.join(versionFolderPath, 'temp_ffmpeg_images_list.txt');
      // Load per-folder settings (if any) and merge with incoming options
      let panoramic = false;
      let frameRate = 24;
      try {
        const settingsPath = path.join(versionFolderPath, 'pixelduck-settings.json');
        const content = await fs.readFile(settingsPath, 'utf-8');
        const parsed = JSON.parse(content);
        panoramic = !!parsed?.panoramic;
        if (Number.isFinite(Number(parsed?.frameRate))) {
          frameRate = Math.max(1, Math.min(120, Math.round(Number(parsed.frameRate))));
        }
      } catch (e) {
        // ignore missing file or parse errors; fall back to options
      }
      if (options && typeof options.panoramic === 'boolean') {
        panoramic = !!options.panoramic;
      }
      const frameDuration = (1 / frameRate).toFixed(6);
      const escapePath = (p) => p.replace(/'/g, "'\\''");
      const listBody = frameFiles
        .map((full) => `file '${escapePath(full)}'\n` + `duration ${frameDuration}`)
        .join('\n');
      const listContent = `${listBody}\nfile '${escapePath(frameFiles[frameFiles.length - 1])}'`;
      await fs.writeFile(imagesListPath, listContent, 'utf-8');
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

      // panoramic already resolved above

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

      // Determine audio to include, if present
      let audioFilesInSequenceDir = [];
      try {
        const entries = await fs.readdir(sequence.directory, { withFileTypes: true });
        audioFilesInSequenceDir = entries
          .filter((e) => !e.isDirectory() && isAudioFileName(e.name))
          .map((e) => path.join(sequence.directory, e.name))
          .sort();
      } catch (_) {}

      // Check if a preferred audio file exists in settings
      let preferredAudio = null;
      try {
        const settingsPath = path.join(versionFolderPath, 'pixelduck-settings.json');
        const content = await fs.readFile(settingsPath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && parsed.audioFile && typeof parsed.audioFile === 'string') {
          const candidate = path.isAbsolute(parsed.audioFile)
            ? parsed.audioFile
            : path.join(versionFolderPath, parsed.audioFile);
          try {
            await fs.stat(candidate);
            preferredAudio = candidate;
          } catch (_) {}
        }
      } catch (_) {}

      const selectedAudio =
        preferredAudio ||
        (audioFilesInSequenceDir.length === 1 ? audioFilesInSequenceDir[0] : null);

      const ffmpegArgs = [
        '-v',
        'error',
        '-hide_banner',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        imagesListPath,
        ...(selectedAudio ? ['-i', selectedAudio] : []),
        '-progress',
        'pipe:1',
        '-stats_period',
        '0.5',
        '-r',
        String(frameRate),
        ...qualityArgs,
        ...vrMetadataArgs,
        ...(selectedAudio ? ['-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-shortest'] : []),
        combinedOutput,
      ];

      try {
        console.log(`Running command: ffmpeg ${ffmpegArgs.join(' ')}`);
        await runFfmpegWithProgress(ffmpegArgs, frameFiles.length, (fraction, framesProcessed) => {
          if (isCancelled) return;
          mainWindow.webContents.send('processing-update', {
            type: 'progress',
            completed: completedFolders + fraction,
            total: totalFolders,
            currentFolder: version,
            framesProcessed: typeof framesProcessed === 'number' ? framesProcessed : undefined,
            framesTotal: frameFiles.length,
          });
        });
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
      } finally {
        try {
          await fs.unlink(imagesListPath);
        } catch (_) {}
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

// List audio files available alongside the detected sequence for a version folder
ipcMain.handle('list-audio-files', async (_event, versionFolderPath) => {
  const result = { files: [], directory: null };
  try {
    const sequence = await findImageSequenceRecursive(versionFolderPath);
    if (!sequence) return result;
    const entries = await fs.readdir(sequence.directory, { withFileTypes: true });
    result.files = entries
      .filter((e) => !e.isDirectory() && isAudioFileName(e.name))
      .map((e) => e.name)
      .sort();
    result.directory = sequence.directory;
  } catch (e) {
    // ignore
  }
  return result;
});
