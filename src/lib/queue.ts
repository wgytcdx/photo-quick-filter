import type { QueueState, Stats, Category, ActionRecord } from './types';

export function initialQueueState(): QueueState {
  return {
    photos: [],
    currentIndex: 0,
    undoStack: [],
  };
}

export function getCurrentPhoto(state: QueueState): ActionRecord['photo'] | null {
  if (state.currentIndex >= state.photos.length) return null;
  return state.photos[state.currentIndex];
}

export function classify(state: QueueState, _category: Category, record: ActionRecord): QueueState {
  const newPhotos = [...state.photos];
  newPhotos.splice(state.currentIndex, 1);
  return {
    photos: newPhotos,
    currentIndex: state.currentIndex,
    undoStack: [...state.undoStack, record],
  };
}

export function undo(state: QueueState, updatedPhoto?: ActionRecord['photo']): QueueState {
  if (state.undoStack.length === 0) return state;

  const lastRecord = state.undoStack[state.undoStack.length - 1];
  const photoToInsert = updatedPhoto ?? lastRecord.photo;

  const newPhotos = [...state.photos];
  newPhotos.splice(lastRecord.originalIndex, 0, photoToInsert);

  const newUndoStack = state.undoStack.slice(0, -1);

  return {
    photos: newPhotos,
    currentIndex: lastRecord.originalIndex,
    undoStack: newUndoStack,
  };
}

export function computeStats(state: QueueState): Stats {
  const remaining = state.photos.length;
  const undoStack = state.undoStack;

  let deleteCount = 0;
  let keepCount = 0;
  let stashCount = 0;
  let favoriteCount = 0;

  for (const record of undoStack) {
    switch (record.category) {
      case 'delete': deleteCount++; break;
      case 'keep': keepCount++; break;
      case 'stash': stashCount++; break;
      case 'favorite': favoriteCount++; break;
    }
  }

  return {
    total: remaining + deleteCount + keepCount + stashCount + favoriteCount,
    remaining,
    deleteCount,
    keepCount,
    stashCount,
    favoriteCount,
  };
}

export function isComplete(state: QueueState): boolean {
  return state.currentIndex >= state.photos.length;
}

export function getRecentActions(state: QueueState, count: number): ActionRecord[] {
  return state.undoStack.slice(-count).reverse();
}
