import type { Category } from './types';

export const CATEGORY_DIR_NAMES: Record<Category, string> = {
  delete: '_delete_review',
  keep: '_keep',
  stash: '_stash',
  favorite: '_favorite',
};

export const EXCLUDED_DIRS = new Set(Object.values(CATEGORY_DIR_NAMES));

export const PHOTO_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif',
]);

export const UNPREVIEWABLE_EXTENSIONS = new Set(['heic', 'heif']);

export const CATEGORY_LABELS: Record<Category, string> = {
  delete: '待删除',
  keep: '保留',
  stash: '暂存',
  favorite: '精选',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  delete: '#e74c3c',
  keep: '#2ecc71',
  stash: '#f39c12',
  favorite: '#9b59b6',
};

export const CATEGORY_KEYS: Record<Category, string> = {
  delete: '↑',
  keep: '↓',
  stash: '←',
  favorite: '→',
};

export const KEY_TO_CATEGORY: Record<string, Category> = {
  ArrowUp: 'delete',
  ArrowDown: 'keep',
  ArrowLeft: 'stash',
  ArrowRight: 'favorite',
};
