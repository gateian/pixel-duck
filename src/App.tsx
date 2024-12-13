import React, { useState, useEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Button,
  Typography,
  Paper,
  Stack,
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { ComparisonResult } from './types/comparison';
import ComparisonVisualizer from './components/comparisonVisualizer';
import Header from './components/header';

interface PathConfig {
  source: string;
  compare: string;
}

// Define the theme
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
  //   const [imageData, setImageData] = useState<ComparisonResult[]>([]);
  //   const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const chooseDirectory = (pathType: 'source' | 'compare') => {
    const chooser = document.createElement('input');
    chooser.type = 'file';
    chooser.webkitdirectory = true;

    chooser.addEventListener('change', function (this: HTMLInputElement) {
      if (this.files && this.files[0]) {
        setPaths((prev) => ({
          ...prev,
          [pathType]: this.files![0].webkitRelativePath,
        }));
      }
    });

    chooser.click();
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <Header />
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="contained"
            startIcon={<FolderOpenIcon />}
            onClick={() => chooseDirectory('source')}
          >
            Set Render Folder Path
          </Button>
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

// Canvas component for visualization

export default App;
