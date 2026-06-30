import type { ActionRecord, Category, MoveResult, PhotoEntry, UndoResult } from './types';
import { scanDirectory } from './scanner';
import { movePhoto, undoMove } from './mover';

export interface PhotoStorageSource {
  rootHandle: FileSystemDirectoryHandle;
  folderName: string;
  photos: PhotoEntry[];
  warning?: string;
}

export interface PhotoStorageAdapter {
  id: string;
  label: string;
  platform: 'desktop' | 'android-web' | 'unsupported';
  isSupported: () => boolean;
  unsupportedReason: () => string;
  selectSource: () => Promise<PhotoStorageSource>;
  movePhoto: (
    rootHandle: FileSystemDirectoryHandle,
    photo: PhotoEntry,
    category: Category,
  ) => Promise<MoveResult>;
  undoMove: (
    rootHandle: FileSystemDirectoryHandle,
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
      rootHandle,
      folderName: rootHandle.name,
      photos,
      warning: isAndroidBrowser()
        ? '安卓网页模式已通过目录写入/删除验证。请确认系统相册稍后能识别分类目录中的文件。'
        : undefined,
    };
  },
  movePhoto,
  undoMove,
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
  return hasFileSystemAccess() ? fileSystemAccessAdapter : unsupportedAdapter;
}
