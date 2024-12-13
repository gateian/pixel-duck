export interface ComparisonResult {
    sourcePath: string;
    comparePath: string | null;
    diffPercentage: number | null; // null if compare image missing
  }