import { useState, type ReactNode } from 'react';
import type { AiConfig, AiPreprocessState } from '../lib/ai-types';
import type { AiConfigContext } from '../lib/useAiConfig';
import type { BatchMoveState, Category } from '../lib/types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../lib/constants';
import { AiConfigPanel } from './AiConfigPanel';

interface AiPanelProps {
  photoCount: number;
  totalBytes: number;
  aiState: AiPreprocessState | null;
  suggestionStats: { deleteCount: number; keepCount: number; stashCount: number; favoriteCount: number; totalSuggested: number; unsuggested: number; heicCount: number };
  aiConfig: AiConfigContext;
  onStart: (config: AiConfig, prompt: string) => void;
  onCancel: () => void;
  onAdoptAll: (bucket: Category) => void;
  batchMoveState: BatchMoveState;
  onCancelBatchMove: () => void;
  onClearSuggestions: () => void;
  onClose: () => void;
  moving: boolean;
}

function AiProgressView({ aiState, onCancel }: { aiState: AiPreprocessState; onCancel: () => void }): ReactNode {
  const progress = aiState.total > 0 ? (aiState.processed / aiState.total) * 100 : 0;
  const lastFailed = [...aiState.analyses].reverse().find(a => a.error);

  return (
    <div className="ai-progress-view">
      <h3>AI 预筛选进行中</h3>
      <div className="ai-progress-bar">
        <div className="ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="ai-progress-text">{aiState.processed} / {aiState.total}</p>
      {aiState.currentPhoto && <p className="ai-current-photo">正在分析: {aiState.currentPhoto}</p>}
      <div className="ai-progress-stats">
        <span style={{ color: '#9b59b6' }}>已建议 {aiState.suggested}</span>
        <span style={{ color: '#f39c12' }}>失败 {aiState.failed}</span>
        <span style={{ color: '#a0a0a0' }}>剩余 {aiState.total - aiState.processed}</span>
      </div>
      {lastFailed && (
        <p className="ai-progress-last-error" title={lastFailed.error}>
          最近失败: {lastFailed.photo.name} — {lastFailed.error}
        </p>
      )}
      <p className="ai-note">AI 只生成建议，不会自动移动文件</p>
      <div className="ai-actions">
        <button className="btn-ai-cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

const BUCKET_ORDER: Category[] = ['delete', 'keep', 'stash', 'favorite'];

function formatTokenNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function estimateAiTokens(photoCount: number, totalBytes: number, config: AiConfig, prompt: string) {
  const textTokens = Math.ceil(prompt.length / 1.6) + 120;
  const outputTokens = 120;
  const sizeFactor = Math.max(0.75, Math.min(3, (config.maxImageSize * config.maxImageSize) / (512 * 512)));
  const imageLow = config.supportsVision ? Math.round(650 * sizeFactor) : 0;
  const imageHigh = config.supportsVision ? Math.round(1800 * sizeFactor) : 0;
  const lowPerPhoto = textTokens + outputTokens + imageLow;
  const highPerPhoto = textTokens + outputTokens + imageHigh;
  const avgFileSize = photoCount > 0 ? totalBytes / photoCount : 0;

  return {
    low: lowPerPhoto * photoCount,
    high: highPerPhoto * photoCount,
    lowPerPhoto,
    highPerPhoto,
    avgFileSize,
  };
}

function BatchMoveProgress({ state, onCancel }: { state: BatchMoveState; onCancel: () => void }): ReactNode {
  if (state.phase === 'idle' || state.phase === 'done') return null;
  const progress = state.total > 0 ? (state.processed / state.total) * 100 : 0;
  return (
    <div className="ai-batch-progress">
      <h4>{state.phase === 'rollback' ? '正在回滚本次批量移动' : '正在批量采纳建议'}</h4>
      <div className="ai-progress-bar">
        <div className="ai-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p>{state.processed} / {state.total}{state.rolledBack > 0 ? `，已回滚 ${state.rolledBack}` : ''}</p>
      {state.currentPhoto && <p className="ai-current-photo">当前: {state.currentPhoto}</p>}
      {state.phase === 'running' && <button className="btn-ai-cancel" onClick={onCancel}>取消批量移动</button>}
    </div>
  );
}

function AiResultsView({ aiState, suggestionStats, onAdoptAll, onClearSuggestions, onClose }: {
  aiState: AiPreprocessState;
  suggestionStats: { deleteCount: number; keepCount: number; stashCount: number; favoriteCount: number; totalSuggested: number; unsuggested: number; heicCount: number };
  onAdoptAll: (bucket: Category) => void;
  onClearSuggestions: () => void;
  onClose: () => void;
}): ReactNode {
  const suggestedAnalyses = aiState.analyses.filter(a => a.suggestion);
  const failedAnalyses = aiState.analyses.filter(a => a.error && !a.suggestion);
  const [showDetail, setShowDetail] = useState(false);

  const avgConfidence = suggestedAnalyses.length > 0
    ? suggestedAnalyses.reduce((sum, a) => sum + a.suggestion!.confidence, 0) / suggestedAnalyses.length
    : 0;

  const highConfCount = suggestedAnalyses.filter(a => a.suggestion!.confidence >= 0.8).length;
  const lowConfCount = suggestedAnalyses.filter(a => a.suggestion!.confidence < 0.5).length;

  return (
    <div className="ai-results-view">
      <h3>AI 预筛选完成</h3>
      <p className="ai-results-note">AI 只生成建议，点击采纳按钮才执行分类移动。</p>

      <div className="ai-results-summary">
        <div className="ai-summary-stats">
          <span className="ai-summary-stat">
            <span className="ai-summary-num">{aiState.total}</span>
            <span className="ai-summary-label">总分析</span>
          </span>
          <span className="ai-summary-stat">
            <span className="ai-summary-num" style={{ color: '#9b59b6' }}>{suggestionStats.totalSuggested}</span>
            <span className="ai-summary-label">已建议</span>
          </span>
          <span className="ai-summary-stat">
            <span className="ai-summary-num" style={{ color: '#f39c12' }}>{failedAnalyses.length}</span>
            <span className="ai-summary-label">失败</span>
          </span>
          {suggestionStats.heicCount > 0 && (
            <span className="ai-summary-stat">
              <span className="ai-summary-num" style={{ color: '#f39c12' }}>{suggestionStats.heicCount}</span>
              <span className="ai-summary-label">HEIC</span>
            </span>
          )}
        </div>
      </div>

      {aiState.totalUsage.totalTokens > 0 && (
        <div className="ai-usage-section">
          <h4>Token 用量</h4>
          <div className="ai-usage-stats">
            <span className="ai-usage-stat">
              <span className="ai-usage-num">{formatTokenNum(aiState.totalUsage.promptTokens)}</span>
              <span className="ai-usage-label">输入</span>
            </span>
            <span className="ai-usage-stat">
              <span className="ai-usage-num">{formatTokenNum(aiState.totalUsage.completionTokens)}</span>
              <span className="ai-usage-label">输出</span>
            </span>
            <span className="ai-usage-stat ai-usage-total">
              <span className="ai-usage-num">{formatTokenNum(aiState.totalUsage.totalTokens)}</span>
              <span className="ai-usage-label">总计</span>
            </span>
          </div>
        </div>
      )}

      {failedAnalyses.length > 0 && (
        <div className="ai-failed-section">
          <h4>
            分析失败详情
            <button className="ai-detail-toggle" onClick={() => setShowDetail(prev => !prev)}>
              {showDetail ? '收起' : `展开 (${failedAnalyses.length} 条)`}
            </button>
          </h4>
          <ul>
            {(showDetail ? failedAnalyses : failedAnalyses.slice(0, 5)).map((a, i) => (
              <li key={i} className="ai-failed-item">
                <span className="ai-failed-file">{a.photo.name}</span>
                <span className="ai-failed-error">{a.error}</span>
              </li>
            ))}
            {!showDetail && failedAnalyses.length > 5 && (
              <li className="ai-failed-more">还有 {failedAnalyses.length - 5} 条失败记录...</li>
            )}
          </ul>
        </div>
      )}

      {suggestionStats.totalSuggested > 0 && (
        <div className="ai-breakdown-section">
          <h4>分类分布</h4>
          <div className="ai-breakdown-bars">
            {BUCKET_ORDER.map(bucket => {
              const count = suggestionStats[bucket === 'delete' ? 'deleteCount' : bucket === 'keep' ? 'keepCount' : bucket === 'stash' ? 'stashCount' : 'favoriteCount'] as number;
              if (count === 0) return null;
              const pct = Math.round((count / suggestionStats.totalSuggested) * 100);
              return (
                <div key={bucket} className="ai-breakdown-row">
                  <span className="ai-breakdown-label" style={{ color: CATEGORY_COLORS[bucket] }}>
                    {CATEGORY_LABELS[bucket]}
                  </span>
                  <div className="ai-breakdown-bar-track">
                    <div
                      className="ai-breakdown-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: CATEGORY_COLORS[bucket],
                      }}
                    />
                  </div>
                  <span className="ai-breakdown-count" style={{ color: CATEGORY_COLORS[bucket] }}>
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {suggestedAnalyses.length > 0 && (
        <div className="ai-confidence-section">
          <h4>置信度分析</h4>
          <div className="ai-confidence-stats">
            <span className="ai-conf-stat">
              平均置信度: <strong>{(avgConfidence * 100).toFixed(1)}%</strong>
            </span>
            <span className="ai-conf-stat" style={{ color: '#2ecc71' }}>
              高置信 (&ge;80%): <strong>{highConfCount}</strong>
            </span>
            <span className="ai-conf-stat" style={{ color: '#f39c12' }}>
              低置信 (&lt;50%): <strong>{lowConfCount}</strong>
            </span>
          </div>
        </div>
      )}

      <div className="ai-adopt-section">
        <h4>批量采纳建议</h4>
        <div className="ai-adopt-buttons">
          {suggestionStats.deleteCount > 0 && (
            <button className="btn-ai-adopt" style={{ borderColor: CATEGORY_COLORS.delete, color: CATEGORY_COLORS.delete }} onClick={() => onAdoptAll('delete')}>
              采纳「待删除」({suggestionStats.deleteCount})
            </button>
          )}
          {suggestionStats.keepCount > 0 && (
            <button className="btn-ai-adopt" style={{ borderColor: CATEGORY_COLORS.keep, color: CATEGORY_COLORS.keep }} onClick={() => onAdoptAll('keep')}>
              采纳「保留」({suggestionStats.keepCount})
            </button>
          )}
          {suggestionStats.stashCount > 0 && (
            <button className="btn-ai-adopt" style={{ borderColor: CATEGORY_COLORS.stash, color: CATEGORY_COLORS.stash }} onClick={() => onAdoptAll('stash')}>
              采纳「暂存」({suggestionStats.stashCount})
            </button>
          )}
          {suggestionStats.favoriteCount > 0 && (
            <button className="btn-ai-adopt" style={{ borderColor: CATEGORY_COLORS.favorite, color: CATEGORY_COLORS.favorite }} onClick={() => onAdoptAll('favorite')}>
              采纳「精选」({suggestionStats.favoriteCount})
            </button>
          )}
        </div>
      </div>

      {suggestedAnalyses.length > 0 && (
        <div className="ai-results-detail">
          <h4>
            建议详情
            <button className="ai-detail-toggle" onClick={() => setShowDetail(prev => !prev)}>
              {showDetail ? '收起' : `展开全部 (${suggestedAnalyses.length} 条)`}
            </button>
          </h4>
          <ul>
            {(showDetail ? suggestedAnalyses : suggestedAnalyses.slice(-20)).reverse().map((a, i) => (
              <li key={i} style={{ color: CATEGORY_COLORS[a.suggestion!.bucket] }}>
                <span className="ai-result-cat">{CATEGORY_LABELS[a.suggestion!.bucket]}</span>
                <span className="ai-result-conf">{(a.suggestion!.confidence * 100).toFixed(0)}%</span>
                <span className="ai-result-file">{a.photo.name}</span>
                <span className="ai-result-reason">{a.suggestion!.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ai-actions">
        <button className="btn-ai-clear" onClick={onClearSuggestions}>清除所有建议</button>
        <button className="btn-ai-close" onClick={onClose}>关闭，回主界面逐张采纳</button>
      </div>
    </div>
  );
}

export function AiPanel(props: AiPanelProps): ReactNode {
  const { aiState, onClose, aiConfig } = props;
  const phase = aiState?.phase ?? 'config';
  const [confirmEstimate, setConfirmEstimate] = useState(false);

  const canStart = aiConfig.config.apiKey.length > 0 && aiConfig.effectivePrompt.length > 0 && props.photoCount > 0 && !props.moving;
  const estimate = estimateAiTokens(props.photoCount, props.totalBytes, aiConfig.config, aiConfig.effectivePrompt);

  const handleStart = () => {
    if (canStart) {
      setConfirmEstimate(false);
      props.onStart(aiConfig.config, aiConfig.effectivePrompt);
    }
  };

  return (
    <div className="ai-modal-overlay" onClick={e => { if (e.target === e.currentTarget && phase === 'config') onClose(); }}>
      <div className="ai-modal">
        <div className="ai-modal-header">
          <h2>AI 预筛选</h2>
          {phase === 'config' && <button className="ai-modal-close" onClick={onClose}>✕</button>}
        </div>
        <div className="ai-modal-body">
          {phase === 'config' && (
            <>
              <AiConfigPanel
                config={aiConfig.config}
                presetId={aiConfig.presetId}
                customPrompt={aiConfig.customPrompt}
                isSaved={aiConfig.isSaved}
                testing={aiConfig.testing}
                testResult={aiConfig.testResult}
                moving={props.moving}
                onConfigChange={aiConfig.updateConfig}
                onPresetChange={aiConfig.updatePresetId}
                onCustomPromptChange={aiConfig.updateCustomPrompt}
                onSave={aiConfig.saveConfig}
                onClear={aiConfig.clearConfig}
                onTest={aiConfig.testConnection}
              />
              <div className="ai-section ai-estimate">
                <p>将对 <strong>{props.photoCount}</strong> 张照片生成 AI 建议</p>
                <p>当前队列体积约 <strong>{formatBytes(props.totalBytes)}</strong>，平均 {formatBytes(estimate.avgFileSize)} / 张</p>
                <p>预计消耗 <strong>{formatTokenNum(estimate.low)} - {formatTokenNum(estimate.high)}</strong> tokens</p>
                <p className="ai-note-inline">单张约 {formatTokenNum(estimate.lowPerPhoto)} - {formatTokenNum(estimate.highPerPhoto)} tokens，并发 {Math.max(1, Math.min(10, aiConfig.config.concurrency || 10))}</p>
                <p className="ai-note-inline">AI 只建议分类，不自动移动文件</p>
                {!canStart && aiConfig.config.apiKey.length === 0 && <p className="ai-warning">请输入 API Key</p>}
                {!canStart && aiConfig.effectivePrompt.length === 0 && <p className="ai-warning">请选择或编写提示词</p>}
              </div>
              <div className="ai-actions">
                {!confirmEstimate ? (
                  <button className="btn-ai-start" onClick={() => setConfirmEstimate(true)} disabled={!canStart}>
                    预估无误，准备开始
                  </button>
                ) : (
                  <>
                    <button className="btn-ai-start" onClick={handleStart} disabled={!canStart}>
                      确认并开始 AI 预筛选
                    </button>
                    <button className="btn-ai-close" onClick={() => setConfirmEstimate(false)}>
                      返回调整
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {phase === 'progress' && aiState && (
            <AiProgressView aiState={aiState} onCancel={props.onCancel} />
          )}
          {(phase === 'results' || phase === 'cancelled') && aiState && (
            <>
              <BatchMoveProgress state={props.batchMoveState} onCancel={props.onCancelBatchMove} />
              <AiResultsView
                aiState={aiState}
                suggestionStats={props.suggestionStats}
                onAdoptAll={props.onAdoptAll}
                onClearSuggestions={props.onClearSuggestions}
                onClose={onClose}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
