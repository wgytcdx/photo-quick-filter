import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, Category, PhotoEntry, ActionRecord } from './types';
import type { AiConfig, AiPreprocessState, AiPhotoAnalysis, AiSuggestion } from './ai-types';
import { initialQueueState, classify, undo, computeStats, getCurrentPhoto, isComplete, getRecentActions } from './queue';
import { getPhotoStorageAdapter } from './photo-storage';
import { analyzeOnePhoto } from './ai-engine';
import { UNPREVIEWABLE_EXTENSIONS } from './constants';
import { getExtension } from './scanner';

const INITIAL_AI_STATE: AiPreprocessState = {
  phase: 'config',
  running: false,
  total: 0,
  processed: 0,
  suggested: 0,
  failed: 0,
  analyses: [],
  currentPhoto: '',
  abortController: null,
  totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
};

export function useAppState() {
  const storageAdapter = getPhotoStorageAdapter();
  const [state, setState] = useState<AppState>(() => ({
    rootHandle: null,
    folderName: '',
    queue: initialQueueState(),
    moving: false,
    error: null,
    browserSupported: storageAdapter.isSupported(),
  }));

  const [aiState, setAiState] = useState<AiPreprocessState>(INITIAL_AI_STATE);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion>>({});
  const [showAiPanel, setShowAiPanel] = useState(false);

  const rootHandleRef = useRef(state.rootHandle);
  useEffect(() => { rootHandleRef.current = state.rootHandle; }, [state.rootHandle]);

  const queueRef = useRef(state.queue);
  useEffect(() => { queueRef.current = state.queue; }, [state.queue]);

  const selectFolder = useCallback(async () => {
    try {
      const source = await storageAdapter.selectSource();
      if (source.photos.length === 0) {
        setState(prev => ({ ...prev, error: '所选文件夹中没有照片文件' }));
        return;
      }
      setState({
        rootHandle: source.rootHandle,
        folderName: source.folderName,
        queue: { photos: source.photos, currentIndex: 0, undoStack: [] },
        moving: false,
        error: source.warning ?? null,
        browserSupported: storageAdapter.isSupported(),
      });
      setAiState(INITIAL_AI_STATE);
      setAiSuggestions({});
      setShowAiPanel(false);
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === 'AbortError') return;
        setState(prev => ({ ...prev, error: `选择文件夹失败: ${e.message}` }));
      }
    }
  }, [storageAdapter]);

  const classifyPhoto = useCallback(async (category: Category) => {
    const current = state.queue;
    const photo = getCurrentPhoto(current);
    const rootHandle = state.rootHandle;

    if (!photo || !rootHandle || state.moving || isComplete(current)) return;

    setState(prev => ({ ...prev, moving: true, error: null }));

    const result = await storageAdapter.movePhoto(rootHandle, photo, category);

    if (!result.success) {
      setState(prev => ({ ...prev, moving: false, error: result.error ?? '移动失败' }));
      return;
    }

    const record: ActionRecord = {
      photo,
      originalIndex: current.currentIndex,
      category,
      targetDirHandle: result.categoryDirHandle!,
      targetName: result.targetName!,
      targetRelativePath: result.targetRelativePath!,
    };

    setState(prev => ({
      ...prev,
      queue: classify(prev.queue, category, record),
      moving: false,
    }));

    setAiSuggestions(prev => {
      const next = { ...prev };
      delete next[photo.relativePath];
      return next;
    });
  }, [state.queue, state.rootHandle, state.moving, storageAdapter]);

  const adoptSuggestion = useCallback(async () => {
    const current = state.queue;
    const photo = getCurrentPhoto(current);
    const rootHandle = state.rootHandle;
    const suggestion = aiSuggestions[photo?.relativePath ?? ''];

    if (!photo || !rootHandle || !suggestion || state.moving || isComplete(current)) return;

    setState(prev => ({ ...prev, moving: true, error: null }));

    const result = await storageAdapter.movePhoto(rootHandle, photo, suggestion.bucket);

    if (!result.success) {
      setState(prev => ({ ...prev, moving: false, error: result.error ?? '移动失败' }));
      return;
    }

    const record: ActionRecord = {
      photo,
      originalIndex: current.currentIndex,
      category: suggestion.bucket,
      targetDirHandle: result.categoryDirHandle!,
      targetName: result.targetName!,
      targetRelativePath: result.targetRelativePath!,
      isAiAdopted: true,
      aiBucket: suggestion.bucket,
      aiConfidence: suggestion.confidence,
      aiReason: suggestion.reason,
    };

    setState(prev => ({
      ...prev,
      queue: classify(prev.queue, suggestion.bucket, record),
      moving: false,
    }));

    setAiSuggestions(prev => {
      const next = { ...prev };
      delete next[photo.relativePath];
      return next;
    });
  }, [state.queue, state.rootHandle, state.moving, aiSuggestions, storageAdapter]);

  const adoptAllByBucket = useCallback(async (bucket: Category) => {
    const rootHandle = rootHandleRef.current;
    if (!rootHandle || state.moving) return;

    const photosToAdopt = state.queue.photos.filter(
      p => aiSuggestions[p.relativePath]?.bucket === bucket,
    );

    if (photosToAdopt.length === 0) return;

    setState(prev => ({ ...prev, moving: true, error: null }));

    let workingQueue = { ...state.queue, photos: [...state.queue.photos], undoStack: [...state.queue.undoStack] };
    const errors: string[] = [];

    for (const photo of photosToAdopt) {
      const suggestion = aiSuggestions[photo.relativePath];
      const idx = workingQueue.photos.findIndex(p => p.relativePath === photo.relativePath);
      if (idx === -1) continue;

      const result = await storageAdapter.movePhoto(rootHandle, photo, bucket);
      if (!result.success) {
        errors.push(`${photo.name}: ${result.error ?? '移动失败'}`);
        continue;
      }

      const record: ActionRecord = {
        photo,
        originalIndex: idx,
        category: bucket,
        targetDirHandle: result.categoryDirHandle!,
        targetName: result.targetName!,
        targetRelativePath: result.targetRelativePath!,
        isAiAdopted: true,
        aiBucket: bucket,
        aiConfidence: suggestion.confidence,
        aiReason: suggestion.reason,
      };

      workingQueue = classify(workingQueue, bucket, record);
    }

    setState(prev => ({
      ...prev,
      queue: workingQueue,
      moving: false,
      error: errors.length > 0 ? `部分采纳失败: ${errors.join('; ')}` : null,
    }));

    const adoptedPaths = photosToAdopt.map(p => p.relativePath);
    setAiSuggestions(prev => {
      const next = { ...prev };
      for (const path of adoptedPaths) delete next[path];
      return next;
    });
  }, [state.queue, state.moving, aiSuggestions, storageAdapter]);

  const undoAction = useCallback(async () => {
    const current = state.queue;
    const rootHandle = state.rootHandle;

    if (current.undoStack.length === 0 || !rootHandle || state.moving) return;

    setState(prev => ({ ...prev, moving: true, error: null }));

    const lastRecord = current.undoStack[current.undoStack.length - 1];
    const result = await storageAdapter.undoMove(rootHandle, lastRecord);

    if (!result.success) {
      setState(prev => ({ ...prev, moving: false, error: result.error ?? '撤销失败' }));
      return;
    }

    let updatedPhoto: PhotoEntry = { ...lastRecord.photo };
    if (result.restoredFileHandle) updatedPhoto = { ...updatedPhoto, fileHandle: result.restoredFileHandle };
    if (result.restoredParentDirHandle) updatedPhoto = { ...updatedPhoto, parentDirHandle: result.restoredParentDirHandle };
    if (result.restoredName) updatedPhoto = { ...updatedPhoto, name: result.restoredName };
    if (result.restoredRelativePath) updatedPhoto = { ...updatedPhoto, relativePath: result.restoredRelativePath };

    setState(prev => ({
      ...prev,
      queue: undo(prev.queue, updatedPhoto),
      moving: false,
      error: result.error ?? null,
    }));

    if (lastRecord.isAiAdopted && lastRecord.aiBucket && lastRecord.aiConfidence && lastRecord.aiReason) {
      setAiSuggestions(prev => ({
        ...prev,
        [updatedPhoto.relativePath]: {
          bucket: lastRecord.aiBucket!,
          confidence: lastRecord.aiConfidence!,
          reason: lastRecord.aiReason!,
        },
      }));
    }
  }, [state.queue, state.rootHandle, state.moving, storageAdapter]);

  const startAiPreprocess = useCallback(async (config: AiConfig, prompt: string) => {
    const rootHandle = rootHandleRef.current;
    if (!rootHandle) return;

    const initialPhotos = queueRef.current.photos;
    const total = initialPhotos.length;
    const abortController = new AbortController();

    setState(prev => ({ ...prev, moving: true, error: null }));
    setAiState({
      phase: 'progress',
      running: true,
      total,
      processed: 0,
      suggested: 0,
      failed: 0,
      analyses: [],
      currentPhoto: '',
      abortController,
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const allAnalyses: AiPhotoAnalysis[] = [];
    let suggestedCount = 0;
    let failedCount = 0;
    let accUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    for (const photo of initialPhotos) {
      if (abortController.signal.aborted) break;

      setAiState(prev => ({ ...prev, currentPhoto: photo.name }));

      const analysis = await analyzeOnePhoto(config, prompt, photo, abortController.signal);

      if (analysis.usage) {
        accUsage = {
          promptTokens: accUsage.promptTokens + analysis.usage.promptTokens,
          completionTokens: accUsage.completionTokens + analysis.usage.completionTokens,
          totalTokens: accUsage.totalTokens + analysis.usage.totalTokens,
        };
      }

      if (analysis.error) {
        failedCount++;
      } else if (analysis.suggestion) {
        suggestedCount++;
        setAiSuggestions(prev => ({
          ...prev,
          [photo.relativePath]: analysis.suggestion!,
        }));
      }

      allAnalyses.push(analysis);

      setAiState(prev => ({
        ...prev,
        processed: prev.processed + 1,
        suggested: suggestedCount,
        failed: failedCount,
        analyses: [...allAnalyses],
        totalUsage: accUsage,
      }));
    }

    const finalPhase = abortController.signal.aborted ? 'cancelled' : 'results';

    setState(prev => ({ ...prev, moving: false }));
    setAiState(prev => ({
      ...prev,
      running: false,
      phase: finalPhase,
      currentPhoto: '',
      abortController: null,
      totalUsage: accUsage,
    }));
  }, []);

  const cancelAiPreprocess = useCallback(() => {
    if (aiState.abortController) aiState.abortController.abort();
  }, [aiState.abortController]);

  const stats = computeStats(state.queue);
  const currentPhoto = getCurrentPhoto(state.queue);
  const complete = isComplete(state.queue);
  const recentActions = getRecentActions(state.queue, 5);
  const hasUndo = state.queue.undoStack.length > 0;
  const currentSuggestion = currentPhoto ? aiSuggestions[currentPhoto.relativePath] : null;

  const suggestionStats = computeSuggestionStats(aiSuggestions, state.queue.photos);

  return {
    ...state,
    stats,
    currentPhoto,
    complete,
    recentActions,
    hasUndo,
    aiState,
    aiSuggestions,
    currentSuggestion,
    suggestionStats,
    showAiPanel,
    storageAdapter,
    storageUnsupportedReason: storageAdapter.unsupportedReason(),
    selectFolder,
    classifyPhoto,
    adoptSuggestion,
    adoptAllByBucket,
    undoAction,
    startAiPreprocess,
    cancelAiPreprocess,
    setShowAiPanel,
    clearError: useCallback(() => setState(prev => ({ ...prev, error: null })), []),
  };
}

function computeSuggestionStats(
  suggestions: Record<string, AiSuggestion>,
  photos: PhotoEntry[],
) {
  let deleteCount = 0;
  let keepCount = 0;
  let stashCount = 0;
  let favoriteCount = 0;
  let heicCount = 0;

  for (const photo of photos) {
    const s = suggestions[photo.relativePath];
    if (!s) {
      if (UNPREVIEWABLE_EXTENSIONS.has(getExtension(photo.name))) heicCount++;
      continue;
    }
    switch (s.bucket) {
      case 'delete': deleteCount++; break;
      case 'keep': keepCount++; break;
      case 'stash': stashCount++; break;
      case 'favorite': favoriteCount++; break;
    }
  }

  const totalSuggested = deleteCount + keepCount + stashCount + favoriteCount;
  const unsuggested = photos.length - totalSuggested;

  return { deleteCount, keepCount, stashCount, favoriteCount, totalSuggested, unsuggested, heicCount };
}
