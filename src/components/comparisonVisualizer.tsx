import { useEffect, useRef } from 'react';
import { ComparisonResult } from '../types/comparison';

const ComparisonVisualizer: React.FC<{ data: ComparisonResult[] }> = ({ data }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
        marginTop: '20px',
      }}
    />
  );
};

export default ComparisonVisualizer;
