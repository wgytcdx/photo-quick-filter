import { useState, useCallback, useEffect, useRef } from 'react';
import type { AiConfig } from './ai-types';
import type { AiTestResult } from './ai-service';
import { DEFAULT_AI_CONFIG, AI_PRESETS } from './ai-types';
import { testAiConnection } from './ai-service';

const STORAGE_KEY = 'photo-quick-filter-ai-config';

interface AiConfigState {
  config: AiConfig;
  presetId: string;
  customPrompt: string;
}

function loadSavedState(): AiConfigState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AiConfigState>;
      return {
        config: { ...DEFAULT_AI_CONFIG, ...parsed.config },
        presetId: parsed.presetId ?? 'general',
        customPrompt: parsed.customPrompt ?? '',
      };
    }
  } catch { /* ignore */ }
  return { config: DEFAULT_AI_CONFIG, presetId: 'general', customPrompt: '' };
}

export interface AiConfigContext {
  config: AiConfig;
  presetId: string;
  customPrompt: string;
  isSaved: boolean;
  effectivePrompt: string;
  testing: boolean;
  testResult: AiTestResult | null;
  updateConfig: (config: AiConfig) => void;
  updatePresetId: (presetId: string) => void;
  updateCustomPrompt: (prompt: string) => void;
  saveConfig: () => void;
  clearConfig: () => void;
  testConnection: () => void;
}

export function useAiConfig(): AiConfigContext {
  const [state, setState] = useState<AiConfigState>(loadSavedState);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiTestResult | null>(null);

  const initialLoadRef = useRef(true);
  const skipSaveRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const updateConfig = useCallback((config: AiConfig) => {
    setState(prev => ({ ...prev, config }));
    setTestResult(null);
  }, []);

  const updatePresetId = useCallback((presetId: string) => {
    setState(prev => ({ ...prev, presetId }));
    setTestResult(null);
  }, []);

  const updateCustomPrompt = useCallback((customPrompt: string) => {
    setState(prev => ({ ...prev, customPrompt }));
    setTestResult(null);
  }, []);

  const saveConfig = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const clearConfig = useCallback(() => {
    skipSaveRef.current = true;
    setState({ config: DEFAULT_AI_CONFIG, presetId: 'general', customPrompt: '' });
    setTestResult(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  const testConnection = useCallback(async () => {
    if (testing) return;
    if (state.config.apiKey.length === 0) {
      setTestResult({ success: false, message: '请先输入 API Key' });
      return;
    }
    if (state.config.apiEndpoint.length === 0) {
      setTestResult({ success: false, message: '请先输入 API 地址' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await testAiConnection(state.config);
    setTestResult(result);
    setTesting(false);
  }, [testing, state.config]);

  const selectedPreset = AI_PRESETS.find(p => p.id === state.presetId);
  const effectivePrompt = state.presetId === 'custom' ? state.customPrompt : (selectedPreset?.prompt ?? '');

  let isSaved = false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    isSaved = saved !== null && JSON.stringify(state) === saved;
  } catch { /* ignore */ }

  return {
    config: state.config,
    presetId: state.presetId,
    customPrompt: state.customPrompt,
    isSaved,
    effectivePrompt,
    testing,
    testResult,
    updateConfig,
    updatePresetId,
    updateCustomPrompt,
    saveConfig,
    clearConfig,
    testConnection,
  };
}
