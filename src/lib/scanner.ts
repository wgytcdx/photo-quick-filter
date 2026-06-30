import type { PhotoEntry } from './types';
import { EXCLUDED_DIRS, PHOTO_EXTENSIONS } from './constants';
import { naturalCompare } from './natural-sort';

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx + 1).toLowerCase();
}

function isPhotoFile(filename: string): boolean {
  return PHOTO_EXTENSIONS.has(getExtension(filename));
}

async function getPhotoMetadata(
  fileHandle: FileSystemFileHandle,
): Promise<{ size: number; lastModified: number } | null> {
  try {
    const file = await fileHandle.getFile();
    return { size: file.size, lastModified: file.lastModified };
  } catch {
    return null;
  }
}

export async function scanDirectory(
  rootHandle: FileSystemDirectoryHandle,
): Promise<PhotoEntry[]> {
  const photos: PhotoEntry[] = [];
  await recurseScan(rootHandle, '', rootHandle, photos);
  photos.sort((a, b) => naturalCompare(a.relativePath, b.relativePath));
  return photos;
}

async function recurseScan(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string,
  rootHandle: FileSystemDirectoryHandle,
  photos: PhotoEntry[],
): Promise<void> {
  for await (const [name, handle] of dirHandle.entries()) {
    if (EXCLUDED_DIRS.has(name)) continue;

    if (handle.kind === 'directory') {
      const dirHandle = handle as FileSystemDirectoryHandle;
      const subPath = currentPath === '' ? name : `${currentPath}/${name}`;
      await recurseScan(dirHandle, subPath, rootHandle, photos);
    } else if (handle.kind === 'file' && isPhotoFile(name)) {
      const fileHandle = handle as FileSystemFileHandle;
      const metadata = await getPhotoMetadata(fileHandle);
      if (!metadata) continue;

      const relativePath = currentPath === '' ? name : `${currentPath}/${name}`;
      photos.push({
        id: relativePath,
        storageKind: 'file-system-access',
        name,
        relativePath,
        parentDirHandle: dirHandle,
        fileHandle,
        size: metadata.size,
        lastModified: metadata.lastModified,
      });
    }
  }
}

export function getDirectoryParts(relativePath: string): string[] {
  const idx = relativePath.lastIndexOf('/');
  if (idx === -1) return [];
  return relativePath.slice(0, idx).split('/');
}

export function getFileName(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  if (idx === -1) return relativePath;
  return relativePath.slice(idx + 1);
}
