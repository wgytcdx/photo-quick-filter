import type { ReactNode } from 'react';
import type { Stats } from '../lib/types';

interface StatusBarProps {
  stats: Stats;
}

export function StatusBar({ stats }: StatusBarProps): ReactNode {
  return (
    <div className="status-bar">
      <div className="stat-item">
        <span className="stat-label">总照片</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">剩余</span>
        <span className="stat-value">{stats.remaining}</span>
      </div>
      <div className="stat-item stat-delete">
        <span className="stat-label">待删除</span>
        <span className="stat-value">{stats.deleteCount}</span>
      </div>
      <div className="stat-item stat-keep">
        <span className="stat-label">保留</span>
        <span className="stat-value">{stats.keepCount}</span>
      </div>
      <div className="stat-item stat-stash">
        <span className="stat-label">暂存</span>
        <span className="stat-value">{stats.stashCount}</span>
      </div>
      <div className="stat-item stat-favorite">
        <span className="stat-label">精选</span>
        <span className="stat-value">{stats.favoriteCount}</span>
      </div>
    </div>
  );
}
