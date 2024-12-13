// utils/imageComparison.ts
import { promises as fs } from 'fs';
import path from 'path';
import { ComparisonResult } from '../types/comparison';

export async function findImageSequences(sourcePath: string, comparePath: string): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = [];
  
  try {
    // Get all files from source directory
    const sourceFiles = await fs.readdir(sourcePath);
    const imageFiles = sourceFiles.filter(file => 
      /\.(jpg|jpeg|png|gif)$/i.test(file)
    );

    for (const sourceFile of imageFiles) {
      const sourceFull = path.join(sourcePath, sourceFile);
      const compareFull = path.join(comparePath, sourceFile);
      
      let compareExists = false;
      try {
        await fs.access(compareFull);
        compareExists = true;
      } catch {
        // Compare file doesn't exist
      }

      results.push({
        sourcePath: sourceFull,
        comparePath: compareExists ? compareFull : null,
        diffPercentage: compareExists ? await compareImages(sourceFull, compareFull) : null
      });
    }
  } catch (error) {
    console.error('Error processing images:', error);
  }

  return results;
}

async function compareImages(source: string, compare: string): Promise<number> {
  // This is where you'd implement the actual pixel comparison
  // You might want to use a library like 'jimp' or 'sharp' for this
  // For now, returning a random value for testing
  return Math.random() * 20;
}