import { Capacitor } from '@capacitor/core';
import type { ActionRecord, Category, MoveResult, PhotoEntry, PhotoStorageRoot, UndoResult } from './types';
import {
  cancelNativeScan,
  getNativePhotoDataUrl,
  moveNativePhoto,
  selectNativePhotoSource,
  scanNativePhotos,
  undoNativeMove,
} from './native-photo-library';
import { scanDirectory } from './scanner';
import { movePhoto, undoMove } from './mover';

export interface PhotoStorageSource {
  rootHandle: PhotoStorageRoot;
  folderName: string;
  photos: PhotoEntry[];
  warning?: string;
}

export interface PhotoScanBatch {
  photos: PhotoEntry[];
  nextCursor: string | null;
  done: boolean;
  cancelled?: boolean;
  scannedCount: number;
  totalBytes: number;
  errors: string[];
}

export interface PhotoStorageAdapter {
  id: string;
  label: string;
  platform: 'desktop' | 'android-web' | 'unsupported';
  isSupported: () => boolean;
  unsupportedReason: () => string;
  selectSource: () => Promise<PhotoStorageSource>;
  scanPhotos?: (
    rootHandle: PhotoStorageRoot,
    cursor: string | null,
    pageSize: number,
  ) => Promise<PhotoScanBatch>;
  cancelScan?: (
    rootHandle: PhotoStorageRoot,
    cursor: string | null,
  ) => Promise<void>;
  movePhoto: (
    rootHandle: PhotoStorageRoot,
    photo: PhotoEntry,
    category: Category,
  ) => Promise<MoveResult>;
  undoMove: (
    rootHandle: PhotoStorageRoot,
    record: ActionRecord,
  ) => Promise<UndoResult>;
}

