import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, Category, PhotoEntry, ActionRecord, QueueState, BatchMoveState, ScanState } from './types';
import type { AiConfig, AiPreprocessState, AiPhotoAnalysis, AiSuggestion, AiUsage } from './ai-types';
import { initialQueueState, classify, undo, computeStats, getCurrentPhoto, isComplete, getRecentActions } from './queue';
import { getPhotoStorageAdapter } from './photo-storage';
import { analyzeOnePhoto } from './ai-engine';
import { UNPREVIEWABLE_EXTENSIONS } from './constants';
import { getExtension } from './scanner';

const SCAN_PAGE_SIZE = 200;

const INITIAL_SCAN_STATE: ScanState = {
  phase: 'idle',
  scannedCount: 0,
  totalBytes: 0,
  errors: [],
  cursor: null,
};

const INITIAL_BATCH_MOVE_STATE: BatchMoveState = {
  phase: 'idle',
  total: 0,
  processed: 0,
  rolledBack: 0,
  errors: [],
  currentPhoto: '',
};

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

function removeAt(queue: QueueState, index: number, record: ActionRecord): QueueState {
  const photos = [...queue.photos];
  photos.splice(index, 1);
  return {
    photos,
    currentIndex: index < queue.currentIndex ? Math.max(0, queue.currentIndex - 1) : queue.currentIndex,
    undoStack: [...queue.undoStack, record],
  };
}

function mergeUsage(acc: AiUsage, usage?: AiUsage): AiUsage {
  if (!usage) return acc;
  return {
    promptTokens: acc.promptTokens + usage.promptTokens,
    completionTokens: acc.completionTokens + usage.completionTokens,
    totalTokens: acc.totalTokens + usage.totalTokens,
  };
}

function makeRestoredPhoto(record: ActionRecord, restored?: PhotoEntry): PhotoEntry {
  return restored ?? record.photo;
}

