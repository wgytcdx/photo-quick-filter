export type Category = 'delete' | 'keep' | 'stash' | 'favorite';
export type StorageKind = 'file-system-access' | 'capacitor-android';

export interface PhotoStorageRoot {
  kind: StorageKind;
  handle?: FileSystemDirectoryHandle;
  sourceId?: string;
}

export interface ScanState {
  phase: 'idle' | 'scanning' | 'done' | 'cancelled' | 'error';
  scannedCount: number;
  totalBytes: number;
  errors: string[];
  cursor: string | null;
}

export interface PhotoEntry {
  id: string;
  storageKind: StorageKind;
  name: string;
  relativePath: string;
  parentDirHandle?: FileSystemDirectoryHandle;
  fileHandle?: FileSystemFileHandle;
  nativeUri?: string;
  mimeType?: string;
  size: number;
  lastModified: number;
}

export interface ActionRecord {
  photo: PhotoEntry;
  originalIndex: number;
  category: Category;
  targetDirHandle?: FileSystemDirectoryHandle;
  targetUri?: string;
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
  targetUri?: string;
  targetRelativePath?: string;
  targetName?: string;
  error?: string;
}

export interface UndoResult {
  success: boolean;
  restoredPhoto?: PhotoEntry;
  restoredFileHandle?: FileSystemFileHandle;
  restoredParentDirHandle?: FileSystemDirectoryHandle;
  restoredName?: string;
  restoredRelativePath?: string;
  error?: string;
}

export interface BatchMoveState {
  phase: 'idle' | 'running' | 'cancelling' | 'rollback' | 'done' | 'error';
  total: number;
  processed: number;
  rolledBack: number;
  errors: string[];
  currentPhoto: string;
}

export interface AppState {
  rootHandle: PhotoStorageRoot | null;
  folderName: string;
  queue: QueueState;
  moving: boolean;
  error: string | null;
  browserSupported: boolean;
  scanState: ScanState;
  batchMoveState: BatchMoveState;
}
