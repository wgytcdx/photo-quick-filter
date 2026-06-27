import type { PhotoEntry, Category, MoveResult, ActionRecord, UndoResult } from './types';
import { CATEGORY_DIR_NAMES } from './constants';
import { getDirectoryParts } from './scanner';

async function ensureSubDirs(
  parentDir: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle> {
  let current = parentDir;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

async function findUniqueName(
  dirHandle: FileSystemDirectoryHandle,
  baseName: string,
): Promise<string> {
  try {
    await dirHandle.getFileHandle(baseName);
  } catch {
    return baseName;
  }

  const dotIdx = baseName.lastIndexOf('.');
  const prefix = dotIdx === -1 ? baseName : baseName.slice(0, dotIdx);
  const ext = dotIdx === -1 ? '' : baseName.slice(dotIdx);

  for (let i = 1; i <= 999; i++) {
    const candidate = `${prefix}_${i}${ext}`;
    try {
      await dirHandle.getFileHandle(candidate);
    } catch {
      return candidate;
    }
  }

  const hash = Date.now().toString(36).slice(-4);
  return `${prefix}_${hash}${ext}`;
}

export async function movePhoto(
  rootHandle: FileSystemDirectoryHandle,
  photo: PhotoEntry,
  category: Category,
): Promise<MoveResult> {
  const categoryDirName = CATEGORY_DIR_NAMES[category];

  try {
    const categoryDirHandle = await rootHandle.getDirectoryHandle(categoryDirName, { create: true });
    const dirParts = getDirectoryParts(photo.relativePath);
    const targetDirHandle = await ensureSubDirs(categoryDirHandle, dirParts);
    const targetName = await findUniqueName(targetDirHandle, photo.name);

    const targetFileHandle = await targetDirHandle.getFileHandle(targetName, { create: true });

    let originalFile: File;
    try {
      originalFile = await photo.fileHandle.getFile();
    } catch {
      return { success: false, error: '无法读取原文件，文件可能已被外部删除' };
    }

    const data = await originalFile.arrayBuffer();

    const writable = await targetFileHandle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch {
      try { await writable.abort(); } catch { /* ignore */ }
      return { success: false, error: '写入目标文件失败' };
    }

    try {
      await photo.parentDirHandle.removeEntry(photo.name);
    } catch {
      try {
        await targetDirHandle.removeEntry(targetName);
      } catch {
        return { success: false, error: '原文件删除失败且无法回滚目标文件，请手动检查' };
      }
      return { success: false, error: '原文件删除失败，已回滚' };
    }

    const targetRelativePath = dirParts.length > 0
      ? `${dirParts.join('/')}/${targetName}`
      : targetName;

    return {
      success: true,
      categoryDirHandle,
      targetFileHandle,
      targetRelativePath,
      targetName,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return { success: false, error: `移动文件失败: ${msg}` };
  }
}

export async function undoMove(
  rootHandle: FileSystemDirectoryHandle,
  record: ActionRecord,
): Promise<UndoResult> {
  try {
    const categoryDirName = CATEGORY_DIR_NAMES[record.category];
    const categoryDirHandle = await rootHandle.getDirectoryHandle(categoryDirName);

    const dirParts = getDirectoryParts(record.targetRelativePath);
    const targetDirHandle = await ensureSubDirs(categoryDirHandle, dirParts);

    let targetFile: File;
    try {
      const targetFileHandle = await targetDirHandle.getFileHandle(record.targetName);
      targetFile = await targetFileHandle.getFile();
    } catch {
      return { success: false, error: '无法读取分类目录中的文件，文件可能已被外部删除' };
    }

    const data = await targetFile.arrayBuffer();

    const originalDirParts = getDirectoryParts(record.photo.relativePath);
    const originalParentDir = await ensureSubDirs(rootHandle, originalDirParts);
    const restoredName = await findUniqueName(originalParentDir, record.photo.name);

    const restoredFileHandle = await originalParentDir.getFileHandle(restoredName, { create: true });

    const writable = await restoredFileHandle.createWritable();
    try {
      await writable.write(data);
      await writable.close();
    } catch {
      try { await writable.abort(); } catch { /* ignore */ }
      return { success: false, error: '恢复原文件写入失败' };
    }

    try {
      await targetDirHandle.removeEntry(record.targetName);
    } catch {
      return {
        success: true,
        restoredFileHandle,
        restoredParentDirHandle: originalParentDir,
        restoredName,
        restoredRelativePath: originalDirParts.length > 0
          ? `${originalDirParts.join('/')}/${restoredName}`
          : restoredName,
        error: '文件已恢复到原目录，但从分类目录删除失败，请手动清理',
      };
    }

    const restoredRelativePath = originalDirParts.length > 0
      ? `${originalDirParts.join('/')}/${restoredName}`
      : restoredName;

    return {
      success: true,
      restoredFileHandle,
      restoredParentDirHandle: originalParentDir,
      restoredName,
      restoredRelativePath,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return { success: false, error: `撤销失败: ${msg}` };
  }
}
