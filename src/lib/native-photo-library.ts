import { registerPlugin } from '@capacitor/core';
import type { ActionRecord, Category, MoveResult, PhotoEntry, UndoResult } from './types';

interface NativePhotoPayload {
  id: string;
  uri: string;
  name: string;
  relativePath: string;
  size: number;
  lastModified: number;
  mimeType?: string;
}

interface NativeSelectSourceResult {
  sourceId: string;
  folderName: string;
  rootUri?: string;
  photos?: NativePhotoPayload[];
}

interface NativeScanPhotosResult {
  photos: NativePhotoPayload[];
  nextCursor: string | null;
  done: boolean;
  cancelled?: boolean;
  scannedCount: number;
  totalBytes: number;
  errors?: string[];
}

interface NativeMoveResult {
  targetUri: string;
  targetName: string;
  targetRelativePath: string;
}

interface NativeUndoResult {
  restoredPhoto: NativePhotoPayload;
}

interface NativePhotoLibraryPlugin {
  selectSource(): Promise<NativeSelectSourceResult>;
  scanPhotos(options: {
    sourceId: string;
    cursor?: string | null;
    pageSize?: number;
  }): Promise<NativeScanPhotosResult>;
  cancelScan(options: { sourceId: string; cursor?: string | null }): Promise<{ cancelled: boolean }>;
  readPhotoDataUrl(options: { uri: string; maxSize: number }): Promise<{ dataUrl: string }>;
  movePhoto(options: {
    sourceId: string;
    uri: string;
    relativePath: string;
    name: string;
    category: Category;
  }): Promise<NativeMoveResult>;
  undoMove(options: {
    sourceId: string;
    category: Category;
    originalRelativePath: string;
    originalName: string;
    targetRelativePath: string;
    targetName: string;
    targetUri?: string;
  }): Promise<NativeUndoResult>;
}

const NativePhotoLibrary = registerPlugin<NativePhotoLibraryPlugin>('PhotoLibrary');

function toPhotoEntry(photo: NativePhotoPayload): PhotoEntry {
  return {
    id: photo.id,
    storageKind: 'capacitor-android',
    name: photo.name,
    relativePath: photo.relativePath,
    nativeUri: photo.uri,
    mimeType: photo.mimeType,
    size: photo.size,
    lastModified: photo.lastModified,
  };
}

export async function selectNativePhotoSource(): Promise<{
  sourceId: string;
  folderName: string;
  photos: PhotoEntry[];
}> {
  const result = await NativePhotoLibrary.selectSource();
  return {
    sourceId: result.sourceId,
    folderName: result.folderName,
    photos: (result.photos ?? []).map(toPhotoEntry),
  };
}

export async function scanNativePhotos(
  sourceId: string,
  cursor: string | null,
  pageSize: number,
): Promise<{
  photos: PhotoEntry[];
  nextCursor: string | null;
  done: boolean;
  cancelled: boolean;
  scannedCount: number;
  totalBytes: number;
  errors: string[];
}> {
  const result = await NativePhotoLibrary.scanPhotos({ sourceId, cursor, pageSize });
  return {
    photos: result.photos.map(toPhotoEntry),
    nextCursor: result.nextCursor ?? null,
    done: result.done,
    cancelled: result.cancelled ?? false,
    scannedCount: result.scannedCount,
    totalBytes: result.totalBytes,
    errors: result.errors ?? [],
  };
}

export async function cancelNativeScan(sourceId: string, cursor: string | null): Promise<void> {
  await NativePhotoLibrary.cancelScan({ sourceId, cursor });
}

export async function getNativePhotoDataUrl(photo: PhotoEntry, maxSize: number): Promise<string> {
  if (!photo.nativeUri) throw new Error('照片缺少 Android 原生 URI');
  const result = await NativePhotoLibrary.readPhotoDataUrl({ uri: photo.nativeUri, maxSize });
  return result.dataUrl;
}

export async function getNativePhotoBase64(photo: PhotoEntry, maxSize: number): Promise<string | null> {
  const dataUrl = await getNativePhotoDataUrl(photo, maxSize);
  return dataUrl.split(',')[1] ?? null;
}

export async function moveNativePhoto(
  sourceId: string,
  photo: PhotoEntry,
  category: Category,
): Promise<MoveResult> {
  if (!photo.nativeUri) return { success: false, error: '照片缺少 Android 原生 URI' };

  try {
    const result = await NativePhotoLibrary.movePhoto({
      sourceId,
      uri: photo.nativeUri,
      relativePath: photo.relativePath,
      name: photo.name,
      category,
    });

    return {
      success: true,
      targetUri: result.targetUri,
      targetName: result.targetName,
      targetRelativePath: result.targetRelativePath,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Android 原生移动照片失败' };
  }
}

export async function undoNativeMove(
  sourceId: string,
  record: ActionRecord,
): Promise<UndoResult> {
  try {
    const result = await NativePhotoLibrary.undoMove({
      sourceId,
      category: record.category,
      originalRelativePath: record.photo.relativePath,
      originalName: record.photo.name,
      targetRelativePath: record.targetRelativePath,
      targetName: record.targetName,
      targetUri: record.targetUri,
    });

    return {
      success: true,
      restoredPhoto: toPhotoEntry(result.restoredPhoto),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Android 原生撤销失败' };
  }
}
