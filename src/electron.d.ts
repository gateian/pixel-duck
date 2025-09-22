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
          panoramic?: boolean;
          audioCount?: number;
        }>
      >;
      processSequences: (
        folderPaths: string[],
        options?: {
          panoramic?: boolean;
        },
      ) => void;
      getVersionSettings: (folderPath: string) => Promise<{
        panoramic: boolean;
      }>;
      saveVersionSettings: (
        folderPaths: string[],
        settings: {
          panoramic?: boolean;
          audioFile?: string;
        },
      ) => Promise<void>;
      listAudioFiles: (folderPath: string) => Promise<{
        files: string[];
        directory: string | null;
      }>;
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
