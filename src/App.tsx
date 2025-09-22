import React, { useState, useEffect, useCallback } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Button,
  Typography,
  Stack,
  Grid,
  Paper,
  AppBar,
  Toolbar,
  Modal,
  LinearProgress,
  Tooltip,
  IconButton,
  Divider,
} from '@mui/material';
// removed bottom bar checkbox
import SettingsIcon from '@mui/icons-material/Settings';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Switch from '@mui/material/Switch';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Header from './components/header';
import FolderIcon from '@mui/icons-material/Folder';
// removed selection tick icon
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PanoramaIcon from '@mui/icons-material/Panorama';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

interface VersionFolder {
  path: string;
  version: string;
  hasVideo?: boolean;
  shotCount: number;
  frameCount: number;
  panoramic?: boolean;
  audioCount?: number;
  frameRate?: number;
}

interface GroupedVersionFolders {
  parent: string;
  parentName: string;
  paths: VersionFolder[];
}

const App: React.FC = () => {
  const [path, setPath] = useState<string>('');
  const [groupedFolders, setGroupedFolders] = useState<GroupedVersionFolders[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [processingState, setProcessingState] = useState({
    showModal: false,
    total: 0,
    completed: 0,
    currentFolder: '',
    error: '',
    framesProcessed: 0 as number | undefined,
    framesTotal: 0 as number | undefined,
    finished: false,
  });
  const [settingsDialogOpen, setSettingsDialogOpen] = useState<boolean>(false);
  const [settingsTargetFolder, setSettingsTargetFolder] = useState<string>('');
  const [dialogPanoramic, setDialogPanoramic] = useState<boolean>(false);
  const [dialogFrameRate, setDialogFrameRate] = useState<number>(24);
  const [audioDialogOpen, setAudioDialogOpen] = useState<boolean>(false);
  const [audioOptions, setAudioOptions] = useState<{ files: string[]; directory: string | null }>({
    files: [],
    directory: null,
  });
  const [selectedAudioFile, setSelectedAudioFile] = useState<string | null>(null);

  const groupVersionFoldersByParent = useCallback(
    (folders: VersionFolder[]): GroupedVersionFolders[] => {
      const groupedPaths = new Map<string, VersionFolder[]>();

      folders.forEach((folder) => {
        const parentPath = folder.path
          .substring(0, folder.path.lastIndexOf(folder.version))
          .replace(/\\$/, '');

        if (!groupedPaths.has(parentPath)) {
          groupedPaths.set(parentPath, []);
        }
        groupedPaths.get(parentPath)?.push(folder);
      });

      return Array.from(groupedPaths.entries()).map(([parent, paths]) => ({
        parent,
        parentName: parent.split('\\').pop() || parent,
        paths,
      }));
    },
    [],
  );

  const chooseDirectory = useCallback(
    async (isRefresh = false) => {
      try {
        let folderPath = path;
        if (!isRefresh) {
          folderPath = await window.electronAPI.selectFolder();
        }

        if (folderPath) {
          if (!isRefresh) {
            setPath(folderPath);
            setSelectedFolders([]);
          }
          const folders = await window.electronAPI.findVersionFolders(folderPath);
          const grouped = groupVersionFoldersByParent(folders);
          setGroupedFolders(grouped);
        }
      } catch (error) {
        console.error('Full error details:', error);
      }
    },
    [path, groupVersionFoldersByParent],
  );

  useEffect(() => {
    const loadLastPath = async () => {
      const lastPath = await window.electronAPI.getLastPath();
      if (lastPath) {
        setPath(lastPath);
        const folders = await window.electronAPI.findVersionFolders(lastPath);
        const grouped = groupVersionFoldersByParent(folders);
        setGroupedFolders(grouped);
      }
    };
    loadLastPath();
  }, [groupVersionFoldersByParent]);

  useEffect(() => {
    const removeListener = window.electronAPI.onProcessingUpdate((update) => {
      console.log('Processing Update:', update);
      switch (update.type) {
        case 'start':
          setProcessingState({
            showModal: true,
            total: update.total || 0,
            completed: 0,
            currentFolder: '',
            error: '',
            framesProcessed: undefined,
            framesTotal: undefined,
            finished: false,
          });
          break;
        case 'progress':
          setProcessingState((prevState) => ({
            ...prevState,
            showModal: true,
            completed: update.completed || prevState.completed,
            total: update.total || prevState.total,
            currentFolder: update.currentFolder || prevState.currentFolder,
            framesProcessed:
              typeof update.framesProcessed === 'number'
                ? update.framesProcessed
                : prevState.framesProcessed,
            framesTotal:
              typeof update.framesTotal === 'number' ? update.framesTotal : prevState.framesTotal,
          }));
          break;
        case 'end':
          setProcessingState((prev) => ({
            ...prev,
            showModal: true,
            completed: prev.total,
            currentFolder: prev.currentFolder,
            error: '',
            framesProcessed:
              prev.framesTotal !== undefined ? prev.framesTotal : prev.framesProcessed,
            finished: true,
          }));
          // Optionally, refresh folder status
          chooseDirectory(true);
          break;
        case 'error':
          setProcessingState((prevState) => ({
            ...prevState,
            error: update.message || 'An unknown error occurred.',
          }));
          break;
      }
    });

    return () => {
      removeListener();
    };
  }, [chooseDirectory]);

  const handleFolderSelect = (folderPath: string) => {
    setSelectedFolders((prevSelected) => (prevSelected.includes(folderPath) ? [] : [folderPath]));
  };

  const openSettingsDialog = async (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation();
    setSettingsTargetFolder(folderPath);
    try {
      const settings = await window.electronAPI.getVersionSettings(folderPath);
      setDialogPanoramic(!!settings.panoramic);
      setDialogFrameRate(Number(settings.frameRate) || 24);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setDialogPanoramic(false);
      setDialogFrameRate(24);
    }
    setSettingsDialogOpen(true);
  };

  const closeSettingsDialog = () => {
    setSettingsDialogOpen(false);
  };

  const saveSettingsDialog = async () => {
    if (settingsTargetFolder) {
      try {
        await window.electronAPI.saveVersionSettings([settingsTargetFolder], {
          panoramic: dialogPanoramic,
          audioFile: selectedAudioFile || undefined,
          frameRate: dialogFrameRate,
        });
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
    setSettingsDialogOpen(false);
  };

  const openAudioDialog = async (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation();
    try {
      const { files, directory } = await window.electronAPI.listAudioFiles(folderPath);
      setAudioOptions({ files, directory });
      setSelectedAudioFile(null);
      setSettingsTargetFolder(folderPath);
      setAudioDialogOpen(true);
    } catch (err) {
      console.error('Failed to list audio files:', err);
    }
  };

  const closeAudioDialog = () => setAudioDialogOpen(false);
  const saveAudioDialog = async () => {
    if (!settingsTargetFolder) return;
    try {
      await window.electronAPI.saveVersionSettings([settingsTargetFolder], {
        audioFile: selectedAudioFile || undefined,
      });
      setAudioDialogOpen(false);
    } catch (err) {
      console.error('Failed to save audio selection:', err);
    }
  };

  const handleProcessSelectedSequences = async () => {
    if (selectedFolders.length !== 1) {
      alert('Please select exactly one version folder.');
      return;
    }
    window.electronAPI.processSequences(selectedFolders, {});
  };

  const handleCancelProcessing = () => {
    console.log('Requesting to cancel processing...');
    window.electronAPI.cancelProcessing();
  };

  const handleCloseModal = () => {
    setProcessingState({ ...processingState, showModal: false, error: '' });
  };

  const formatDuration = (frameCount: number, frameRate: number) => {
    // Takes frameCount and frameRate, returns "hh:mm:ss"
    if (!Number.isFinite(frameCount) || !Number.isFinite(frameRate) || frameRate <= 0) {
      return '00:00:00';
    }
    const totalSeconds = Math.floor(frameCount / frameRate);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto', mb: '70px' }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
            <Header />
            <Box sx={{ flexGrow: 1 }}>
              <Tooltip title={path || 'No folder selected'} arrow>
                <Button
                  variant="contained"
                  startIcon={<FolderOpenIcon />}
                  onClick={() => chooseDirectory()}
                >
                  Set Render Folder Path
                </Button>
              </Tooltip>
            </Box>
          </Stack>

          {groupedFolders.length > 0 &&
            groupedFolders.map((group) => (
              <Box key={group.parent} sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {group.parentName}
                </Typography>
                <Grid container spacing={2}>
                  {group.paths.map((folder) => (
                    <Grid item key={folder.path} xs={12} sm={6} md={4} lg={3}>
                      <Paper
                        elevation={selectedFolders.includes(folder.path) ? 8 : 2}
                        sx={{
                          p: 0,
                          cursor: 'pointer',
                          border: selectedFolders.includes(folder.path)
                            ? `2px solid ${theme.palette.primary.main}`
                            : '2px solid transparent',
                          '&:hover': {
                            borderColor: theme.palette.primary.light,
                            boxShadow: selectedFolders.includes(folder.path)
                              ? theme.shadows[8]
                              : theme.shadows[4],
                          },
                          transition: 'border-color 0.2s, box-shadow 0.2s, elevation 0.2s',
                        }}
                        onClick={() => handleFolderSelect(folder.path)}
                      >
                        <Box sx={{ display: 'flex', width: '100%' }}>
                          <Box
                            sx={{
                              width: 36,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              py: 1,
                              backgroundColor: folder.hasVideo ? '#4A148C' : '#ccc',
                            }}
                          >
                            {folder.hasVideo ? (
                              <Tooltip title="Video generated" arrow>
                                <CheckCircleOutlineIcon sx={{ color: '#fff' }} />
                              </Tooltip>
                            ) : (
                              <Box sx={{ height: 24 }} />
                            )}
                            {folder.panoramic && (
                              <Tooltip title="Panoramic (360) enabled" arrow>
                                <PanoramaIcon sx={{ color: '#fff', mt: 1 }} />
                              </Tooltip>
                            )}
                            {folder.audioCount && folder.audioCount >= 1 ? (
                              <Tooltip
                                title={
                                  folder.audioCount > 1
                                    ? 'Multiple audio tracks detected'
                                    : 'Audio track detected'
                                }
                                arrow
                              >
                                <AudiotrackIcon sx={{ color: '#fff', mt: 1 }} />
                              </Tooltip>
                            ) : null}
                          </Box>
                          <Box sx={{ flex: 1, p: 2 }}>
                            <Box
                              sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                width: '100%',
                              }}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Typography variant="subtitle1">{folder.version}</Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Tooltip title="Open location" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.electronAPI.openFolderInExplorer(folder.path);
                                    }}
                                    sx={{
                                      '& svg': {
                                        color: 'action.active',
                                        transition: 'color 0.2s',
                                      },
                                      '&:hover svg': {
                                        color: 'primary.main',
                                      },
                                    }}
                                  >
                                    <FolderIcon />
                                  </IconButton>
                                </Tooltip>
                                {folder.audioCount && folder.audioCount > 1 && (
                                  <Tooltip title="Select audio track" arrow>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => openAudioDialog(e, folder.path)}
                                      sx={{
                                        '& svg': {
                                          color: 'action.active',
                                          transition: 'color 0.2s',
                                        },
                                        '&:hover svg': {
                                          color: 'primary.main',
                                        },
                                      }}
                                    >
                                      <AudiotrackIcon />
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Tooltip title="Settings" arrow>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => openSettingsDialog(e, folder.path)}
                                    sx={{
                                      '& svg': {
                                        color: 'action.active',
                                        transition: 'color 0.2s',
                                      },
                                      '&:hover svg': {
                                        color: 'primary.main',
                                      },
                                    }}
                                  >
                                    <SettingsIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </Box>
                            <Divider sx={{ my: 1, width: '100%' }} />
                            <Box sx={{ width: '100%', textAlign: 'left' }}>
                              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                                Frames: {folder.frameCount} @ {folder.frameRate} fps (
                                {formatDuration(folder.frameCount, folder.frameRate || 0)})
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
        </Box>

        <AppBar
          position="fixed"
          color="default"
          sx={{ top: 'auto', bottom: 0, backgroundColor: theme.palette.background.paper }}
        >
          <Toolbar sx={{ justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleProcessSelectedSequences}
              disabled={selectedFolders.length !== 1}
              size="large"
            >
              Create Video for Selected ({selectedFolders.length})
            </Button>
          </Toolbar>
        </AppBar>

        <Modal open={processingState.showModal} onClose={handleCloseModal}>
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 400,
              bgcolor: 'background.paper',
              boxShadow: 24,
              p: 4,
              borderRadius: 2,
              outline: 'none',
            }}
          >
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              Processing Videos...
            </Typography>
            {processingState.error ? (
              <Typography color="error">{processingState.error}</Typography>
            ) : (
              <>
                <Typography sx={{ mb: 1 }}>
                  {processingState.finished ? (
                    <>Done.</>
                  ) : processingState.framesProcessed !== undefined &&
                    processingState.framesTotal !== undefined ? (
                    <>
                      Processed frames: {processingState.framesProcessed}/
                      {processingState.framesTotal}
                    </>
                  ) : (
                    <>
                      Processing {processingState.completed + 1} of {processingState.total}:{' '}
                      {processingState.currentFolder}
                    </>
                  )}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={
                    processingState.total > 0
                      ? (processingState.completed / processingState.total) * 100
                      : 0
                  }
                  sx={{ mb: 2 }}
                />
                <Typography align="right">
                  {processingState.total > 0
                    ? Math.round((processingState.completed / processingState.total) * 100)
                    : 0}
                  %
                </Typography>
              </>
            )}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              {processingState.error || processingState.finished ? (
                <Button onClick={handleCloseModal}>Close</Button>
              ) : (
                <Button onClick={handleCancelProcessing} color="secondary" variant="outlined">
                  Cancel
                </Button>
              )}
            </Box>
          </Box>
        </Modal>
        <Dialog open={settingsDialogOpen} onClose={closeSettingsDialog} maxWidth="xs" fullWidth>
          <DialogTitle>Settings</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography>Panoramic (360 equirectangular)</Typography>
              <Switch
                checked={dialogPanoramic}
                onChange={(e) => setDialogPanoramic(e.target.checked)}
                color="primary"
              />
            </Box>
            <Box
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}
            >
              <Typography>Frame rate (fps)</Typography>
              <input
                type="number"
                min={1}
                max={120}
                value={dialogFrameRate}
                onChange={(e) =>
                  setDialogFrameRate(() => {
                    const n = Math.round(Number(e.target.value));
                    if (!Number.isFinite(n)) return 24;
                    return Math.max(1, Math.min(120, n));
                  })
                }
                style={{
                  width: 80,
                  padding: 6,
                  borderRadius: 4,
                  border: '1px solid rgba(0,0,0,0.23)',
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeSettingsDialog}>Cancel</Button>
            <Button onClick={saveSettingsDialog} variant="contained">
              Save
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog open={audioDialogOpen} onClose={closeAudioDialog} maxWidth="xs" fullWidth>
          <DialogTitle>Select Audio Track</DialogTitle>
          <DialogContent>
            {audioOptions.files.length === 0 ? (
              <Typography>No audio files found alongside the image sequence.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {audioOptions.files.map((file) => (
                  <Button
                    key={file}
                    variant={selectedAudioFile === file ? 'contained' : 'outlined'}
                    onClick={() => setSelectedAudioFile(file)}
                  >
                    {file}
                  </Button>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeAudioDialog}>Cancel</Button>
            <Button onClick={saveAudioDialog} variant="contained" disabled={!selectedAudioFile}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
};

export default App;
