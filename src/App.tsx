import React, { useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Button,
  Typography,
  Stack,
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

const App: React.FC = () => {
  const [path, setPath] = useState<string>('');
  const [versionFolders, setVersionFolders] = useState<VersionFolder[]>([]);

  const chooseDirectory = async () => {
    try {
      console.log('Starting directory selection...');
      const folderPath = await window.electronAPI.selectFolder();
      console.log('Selected folder path:', folderPath);

      if (folderPath) {
        setPath(folderPath);
        console.log('About to scan for version folders in:', folderPath);
        const folders = await window.electronAPI.findVersionFolders(folderPath);
        console.log('Found folders:', folders);
        setVersionFolders(folders);
      }
    } catch (error) {
      console.error('Full error details:', error);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3 }}>
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
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Path: {path}
          </Typography>
        )}

        {/* Canvas display for comparison results */}
        {/* {path && path && <ComparisonVisualizer data={imageData} />} */}

        {versionFolders.length > 0 && (
          <div>
            <h3>Found Version Folders:</h3>
            <ul>
              {versionFolders.map((folder) => (
                <li key={folder.path}>
                  {folder.version} - {folder.path}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Box>
    </ThemeProvider>
  );
};

export default App;
