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
            disabled={app.moving}
          >
            AI 预筛选
          </button>
          <RecentActions actions={app.recentActions} />
        </div>
      </div>
      {app.showAiPanel && (
        <AiPanel
          photoCount={app.stats.remaining}
          aiState={app.aiState}
          suggestionStats={app.suggestionStats}
          aiConfig={aiConfig}
          onStart={app.startAiPreprocess}
          onCancel={app.cancelAiPreprocess}
          onAdoptAll={app.adoptAllByBucket}
          onClearSuggestions={() => { app.setShowAiPanel(false); }}
          onClose={() => app.setShowAiPanel(false)}
          moving={app.moving}
        />
      )}
    </div>
  );
}
