export type Category = 'delete' | 'keep' | 'stash' | 'favorite';

export interface PhotoEntry {
  name: string;
  relativePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
  fileHandle: FileSystemFileHandle;
  size: number;
  lastModified: number;
}

export interface ActionRecord {
  photo: PhotoEntry;
  originalIndex: number;
  category: Category;
  targetDirHandle: FileSystemDirectoryHandle;
  targetName: string;
  targetRelativePath: string;
  isAiAdopted?: boolean;
  aiBucket?: Category;
  aiConfidence?: number;
  aiReason?: string;
}

export interface QueueState {
  photos: PhotoEntry[];
  currentIndex: number;
  undoStack: ActionRecord[];
}

export interface Stats {
  total: number;
  remaining: number;
  deleteCount: number;
  keepCount: number;
  stashCount: number;
  favoriteCount: number;
}

export interface MoveResult {
  success: boolean;
  categoryDirHandle?: FileSystemDirectoryHandle;
  targetFileHandle?: FileSystemFileHandle;
  targetRelativePath?: string;
  targetName?: string;
  error?: string;
}

export interface UndoResult {
  success: boolean;
  restoredFileHandle?: FileSystemFileHandle;
  restoredParentDirHandle?: FileSystemDirectoryHandle;
  restoredName?: string;
  restoredRelativePath?: string;
  error?: string;
}

export interface AppState {
  rootHandle: FileSystemDirectoryHandle | null;
  folderName: string;
  queue: QueueState;
  moving: boolean;
  error: string | null;
  browserSupported: boolean;
}
