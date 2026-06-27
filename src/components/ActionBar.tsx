import type { ReactNode } from 'react';
import type { Category } from '../lib/types';
import type { AiSuggestion } from '../lib/ai-types';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_KEYS } from '../lib/constants';

interface ActionBarProps {
  onClassify: (category: Category) => void;
  onUndo: () => void;
  onAdoptSuggestion: () => void;
  moving: boolean;
  hasUndo: boolean;
  currentSuggestion: AiSuggestion | null;
}

interface ActionButtonProps {
  category: Category;
  onClick: () => void;
  disabled: boolean;
}

function ActionButton({ category, onClick, disabled }: ActionButtonProps): ReactNode {
  return (
    <button
      className="action-btn"
      style={{ borderColor: CATEGORY_COLORS[category], color: CATEGORY_COLORS[category] }}
      onClick={onClick}
      disabled={disabled}
      data-category={category}
    >
      <span className="action-key">{CATEGORY_KEYS[category]}</span>
      <span className="action-label">{CATEGORY_LABELS[category]}</span>
    </button>
  );
}

export function ActionBar({ onClassify, onUndo, onAdoptSuggestion, moving, hasUndo, currentSuggestion }: ActionBarProps): ReactNode {
  const disabled = moving;

  return (
    <div className="action-panel">
      <div className="action-grid">
        <div className="action-grid-row">
          <ActionButton category="delete" onClick={() => onClassify('delete')} disabled={disabled} />
        </div>
        <div className="action-grid-row">
          <ActionButton category="stash" onClick={() => onClassify('stash')} disabled={disabled} />
          <ActionButton category="favorite" onClick={() => onClassify('favorite')} disabled={disabled} />
        </div>
        <div className="action-grid-row">
          <ActionButton category="keep" onClick={() => onClassify('keep')} disabled={disabled} />
        </div>
      </div>
      {currentSuggestion && (
        <button
          className="adopt-btn"
          style={{ borderColor: CATEGORY_COLORS[currentSuggestion.bucket], color: CATEGORY_COLORS[currentSuggestion.bucket] }}
          onClick={onAdoptSuggestion}
          disabled={disabled}
        >
          采纳 AI 建议: {CATEGORY_LABELS[currentSuggestion.bucket]} ({(currentSuggestion.confidence * 100).toFixed(0)}%) [Enter]
        </button>
      )}
      <button
        className="undo-btn"
        onClick={onUndo}
        disabled={disabled || !hasUndo}
      >
        撤销上一步 (Ctrl+Z)
      </button>
      <div className="safety-note">
        待删除照片仅移动到 <code>_delete_review</code> 目录，不会永久删除
      </div>
    </div>
  );
}
