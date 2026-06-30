import { describe, it, expect } from 'vitest';
import {
  initialQueueState,
  classify,
  undo,
  computeStats,
  getCurrentPhoto,
  isComplete,
  getRecentActions,
} from '../lib/queue';
import type { PhotoEntry, Category, ActionRecord } from '../lib/types';

function makePhoto(name: string, idx: number): PhotoEntry {
  return {
    id: name,
    storageKind: 'file-system-access',
    name,
    relativePath: name,
    parentDirHandle: {} as FileSystemDirectoryHandle,
    fileHandle: {} as FileSystemFileHandle,
    size: 1000 * idx,
    lastModified: Date.now(),
  };
}

function makeAction(photo: PhotoEntry, originalIndex: number, category: Category): ActionRecord {
  return {
    photo,
    originalIndex,
    category,
    targetDirHandle: {} as FileSystemDirectoryHandle,
    targetName: photo.name,
    targetRelativePath: photo.name,
  };
}

describe('initialQueueState', () => {
  it('returns empty state', () => {
    const state = initialQueueState();
    expect(state.photos).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.undoStack).toEqual([]);
  });
});

describe('getCurrentPhoto', () => {
  it('returns null for empty queue', () => {
    const state = initialQueueState();
    expect(getCurrentPhoto(state)).toBeNull();
  });

  it('returns current photo', () => {
    const photos = [makePhoto('a.jpg', 1), makePhoto('b.jpg', 2)];
    const state = { ...initialQueueState(), photos };
    expect(getCurrentPhoto(state)).toEqual(photos[0]);
  });

  it('returns null when index exceeds length', () => {
    const photos = [makePhoto('a.jpg', 1)];
    const state = { ...initialQueueState(), photos, currentIndex: 1 };
    expect(getCurrentPhoto(state)).toBeNull();
  });
});

describe('classify', () => {
  it('removes photo from list and adds to undo stack', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const photos = [p1, p2];
    const state = { ...initialQueueState(), photos };

    const record = makeAction(p1, 0, 'keep');
    const newState = classify(state, 'keep', record);

    expect(newState.photos).toEqual([p2]);
    expect(newState.currentIndex).toBe(0);
    expect(newState.undoStack).toEqual([record]);
  });

  it('advances correctly when removing middle item', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const p3 = makePhoto('c.jpg', 3);
    const photos = [p1, p2, p3];
    const state = { ...initialQueueState(), photos, currentIndex: 1 };

    const record = makeAction(p2, 1, 'delete');
    const newState = classify(state, 'delete', record);

    expect(newState.photos).toEqual([p1, p3]);
    expect(newState.currentIndex).toBe(1);
    expect(getCurrentPhoto(newState)).toEqual(p3);
  });
});

describe('undo', () => {
  it('re-inserts photo at original position', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const p3 = makePhoto('c.jpg', 3);
    const photos = [p1, p2, p3];
    const state = { ...initialQueueState(), photos, currentIndex: 1 };

    const record = makeAction(p2, 1, 'favorite');
    const classified = classify(state, 'favorite', record);
    expect(classified.photos).toEqual([p1, p3]);

    const undone = undo(classified);
    expect(undone.photos).toEqual([p1, p2, p3]);
    expect(undone.currentIndex).toBe(1);
    expect(undone.undoStack).toEqual([]);
  });

  it('returns same state when undo stack is empty', () => {
    const state = initialQueueState();
    const undone = undo(state);
    expect(undone).toEqual(state);
  });

  it('uses updated photo when provided', () => {
    const p1 = makePhoto('a.jpg', 1);
    const photos = [p1];
    const state = { ...initialQueueState(), photos };
    const record = makeAction(p1, 0, 'keep');
    const classified = classify(state, 'keep', record);

    const updatedPhoto = { ...p1, name: 'a_1.jpg', relativePath: 'a_1.jpg' };
    const undone = undo(classified, updatedPhoto);
    expect(undone.photos[0].name).toBe('a_1.jpg');
  });
});

describe('computeStats', () => {
  it('computes stats from empty state', () => {
    const state = initialQueueState();
    const stats = computeStats(state);
    expect(stats).toEqual({
      total: 0,
      remaining: 0,
      deleteCount: 0,
      keepCount: 0,
      stashCount: 0,
      favoriteCount: 0,
    });
  });

  it('computes stats with classified photos', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const p3 = makePhoto('c.jpg', 3);
    const photos = [p1, p2, p3];
    let state = { ...initialQueueState(), photos };

    state = classify(state, 'delete', makeAction(p1, 0, 'delete'));
    state = classify(state, 'keep', makeAction(p2, 0, 'keep'));

    const stats = computeStats(state);
    expect(stats.total).toBe(3);
    expect(stats.remaining).toBe(1);
    expect(stats.deleteCount).toBe(1);
    expect(stats.keepCount).toBe(1);
    expect(stats.stashCount).toBe(0);
    expect(stats.favoriteCount).toBe(0);
  });

  it('total equals sum of all categories', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const p3 = makePhoto('c.jpg', 3);
    const p4 = makePhoto('d.jpg', 4);
    const photos = [p1, p2, p3, p4];
    let state = { ...initialQueueState(), photos };

    state = classify(state, 'delete', makeAction(p1, 0, 'delete'));
    state = classify(state, 'stash', makeAction(p2, 0, 'stash'));
    state = classify(state, 'favorite', makeAction(p3, 0, 'favorite'));

    const stats = computeStats(state);
    expect(stats.total).toBe(stats.remaining + stats.deleteCount + stats.keepCount + stats.stashCount + stats.favoriteCount);
  });
});

describe('isComplete', () => {
  it('returns true when all photos classified', () => {
    const p1 = makePhoto('a.jpg', 1);
    const photos = [p1];
    const state = classify(
      { ...initialQueueState(), photos },
      'keep',
      makeAction(p1, 0, 'keep'),
    );
    expect(isComplete(state)).toBe(true);
  });

  it('returns false when photos remain', () => {
    const photos = [makePhoto('a.jpg', 1)];
    const state = { ...initialQueueState(), photos };
    expect(isComplete(state)).toBe(false);
  });
});

describe('getRecentActions', () => {
  it('returns last N actions in reverse order', () => {
    const p1 = makePhoto('a.jpg', 1);
    const p2 = makePhoto('b.jpg', 2);
    const p3 = makePhoto('c.jpg', 3);
    let state = { ...initialQueueState(), photos: [p1, p2, p3] };

    state = classify(state, 'delete', makeAction(p1, 0, 'delete'));
    state = classify(state, 'keep', makeAction(p2, 0, 'keep'));
    state = classify(state, 'stash', makeAction(p3, 0, 'stash'));

    const recent = getRecentActions(state, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].category).toBe('stash');
    expect(recent[1].category).toBe('keep');
  });
});
