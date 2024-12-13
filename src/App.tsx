import React, { useState, useEffect } from 'react';
import { 
  ThemeProvider, 
  createTheme,
  CssBaseline,
  Box,
  Button,
  Typography,
  Paper,
  Stack
} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { ComparisonResult } from './types/comparison';

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
  const [imageData, setImageData] = useState<ComparisonResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const chooseDirectory = (pathType: 'source' | 'compare') => {
    const chooser = document.createElement('input');
    chooser.type = 'file';
    chooser.webkitdirectory = true;
    
    chooser.addEventListener('change', function(this: HTMLInputElement) {
      if (this.files && this.files[0]) {
        setPaths(prev => ({
          ...prev,
          [pathType]: this.files![0].webkitRelativePath
        }));
      }
    });

    chooser.click();
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          PixelDuck
        </Typography>
        
        <Paper sx={{ p: 3, mb: 3 }}>
          {/* Horizontal button layout */}
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<FolderOpenIcon />}
              onClick={() => chooseDirectory('source')}
            >
              Set Source Path
            </Button>
            <Button
              variant="contained"
              startIcon={<FolderOpenIcon />}
              onClick={() => chooseDirectory('compare')}
            >
              Set Compare Path
            </Button>
          </Stack>

          {/* Path display */}
          {paths.source && (
            <Typography sx={{ mt: 1 }} color="text.secondary">
              Source: {paths.source}
            </Typography>
          )}
          {paths.compare && (
            <Typography sx={{ mt: 1 }} color="text.secondary">
              Compare: {paths.compare}
            </Typography>
          )}
        </Paper>

        {/* Canvas display for comparison results */}
        {paths.source && paths.compare && (
          <ComparisonVisualizer data={imageData} />
        )}
      </Box>
    </ThemeProvider>
  );
};


// Canvas component for visualization
const ComparisonVisualizer: React.FC<{ data: ComparisonResult[] }> = ({ data }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const BAR_WIDTH = 50;

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = BAR_WIDTH;
    canvas.height = data.length;

    // Draw comparison results
    data.forEach((result, index) => {
      let color: string;
      
      if (!result.comparePath) {
        color = 'black'; // Missing compare image
      } else if (!result.diffPercentage) {
        color = 'white'; // No changes
      } else if (result.diffPercentage < 10) {
        color = 'orange'; // Small changes
      } else {
        color = 'red'; // Large changes
      }

      ctx.fillStyle = color;
      ctx.fillRect(0, index, BAR_WIDTH, 1);
    });
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        border: '1px solid #ccc',
        marginTop: '20px'
      }}
    />
  );
};

export default App;