export function useAppState() {
  const storageAdapter = getPhotoStorageAdapter();
  const [state, setState] = useState<AppState>(() => ({
    rootHandle: null,
    folderName: '',
    queue: initialQueueState(),
    moving: false,
    error: null,
    browserSupported: storageAdapter.isSupported(),
    scanState: INITIAL_SCAN_STATE,
    batchMoveState: INITIAL_BATCH_MOVE_STATE,
  }));

  const [aiState, setAiState] = useState<AiPreprocessState>(INITIAL_AI_STATE);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion>>({});
  const [showAiPanel, setShowAiPanel] = useState(false);

  const rootHandleRef = useRef(state.rootHandle);
  useEffect(() => { rootHandleRef.current = state.rootHandle; }, [state.rootHandle]);

  const queueRef = useRef(state.queue);
  useEffect(() => { queueRef.current = state.queue; }, [state.queue]);

  const scanCancelRef = useRef(false);
  const scanCursorRef = useRef<string | null>(null);
  const scanRunIdRef = useRef(0);
  const aiCancelKeepResultsRef = useRef(true);
  const batchMoveCancelRef = useRef({ requested: false, rollback: false });

  const selectFolder = useCallback(async () => {
    try {
      const activeScanRunId = scanRunIdRef.current + 1;
      scanRunIdRef.current = activeScanRunId;
      scanCancelRef.current = false;
      scanCursorRef.current = null;
      const source = await storageAdapter.selectSource();
      const initialTotalBytes = source.photos.reduce((sum, photo) => sum + photo.size, 0);
      const needsPagedScan = Boolean(storageAdapter.scanPhotos);

      setState({
        rootHandle: source.rootHandle,
        folderName: source.folderName,
        queue: { photos: source.photos, currentIndex: 0, undoStack: [] },
        moving: false,
        error: source.warning ?? null,
        browserSupported: storageAdapter.isSupported(),
        scanState: needsPagedScan
          ? { phase: 'scanning', scannedCount: source.photos.length, totalBytes: initialTotalBytes, errors: [], cursor: null }
          : { phase: 'done', scannedCount: source.photos.length, totalBytes: initialTotalBytes, errors: [], cursor: null },
        batchMoveState: INITIAL_BATCH_MOVE_STATE,
      });
      setAiState(INITIAL_AI_STATE);
      setAiSuggestions({});
      setShowAiPanel(false);

      if (!storageAdapter.scanPhotos) {
        if (source.photos.length === 0) {
          setState(prev => ({ ...prev, error: '所选文件夹中没有照片文件' }));
        }
        return;
      }

      let cursor: string | null = null;
      let foundPhotos = source.photos.length;
      let latestTotalBytes = initialTotalBytes;
      const scanErrors: string[] = [];

      while (!scanCancelRef.current) {
        const batch = await storageAdapter.scanPhotos(source.rootHandle, cursor, SCAN_PAGE_SIZE);
        if (activeScanRunId !== scanRunIdRef.current) return;
        cursor = batch.nextCursor;
        scanCursorRef.current = cursor;
        foundPhotos = batch.scannedCount;
        latestTotalBytes = batch.totalBytes;
        scanErrors.push(...batch.errors);

        setState(prev => ({
          ...prev,
          queue: {
            ...prev.queue,
            photos: [...prev.queue.photos, ...batch.photos],
          },
          scanState: {
            phase: batch.cancelled ? 'cancelled' : batch.done ? 'done' : 'scanning',
            scannedCount: batch.scannedCount,
            totalBytes: batch.totalBytes,
            errors: [...scanErrors],
            cursor,
          },
          error: batch.errors.length > 0
            ? `部分目录扫描失败: ${batch.errors.slice(0, 3).join('; ')}`
            : prev.error,
        }));

        if (batch.done || batch.cancelled) break;
      }

      if (scanCancelRef.current) {
        setState(prev => ({
          ...prev,
          scanState: { ...prev.scanState, phase: 'cancelled' },
          error: prev.queue.photos.length === 0 ? '已取消扫描，当前未加载照片' : prev.error,
        }));
        return;
      }

      if (foundPhotos === 0) {
        setState(prev => ({
          ...prev,
          scanState: { phase: 'done', scannedCount: 0, totalBytes: latestTotalBytes, errors: scanErrors, cursor: null },
          error: '所选文件夹中没有照片文件',
        }));
      }
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === 'AbortError') return;
        setState(prev => ({
          ...prev,
          scanState: { ...prev.scanState, phase: 'error' },
          error: `选择或扫描文件夹失败: ${e.message}`,
        }));
      }
    }
  }, [storageAdapter]);

  const cancelScan = useCallback(async () => {
    scanCancelRef.current = true;
    scanRunIdRef.current += 1;
    const rootHandle = rootHandleRef.current;
    const cursor = scanCursorRef.current;
    if (rootHandle && storageAdapter.cancelScan) {
      await storageAdapter.cancelScan(rootHandle, cursor);
    }
    setState(prev => ({
      ...prev,
      scanState: { ...prev.scanState, phase: 'cancelled' },
    }));
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
      targetDirHandle: result.categoryDirHandle,
      targetUri: result.targetUri,
      targetName: result.targetName ?? photo.name,
      targetRelativePath: result.targetRelativePath ?? photo.relativePath,
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
      targetDirHandle: result.categoryDirHandle,
      targetUri: result.targetUri,
      targetName: result.targetName ?? photo.name,
      targetRelativePath: result.targetRelativePath ?? photo.relativePath,
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

    const photosToAdopt = queueRef.current.photos.filter(
      p => aiSuggestions[p.relativePath]?.bucket === bucket,
    );

    if (photosToAdopt.length === 0) return;

    batchMoveCancelRef.current = { requested: false, rollback: false };
    setState(prev => ({
      ...prev,
      moving: true,
      error: null,
      batchMoveState: {
        phase: 'running',
        total: photosToAdopt.length,
        processed: 0,
        rolledBack: 0,
        errors: [],
        currentPhoto: '',
      },
    }));

    let workingQueue = { ...queueRef.current, photos: [...queueRef.current.photos], undoStack: [...queueRef.current.undoStack] };
    const completedRecords: ActionRecord[] = [];
    const adoptedPaths: string[] = [];
    const errors: string[] = [];

    for (const photo of photosToAdopt) {
      if (batchMoveCancelRef.current.requested) break;

      const suggestion = aiSuggestions[photo.relativePath];
      if (!suggestion) continue;
      const idx = workingQueue.photos.findIndex(p => p.relativePath === photo.relativePath);
      if (idx === -1) continue;

      setState(prev => ({
        ...prev,
        batchMoveState: { ...prev.batchMoveState, currentPhoto: photo.name },
      }));

      const result = await storageAdapter.movePhoto(rootHandle, photo, bucket);
      if (!result.success) {
        errors.push(`${photo.name}: ${result.error ?? '移动失败'}`);
        setState(prev => ({
          ...prev,
          batchMoveState: {
            ...prev.batchMoveState,
            processed: prev.batchMoveState.processed + 1,
            errors: [...errors],
          },
        }));
        continue;
      }

      const record: ActionRecord = {
        photo,
        originalIndex: idx,
        category: bucket,
        targetDirHandle: result.categoryDirHandle,
        targetUri: result.targetUri,
        targetName: result.targetName ?? photo.name,
        targetRelativePath: result.targetRelativePath ?? photo.relativePath,
        isAiAdopted: true,
        aiBucket: bucket,
        aiConfidence: suggestion.confidence,
        aiReason: suggestion.reason,
      };

      completedRecords.push(record);
      adoptedPaths.push(photo.relativePath);
      workingQueue = removeAt(workingQueue, idx, record);

      setState(prev => ({
        ...prev,
        queue: workingQueue,
        batchMoveState: {
          ...prev.batchMoveState,
          processed: prev.batchMoveState.processed + 1,
          errors: [...errors],
        },
      }));
    }

    if (batchMoveCancelRef.current.requested && batchMoveCancelRef.current.rollback) {
      setState(prev => ({
        ...prev,
        batchMoveState: { ...prev.batchMoveState, phase: 'rollback', currentPhoto: '' },
      }));

      for (let i = completedRecords.length - 1; i >= 0; i--) {
        const record = completedRecords[i];
        const result = await storageAdapter.undoMove(rootHandle, record);
        if (!result.success) {
          errors.push(`${record.photo.name}: ${result.error ?? '回滚失败'}`);
          continue;
        }
        workingQueue = undo(workingQueue, makeRestoredPhoto(record, result.restoredPhoto));
        setState(prev => ({
          ...prev,
          queue: workingQueue,
          batchMoveState: {
            ...prev.batchMoveState,
            rolledBack: prev.batchMoveState.rolledBack + 1,
            errors: [...errors],
          },
        }));
      }
    } else {
      setAiSuggestions(prev => {
        const next = { ...prev };
        for (const path of adoptedPaths) delete next[path];
        return next;
      });
    }

    const wasCancelled = batchMoveCancelRef.current.requested;
    const didRollback = wasCancelled && batchMoveCancelRef.current.rollback;

    setState(prev => ({
      ...prev,
      queue: workingQueue,
      moving: false,
      batchMoveState: {
        ...prev.batchMoveState,
        phase: errors.length > 0 ? 'error' : 'done',
        currentPhoto: '',
        errors: [...errors],
      },
      error: errors.length > 0
        ? `${didRollback ? '回滚存在失败项' : wasCancelled ? '已取消，部分操作存在失败项' : '部分采纳失败'}: ${errors.slice(0, 5).join('; ')}`
        : didRollback
          ? '已取消并回滚本次已完成移动'
          : wasCancelled
            ? '已取消，已完成移动已保留'
            : null,
    }));
  }, [state.moving, aiSuggestions, storageAdapter]);

  const cancelBatchMove = useCallback(() => {
    if (state.batchMoveState.phase !== 'running') return;
    const keepCompleted = window.confirm('取消批量移动：点击“确定”保留已完成操作；点击“取消”回滚本次已完成操作。');
    batchMoveCancelRef.current = { requested: true, rollback: !keepCompleted };
    setState(prev => ({
      ...prev,
      batchMoveState: { ...prev.batchMoveState, phase: keepCompleted ? 'cancelling' : 'rollback' },
    }));
  }, [state.batchMoveState.phase]);

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
    if (result.restoredPhoto) updatedPhoto = result.restoredPhoto;
    if (result.restoredFileHandle) updatedPhoto = { ...updatedPhoto, fileHandle: result.restoredFileHandle };
    if (result.restoredParentDirHandle) updatedPhoto = { ...updatedPhoto, parentDirHandle: result.restoredParentDirHandle };
    if (result.restoredName) updatedPhoto = { ...updatedPhoto, name: result.restoredName };
    if (result.restoredRelativePath) updatedPhoto = { ...updatedPhoto, id: result.restoredRelativePath, relativePath: result.restoredRelativePath };

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

    const initialPhotos = [...queueRef.current.photos];
    const total = initialPhotos.length;
    const abortController = new AbortController();
    const concurrency = Math.max(1, Math.min(10, Math.floor(config.concurrency || 10)));
    aiCancelKeepResultsRef.current = true;

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
    const jobSuggestionPaths = new Set<string>();
    let nextIndex = 0;
    let suggestedCount = 0;
    let failedCount = 0;
    let accUsage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const photoOrder = new Map(initialPhotos.map((photo, index) => [photo.relativePath, index]));

    const runWorker = async () => {
      while (!abortController.signal.aborted) {
        const index = nextIndex++;
        const photo = initialPhotos[index];
        if (!photo) return;

        setAiState(prev => ({ ...prev, currentPhoto: `并发 ${concurrency}，正在分析 ${photo.name}` }));
        const analysis = await analyzeOnePhoto(config, prompt, photo, abortController.signal);
        if (abortController.signal.aborted && analysis.error === '已取消') return;

        accUsage = mergeUsage(accUsage, analysis.usage);

        if (analysis.error) {
          failedCount++;
        } else if (analysis.suggestion) {
          suggestedCount++;
          jobSuggestionPaths.add(photo.relativePath);
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
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => runWorker()));

    const finalPhase = abortController.signal.aborted ? 'cancelled' : 'results';
    const finalAnalyses = [...allAnalyses].sort((a, b) => {
      const aIndex = photoOrder.get(a.photo.relativePath) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = photoOrder.get(b.photo.relativePath) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
    if (abortController.signal.aborted && !aiCancelKeepResultsRef.current) {
      setAiSuggestions(prev => {
        const next = { ...prev };
        for (const path of jobSuggestionPaths) delete next[path];
        return next;
      });
    }

    setState(prev => ({ ...prev, moving: false }));
    setAiState(prev => ({
      ...prev,
      running: false,
      phase: finalPhase,
      currentPhoto: '',
      abortController: null,
      analyses: finalAnalyses,
      totalUsage: accUsage,
    }));
  }, []);

  const cancelAiPreprocess = useCallback(() => {
    if (!aiState.abortController) return;
    aiCancelKeepResultsRef.current = window.confirm('取消 AI 预筛选：点击“确定”保留已完成建议；点击“取消”清除本次任务已生成建议。');
    aiState.abortController.abort();
    setAiState(prev => ({
      ...prev,
      currentPhoto: aiCancelKeepResultsRef.current ? '正在取消，保留已完成建议...' : '正在取消，稍后清除本次建议...',
    }));
  }, [aiState.abortController]);

  const clearAiSuggestions = useCallback(() => {
    setAiSuggestions({});
    setAiState(INITIAL_AI_STATE);
  }, []);

  const stats = computeStats(state.queue);
  const currentPhoto = getCurrentPhoto(state.queue);
  const scanRunning = state.scanState.phase === 'scanning';
  const complete = !scanRunning && isComplete(state.queue);
  const recentActions = getRecentActions(state.queue, 5);
  const hasUndo = state.queue.undoStack.length > 0;
  const currentSuggestion = currentPhoto ? aiSuggestions[currentPhoto.relativePath] : null;

  const suggestionStats = computeSuggestionStats(aiSuggestions, state.queue.photos);

  return {
    ...state,
    stats,
    currentPhoto,
    complete,
    scanRunning,
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
    cancelScan,
    classifyPhoto,
    adoptSuggestion,
    adoptAllByBucket,
    cancelBatchMove,
    undoAction,
    startAiPreprocess,
    cancelAiPreprocess,
    clearAiSuggestions,
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
