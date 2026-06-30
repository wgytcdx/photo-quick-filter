import type { ReactNode } from 'react';
import type { AiConfig } from '../lib/ai-types';
import type { AiTestResult } from '../lib/ai-service';
import { AI_PRESETS, AI_PROVIDER_PRESETS } from '../lib/ai-types';

interface AiConfigPanelProps {
  config: AiConfig;
  presetId: string;
  customPrompt: string;
  isSaved: boolean;
  testing: boolean;
  testResult: AiTestResult | null;
  moving: boolean;
  onConfigChange: (config: AiConfig) => void;
  onPresetChange: (presetId: string) => void;
  onCustomPromptChange: (prompt: string) => void;
  onSave: () => void;
  onClear: () => void;
  onTest: () => void;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return key ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '';
  return `${key.slice(0, 4)}\u2022\u2022\u2022\u2022${key.slice(-4)}`;
}

function TestResultDisplay({ result }: { result: AiTestResult | null }): ReactNode {
  if (!result) return null;
  if (result.success) {
    return (
      <div className="ai-test-result ai-test-success">
        <span className="ai-test-icon">&#10003;</span>
        <span>{result.message}</span>
        {result.model && <span className="ai-test-model">模型: {result.model}</span>}
        {result.latency !== undefined && <span className="ai-test-latency">{result.latency}ms</span>}
      </div>
    );
  }
  return (
    <div className="ai-test-result ai-test-failure">
      <span className="ai-test-icon">&#10007;</span>
      <span>{result.message}</span>
    </div>
  );
}

export function AiConfigPanel({
  config,
  presetId,
  customPrompt,
  isSaved,
  testing,
  testResult,
  moving,
  onConfigChange,
  onPresetChange,
  onCustomPromptChange,
  onSave,
  onClear,
  onTest,
}: AiConfigPanelProps): ReactNode {
  const selectedPreset = AI_PRESETS.find(p => p.id === presetId);
  const isCustom = presetId === 'custom';
  const canTest = config.apiKey.length > 0 && config.apiEndpoint.length > 0 && !moving && !testing;

  const activeProvider = AI_PROVIDER_PRESETS.find(p => p.endpoint === config.apiEndpoint && p.model === config.model);

  const handleProviderSelect = (provider: typeof AI_PROVIDER_PRESETS[number]) => {
    onConfigChange({
      ...config,
      apiEndpoint: provider.endpoint,
      model: provider.model,
      supportsVision: provider.supportsVision,
    });
  };

  return (
    <div className="ai-config-panel">
      <div className="ai-section">
        <h3>
          API 配置
          {isSaved
            ? <span className="ai-saved-badge">已保存</span>
            : <span className="ai-unsaved-badge">未保存</span>}
        </h3>
        <div className="ai-field">
          <label>服务商快速选择</label>
          <div className="ai-provider-buttons">
            {AI_PROVIDER_PRESETS.map(p => (
              <button
                key={p.id}
                className={`btn-provider${activeProvider?.id === p.id ? ' btn-provider-active' : ''}`}
                onClick={() => handleProviderSelect(p)}
                disabled={moving}
                title={p.supportsVision ? '支持图片分析' : '纯文本模式，仅能基于文件名/大小等元信息推断'}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="ai-field">
          <label>API 地址</label>
          <input
            type="text"
            value={config.apiEndpoint}
            onChange={e => onConfigChange({ ...config, apiEndpoint: e.target.value })}
            placeholder="https://api.openai.com/v1/chat/completions"
            disabled={moving}
          />
        </div>
        <div className="ai-field">
          <label>API Key</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={e => onConfigChange({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
            disabled={moving}
          />
          {config.apiKey && <span className="ai-key-mask">{maskApiKey(config.apiKey)}</span>}
        </div>
        <div className="ai-field">
          <label>模型</label>
          <input
            type="text"
            value={config.model}
            onChange={e => onConfigChange({ ...config, model: e.target.value })}
            placeholder="gpt-4o-mini"
            disabled={moving}
          />
        </div>
        <p className="ai-vision-badge">
          {config.supportsVision
            ? <span className="ai-vision-yes">支持图片视觉分析</span>
            : <span className="ai-vision-no">仅文本模式（当前服务商不支持图片输入，将基于文件元信息推断）</span>}
        </p>
        <div className="ai-field">
          <label>AI 并发数</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.concurrency}
            onChange={e => onConfigChange({ ...config, concurrency: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
            disabled={moving}
          />
          <p className="ai-note-inline">默认 10；遇到限流、发热或网络不稳定时可调低。</p>
        </div>
        <TestResultDisplay result={testResult} />
        <div className="ai-config-actions">
          <button className="btn-ai-test" onClick={onTest} disabled={!canTest}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button className="btn-ai-save" onClick={onSave} disabled={moving}>
            保存配置
          </button>
          <button className="btn-ai-clear-config" onClick={onClear} disabled={moving}>
            清除配置
          </button>
        </div>
      </div>

      <div className="ai-section">
        <h3>提示词</h3>
        <div className="ai-field">
          <label>预设模板</label>
          <select value={presetId} onChange={e => onPresetChange(e.target.value)} disabled={moving}>
            {AI_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}
            <option value="custom">自定义提示词</option>
          </select>
        </div>
        {isCustom && (
          <div className="ai-field">
            <label>自定义提示词</label>
            <textarea
              className="ai-prompt-textarea"
              value={customPrompt}
              onChange={e => onCustomPromptChange(e.target.value)}
              placeholder={'编写提示词，要求 AI 返回 JSON: {"bucket", "confidence", "reason"}'}
              rows={6}
              disabled={moving}
            />
          </div>
        )}
        {!isCustom && selectedPreset && (
          <div className="ai-prompt-preview">
            <pre>{selectedPreset.prompt}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
