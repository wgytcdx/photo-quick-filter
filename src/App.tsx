import { useEffect, useRef, type ReactNode } from 'react';
import type { Category } from './lib/types';
import { useAppState } from './lib/useAppState';
import { useAiConfig } from './lib/useAiConfig';
import { KEY_TO_CATEGORY } from './lib/constants';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { PhotoViewer } from './components/PhotoViewer';
import { ActionBar } from './components/ActionBar';
import { RecentActions } from './components/RecentActions';
import { CompletionView } from './components/CompletionView';
import { ErrorBanner } from './components/ErrorBanner';
import { WelcomeView, UnsupportedView } from './components/WelcomeView';
import { AiPanel } from './components/AiPanel';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ScanPanel({ count, bytes, phase, onCancel }: {
  count: number;
  bytes: number;
  phase: string;
  onCancel: () => void;
}): ReactNode {
  return (
    <div className="scan-panel">
      <h2>{phase === 'scanning' ? '正在分批读取照片' : '照片读取已暂停'}</h2>
      <div className="scan-stats">
        <span><strong>{count}</strong> 张</span>
        <span><strong>{formatBytes(bytes)}</strong></span>
      </div>
      <p>大目录会按批加载，当前页面保持可操作。照片会继续追加到队列中。</p>
      {phase === 'scanning' && (
        <button className="btn-scan-cancel" onClick={onCancel}>停止读取</button>
      )}
    </div>
  );
}

function isEditableElement(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export default function App(): ReactNode {
  const app = useAppState();
  const aiConfig = useAiConfig();

  const movingRef = useRef(app.moving);
  const classifyRef = useRef(app.classifyPhoto);
  const undoRef = useRef(app.undoAction);
  const adoptRef = useRef(app.adoptSuggestion);

  useEffect(() => {
    movingRef.current = app.moving;
    classifyRef.current = app.classifyPhoto;
    undoRef.current = app.undoAction;
    adoptRef.current = app.adoptSuggestion;
  }, [app.moving, app.classifyPhoto, app.undoAction, app.adoptSuggestion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (movingRef.current || isEditableElement()) return;

      if (e.key === 'Enter' && app.currentSuggestion) {
        e.preventDefault();
        adoptRef.current();
        return;
      }

      const category = KEY_TO_CATEGORY[e.key];
      if (category) {
        e.preventDefault();
        classifyRef.current(category);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [app.currentSuggestion]);

  if (!app.browserSupported) {
    return <UnsupportedView reason={app.storageUnsupportedReason} />;
  }

  if (!app.rootHandle) {
    return (
      <div className="app">
        {app.error && <ErrorBanner error={app.error} onDismiss={app.clearError} />}
        <WelcomeView
          onSelect={app.selectFolder}
          storageLabel={app.storageAdapter.label}
          isAndroidWeb={app.storageAdapter.platform === 'android-web'}
        />
      </div>
    );
  }

  if (app.complete) {
    return (
      <div className="app">
        <Header folderName={app.folderName} onReselect={app.selectFolder} />
        <StatusBar stats={app.stats} />
        {app.error && <ErrorBanner error={app.error} onDismiss={app.clearError} />}
        <CompletionView stats={app.stats} onReselect={app.selectFolder} />
      </div>
    );
  }

  return (
    <div className="app">
      <Header folderName={app.folderName} onReselect={app.selectFolder} />
      <StatusBar stats={app.stats} />
      {app.error && <ErrorBanner error={app.error} onDismiss={app.clearError} />}
      {(app.scanState.phase === 'scanning' || (app.scanState.phase === 'cancelled' && app.stats.total === 0)) && (
        <ScanPanel
          count={app.scanState.scannedCount}
          bytes={app.scanState.totalBytes}
          phase={app.scanState.phase}
          onCancel={app.cancelScan}
        />
      )}
      <div className="main-area">
        <PhotoViewer
          photo={app.currentPhoto}
          suggestion={app.currentSuggestion}
          moving={app.moving}
          canUndo={app.hasUndo}
          onSwipeClassify={(category: Category) => app.classifyPhoto(category)}
          onLongPressUndo={app.undoAction}
        />
        <div className="sidebar">
          <ActionBar
            onClassify={app.classifyPhoto}
            onUndo={app.undoAction}
            onAdoptSuggestion={app.adoptSuggestion}
            moving={app.moving}
            hasUndo={app.hasUndo}
            currentSuggestion={app.currentSuggestion}
          />
          <button
            className="btn-ai-trigger"
            onClick={() => app.setShowAiPanel(true)}
            disabled={app.moving || app.scanRunning}
          >
            {app.scanRunning ? '扫描完成后可 AI 预筛选' : 'AI 预筛选'}
          </button>
          {app.scanState.phase === 'scanning' && (
            <button className="btn-scan-side" onClick={app.cancelScan}>
              停止读取照片
            </button>
          )}
          <RecentActions actions={app.recentActions} />
        </div>
      </div>
      {app.showAiPanel && (
        <AiPanel
          photoCount={app.stats.remaining}
          totalBytes={app.scanState.totalBytes}
          aiState={app.aiState}
          suggestionStats={app.suggestionStats}
          aiConfig={aiConfig}
          onStart={app.startAiPreprocess}
          onCancel={app.cancelAiPreprocess}
          onAdoptAll={app.adoptAllByBucket}
          batchMoveState={app.batchMoveState}
          onCancelBatchMove={app.cancelBatchMove}
          onClearSuggestions={() => { app.clearAiSuggestions(); app.setShowAiPanel(false); }}
          onClose={() => app.setShowAiPanel(false)}
          moving={app.moving}
        />
      )}
    </div>
  );
}
