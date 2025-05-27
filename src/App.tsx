import React, { useState } from 'react';
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
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import Header from './components/header';

// Declare the electronAPI type
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string>;
      findVersionFolders: (path: string) => Promise<
        Array<{
          path: string;
          version: string;
        }>
      >;
      processSequence: (folderPath: string) => Promise<void>;
    };
  }
}

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

  const groupVersionFoldersByParent = (folders: VersionFolder[]): GroupedVersionFolders[] => {
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
  };

  const chooseDirectory = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setPath(folderPath);
        setSelectedFolders([]);
        const folders = await window.electronAPI.findVersionFolders(folderPath);
        const grouped = groupVersionFoldersByParent(folders);
        setGroupedFolders(grouped);
      }
    } catch (error) {
      console.error('Full error details:', error);
    }
  };

  const handleFolderSelect = (folderPath: string) => {
    setSelectedFolders((prevSelected) =>
      prevSelected.includes(folderPath)
        ? prevSelected.filter((p) => p !== folderPath)
        : [...prevSelected, folderPath]
    );
  };

  const handleProcessSelectedSequences = async () => {
    if (selectedFolders.length === 0) {
      alert('No version folders selected.');
      return;
    }
    try {
      alert(`Starting video processing for ${selectedFolders.length} selected version(s).`);
      for (const folderPath of selectedFolders) {
        console.log(`Requesting processing for: ${folderPath}`);
        await window.electronAPI.processSequence(folderPath);
      }
      alert('Video processing tasks initiated for all selected versions! Check main process console for details.');
      setSelectedFolders([]);
    } catch (error) {
      console.error('Error processing one or more sequences:', error);
      alert('Error processing one or more sequences. Check console for details.');
    }
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
                onClick={chooseDirectory}
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

          {groupedFolders.length > 0 && (
            groupedFolders.map((group) => (
              <Box key={group.parent} sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>{group.parentName}</Typography>
                <Grid container spacing={2}>
                  {group.paths.map((folder) => (
                    <Grid item key={folder.path} xs={12} sm={6} md={4} lg={3}>
                      <Paper
                        elevation={selectedFolders.includes(folder.path) ? 8 : 2}
                        sx={{
                          p: 2,
                          textAlign: 'center',
                          cursor: 'pointer',
                          border: selectedFolders.includes(folder.path)
                            ? `2px solid ${theme.palette.primary.main}`
                            : '2px solid transparent',
                          '&:hover': {
                            borderColor: theme.palette.primary.light,
                            boxShadow: selectedFolders.includes(folder.path) ? theme.shadows[8] : theme.shadows[4],
                          },
                          transition: 'border-color 0.2s, box-shadow 0.2s, elevation 0.2s',
                        }}
                        onClick={() => handleFolderSelect(folder.path)}
                      >
                        <Typography variant="subtitle1">{folder.version}</Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))
          )}
        </Box>

        <AppBar position="fixed" color="default" sx={{ top: 'auto', bottom: 0, backgroundColor: theme.palette.background.paper }}>
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
      </Box>
    </ThemeProvider>
  );
};

export default App;
