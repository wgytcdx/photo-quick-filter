import type { ReactNode } from 'react';
import type { ActionRecord } from '../lib/types';
import { CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_DIR_NAMES } from '../lib/constants';

interface RecentActionsProps {
  actions: ActionRecord[];
}

export function RecentActions({ actions }: RecentActionsProps): ReactNode {
  if (actions.length === 0) return null;

  return (
    <div className="recent-actions">
      <h3>最近操作</h3>
      <ul>
        {actions.map((action, i) => (
          <li key={`${action.photo.relativePath}-${i}`} style={{ color: CATEGORY_COLORS[action.category] }}>
            <span className="recent-category">{CATEGORY_LABELS[action.category]}</span>
            {action.isAiAdopted && <span className="recent-ai-tag">AI</span>}
            <span className="recent-file">{action.photo.name}</span>
            <span className="recent-dir">→ {CATEGORY_DIR_NAMES[action.category]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
