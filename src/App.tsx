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
  const [versionFolders, setVersionFolders] = useState<VersionFolder[]>([]);
  const [groupedFolders, setGroupedFolders] = useState<GroupedVersionFolders[]>([]);

  const groupVersionFoldersByParent = (folders: VersionFolder[]): GroupedVersionFolders[] => {
    const groupedPaths = new Map<string, VersionFolder[]>();

    folders.forEach((folder) => {
      // Get parent path by removing the version folder name
      const parentPath = folder.path
        .substring(0, folder.path.lastIndexOf(folder.version))
        .replace(/\\$/, '');

      if (!groupedPaths.has(parentPath)) {
        groupedPaths.set(parentPath, []);
      }
      groupedPaths.get(parentPath)?.push(folder);
    });

    // Convert Map to array of GroupedVersionFolders with parent folder names
    return Array.from(groupedPaths.entries()).map(([parent, paths]) => ({
      parent,
      parentName: parent.split('\\').pop() || parent, // Get last part of path
      paths,
    }));
  };

  const chooseDirectory = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();

      if (folderPath) {
        setPath(folderPath);
        const folders = await window.electronAPI.findVersionFolders(folderPath);
        const grouped = groupVersionFoldersByParent(folders);
        setGroupedFolders(grouped);
      }
    } catch (error) {
      console.error('Full error details:', error);
    }
  };

  const handleProcessSequence = async (folderPath: string) => {
    try {
      await window.electronAPI.processSequence(folderPath);
      alert('Video processing started!'); // Or some other notification
    } catch (error) {
      console.error('Error processing sequence:', error);
      alert('Error processing sequence. Check console for details.');
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

        {groupedFolders.length > 0 && (
          <div>
            <h3>Grouped Version Folders:</h3>
            <ul>
              {groupedFolders.map((group) => (
                <li key={group.parent}>
                  <h4>{group.parentName}</h4>
                  <ul>
                    {group.paths.map((folder) => (
                      <li key={folder.path}>
                        {folder.version}
                        <Button 
                          variant="outlined" 
                          size="small" 
                          sx={{ ml: 2 }}
                          onClick={() => handleProcessSequence(folder.path)}
                        >
                          Create Video
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}

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
