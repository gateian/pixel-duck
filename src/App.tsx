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
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MovieIcon from '@mui/icons-material/Movie';
import Header from './components/header';

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
  });

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
          });
          break;
        case 'progress':
          setProcessingState((prevState) => ({
            ...prevState,
            showModal: true,
            completed: update.completed || prevState.completed,
            total: update.total || prevState.total,
            currentFolder: update.currentFolder || prevState.currentFolder,
          }));
          break;
        case 'end':
          setProcessingState({
            showModal: false,
            total: 0,
            completed: 0,
            currentFolder: '',
            error: '',
          });
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
    setSelectedFolders((prevSelected) =>
      prevSelected.includes(folderPath)
        ? prevSelected.filter((p) => p !== folderPath)
        : [...prevSelected, folderPath],
    );
  };

  const handleProcessSelectedSequences = async () => {
    if (selectedFolders.length === 0) {
      alert('No version folders selected.');
      return;
    }
    window.electronAPI.processSequences(selectedFolders);
  };

  const handleCloseModal = () => {
    setProcessingState({ ...processingState, showModal: false, error: '' });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto', mb: '70px' }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
            <Header />
            <Box sx={{ flexGrow: 1 }}>
              <Button
                variant="contained"
                startIcon={<FolderOpenIcon />}
                onClick={() => chooseDirectory()}
              >
                Set Render Folder Path
              </Button>
            </Box>
          </Stack>

          {path && (
            <Typography sx={{ mt: 1, mb: 2 }} color="text.secondary">
              Path: {path}
            </Typography>
          )}

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
                          p: 2,
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
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={() => handleFolderSelect(folder.path)}
                      >
                        <Typography variant="subtitle1">{folder.version}</Typography>
                        {folder.hasVideo && <MovieIcon color="action" sx={{ ml: 1 }} />}
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
          <Toolbar sx={{ justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleProcessSelectedSequences}
              disabled={selectedFolders.length === 0}
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
                  Processing {processingState.completed + 1} of {processingState.total}:{' '}
                  {processingState.currentFolder}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(processingState.completed / processingState.total) * 100}
                  sx={{ mb: 2 }}
                />
                <Typography align="right">
                  {Math.round((processingState.completed / processingState.total) * 100)}%
                </Typography>
              </>
            )}
            {processingState.error && (
              <Button onClick={handleCloseModal} sx={{ mt: 2 }}>
                Close
              </Button>
            )}
          </Box>
        </Modal>
      </Box>
    </ThemeProvider>
  );
};

export default App;
