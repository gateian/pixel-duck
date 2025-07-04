export {};

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string>;
      getLastPath: () => Promise<string | undefined>;
      openFolderInExplorer: (folderPath: string) => Promise<void>;
      findVersionFolders: (path: string) => Promise<
        Array<{
          path: string;
          version: string;
          hasVideo?: boolean;
          shotCount: number;
          frameCount: number;
        }>
      >;
      processSequences: (folderPaths: string[]) => void;
      cancelProcessing: () => void;
      onProcessingUpdate: (
        callback: (update: {
          type: 'start' | 'progress' | 'end' | 'error';
          total?: number;
          completed?: number;
          currentFolder?: string;
          message?: string;
        }) => void,
      ) => () => void;
    };
  }
}