function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function isSecureEnoughForPicker(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

async function verifyReadWriteAccess(dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const testName = `_photo_quick_filter_access_test_${Date.now().toString(36)}.tmp`;
  let testHandle: FileSystemFileHandle | null = null;

  try {
    testHandle = await dirHandle.getFileHandle(testName, { create: true });
    const writable = await testHandle.createWritable();
    await writable.write('photo-quick-filter access test');
    await writable.close();
  } catch (e) {
    if (testHandle) {
      try {
        await dirHandle.removeEntry(testName);
      } catch {
        // The primary failure already explains that the selected directory is not usable.
      }
    }
    throw new Error(
      `当前浏览器无法写入所选目录，无法直接移动原图。请换用支持读写目录的安卓 Chrome，或进入 APK 路线。${e instanceof Error ? ` (${e.message})` : ''}`,
      { cause: e },
    );
  }

  try {
    await dirHandle.removeEntry(testName);
  } catch (e) {
    throw new Error(
      '当前浏览器可以写入但无法删除文件，无法安全地直接移动原图。请进入 APK 路线。',
      { cause: e },
    );
  }
}

function getUnsupportedReason(): string {
  if (typeof window === 'undefined') return '当前运行环境不是浏览器，无法访问本地照片目录。';
  if (!isSecureEnoughForPicker()) return '请通过 HTTPS、localhost 或 127.0.0.1 打开页面后再选择照片目录。';
  return '当前浏览器不支持 File System Access API，无法直接读取并移动手机相册原文件。建议使用 Chrome/Edge，或进入 APK 路线。';
}

const fileSystemAccessAdapter: PhotoStorageAdapter = {
  id: isAndroidBrowser() ? 'android-file-system-access' : 'file-system-access',
  label: isAndroidBrowser() ? '安卓网页目录读写' : '桌面目录读写',
  platform: isAndroidBrowser() ? 'android-web' : 'desktop',
  isSupported: () => hasFileSystemAccess() && isSecureEnoughForPicker(),
  unsupportedReason: getUnsupportedReason,
  async selectSource() {
    const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await verifyReadWriteAccess(rootHandle);
    const photos = await scanDirectory(rootHandle);

    return {
      rootHandle: { kind: 'file-system-access', handle: rootHandle },
      folderName: rootHandle.name,
      photos,
      warning: isAndroidBrowser()
        ? '安卓网页模式已通过目录写入/删除验证。请确认系统相册稍后能识别分类目录中的文件。'
        : undefined,
    };
  },
  async movePhoto(rootHandle, photo, category) {
    if (rootHandle.kind !== 'file-system-access' || !rootHandle.handle) {
      return { success: false, error: '当前来源不是浏览器文件系统目录' };
    }
    return movePhoto(rootHandle.handle, photo, category);
  },
  async undoMove(rootHandle, record) {
    if (rootHandle.kind !== 'file-system-access' || !rootHandle.handle) {
      return { success: false, error: '当前来源不是浏览器文件系统目录' };
    }
    return undoMove(rootHandle.handle, record);
  },
};

const nativeAndroidAdapter: PhotoStorageAdapter = {
  id: 'capacitor-android',
  label: 'Android APK 原生相册目录',
  platform: 'android-web',
  isSupported: isNativeAndroid,
  unsupportedReason: () => '当前不是 Android APK 原生运行环境，无法使用 SAF/MediaStore 原生照片桥。',
  async selectSource() {
    const source = await selectNativePhotoSource();
    return {
      rootHandle: { kind: 'capacitor-android', sourceId: source.sourceId },
      folderName: source.folderName,
      photos: source.photos,
      warning: 'APK 模式会通过 Android 原生目录授权移动原图，并分批扫描大目录。',
    };
  },
  async scanPhotos(rootHandle, cursor, pageSize) {
    if (rootHandle.kind !== 'capacitor-android' || !rootHandle.sourceId) {
      throw new Error('当前来源不是 Android APK 原生目录');
    }
    return scanNativePhotos(rootHandle.sourceId, cursor, pageSize);
  },
  async cancelScan(rootHandle, cursor) {
    if (rootHandle.kind !== 'capacitor-android' || !rootHandle.sourceId) return;
    await cancelNativeScan(rootHandle.sourceId, cursor);
  },
  async movePhoto(rootHandle, photo, category) {
    if (rootHandle.kind !== 'capacitor-android' || !rootHandle.sourceId) {
      return { success: false, error: '当前来源不是 Android APK 原生目录' };
    }
    return moveNativePhoto(rootHandle.sourceId, photo, category);
  },
  async undoMove(rootHandle, record) {
    if (rootHandle.kind !== 'capacitor-android' || !rootHandle.sourceId) {
      return { success: false, error: '当前来源不是 Android APK 原生目录' };
    }
    return undoNativeMove(rootHandle.sourceId, record);
  },
};

const unsupportedAdapter: PhotoStorageAdapter = {
  id: 'unsupported',
  label: '不支持的浏览器',
  platform: 'unsupported',
  isSupported: () => false,
  unsupportedReason: getUnsupportedReason,
  async selectSource() {
    throw new Error(getUnsupportedReason());
  },
  async movePhoto() {
    return { success: false, error: getUnsupportedReason() };
  },
  async undoMove() {
    return { success: false, error: getUnsupportedReason() };
  },
};

export function getPhotoStorageAdapter(): PhotoStorageAdapter {
  if (nativeAndroidAdapter.isSupported()) return nativeAndroidAdapter;
  return hasFileSystemAccess() ? fileSystemAccessAdapter : unsupportedAdapter;
}

export async function getPhotoPreviewUrl(photo: PhotoEntry, maxSize = 1600): Promise<string> {
  if (photo.fileHandle) {
    const file = await photo.fileHandle.getFile();
    return URL.createObjectURL(file);
  }

  if (photo.storageKind === 'capacitor-android') {
    return getNativePhotoDataUrl(photo, maxSize);
  }

  throw new Error('当前照片没有可用的预览来源');
}
