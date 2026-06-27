import type { PhotoEntry } from './types';
import { getExtension } from './scanner';
import { UNPREVIEWABLE_EXTENSIONS } from './constants';

export async function prepareImage(
  photo: PhotoEntry,
  maxSize: number,
): Promise<string | null> {
  try {
    const ext = getExtension(photo.name);
    if (UNPREVIEWABLE_EXTENSIONS.has(ext)) return null;

    const file = await photo.fileHandle.getFile();
    const url = URL.createObjectURL(file);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64 = dataUrl.split(',')[1];
    return base64 ?? null;
  } catch {
    return null;
  }
}
