import React, { useState, useEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Button,
  Typography,
  Stack,
  Paper,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { ComparisonResult } from './types/comparison';
import ComparisonVisualizer from './components/comparisonVisualizer';
import Header from './components/header';

interface PathConfig {
  source: string;
  compare: string;
}

// Declare the electronAPI type
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string>;
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

const App: React.FC = () => {
  const [paths, setPaths] = useState<PathConfig>({ source: '', compare: '' });

  const chooseDirectory = async (pathtype: 'source' | 'compare') => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        setPaths((prev) => ({
          ...prev,
          [pathtype]: folderPath,
        }));
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
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
              onClick={() => chooseDirectory('source')}
            >
              Set Render Folder Path
            </Button>
          </Box>
        </Stack>

        {paths.source && (
          <Typography sx={{ mt: 1 }} color="text.secondary">
            Source: {paths.source}
          </Typography>
        )}

        {/* Canvas display for comparison results */}
        {paths.source && paths.compare && <ComparisonVisualizer data={imageData} />}
      </Box>
    </ThemeProvider>
  );
};

export default App;
