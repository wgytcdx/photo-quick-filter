import type { ReactNode } from 'react';
import type { Stats } from '../lib/types';

interface CompletionViewProps {
  stats: Stats;
  onReselect: () => void;
}

export function CompletionView({ stats, onReselect }: CompletionViewProps): ReactNode {
  return (
    <div className="completion-view">
      <h2>所有照片已分类完成</h2>
      <div className="completion-stats">
        <div className="completion-stat" style={{ color: '#e74c3c' }}>
          <span className="completion-label">待删除</span>
          <span className="completion-value">{stats.deleteCount}</span>
          <span className="completion-dir">_delete_review/</span>
        </div>
        <div className="completion-stat" style={{ color: '#2ecc71' }}>
          <span className="completion-label">保留</span>
          <span className="completion-value">{stats.keepCount}</span>
          <span className="completion-dir">_keep/</span>
        </div>
        <div className="completion-stat" style={{ color: '#f39c12' }}>
          <span className="completion-label">暂存</span>
          <span className="completion-value">{stats.stashCount}</span>
          <span className="completion-dir">_stash/</span>
        </div>
        <div className="completion-stat" style={{ color: '#9b59b6' }}>
          <span className="completion-label">精选</span>
          <span className="completion-value">{stats.favoriteCount}</span>
          <span className="completion-dir">_favorite/</span>
        </div>
      </div>
      <div className="completion-total">
        共处理 {stats.total} 张照片
      </div>
      <button className="btn-reselect" onClick={onReselect}>
        选择新文件夹
      </button>
    </div>
  );
}
