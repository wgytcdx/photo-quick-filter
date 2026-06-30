import type { Category, PhotoEntry } from './types';

export interface AiSuggestion {
  bucket: Category;
  confidence: number;
  reason: string;
}

export interface AiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiConfig {
  apiEndpoint: string;
  apiKey: string;
  model: string;
  maxImageSize: number;
  concurrency: number;
  supportsVision: boolean;
}

export interface AiPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface AiPhotoAnalysis {
  photo: PhotoEntry;
  suggestion: AiSuggestion | null;
  error?: string;
  usage?: AiUsage;
}

export interface AiPreprocessState {
  phase: 'config' | 'progress' | 'results' | 'cancelled';
  running: boolean;
  total: number;
  processed: number;
  suggested: number;
  failed: number;
  analyses: AiPhotoAnalysis[];
  currentPhoto: string;
  abortController: AbortController | null;
  totalUsage: AiUsage;
}

export interface AiProviderPreset {
  id: string;
  name: string;
  endpoint: string;
  model: string;
  supportsVision: boolean;
}

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    supportsVision: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-v4-pro',
    supportsVision: false,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'deepseek-ai/deepseek-vl2',
    supportsVision: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    supportsVision: true,
  },
  {
    id: 'qwen',
    name: '阿里千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-plus',
    supportsVision: true,
  },
];

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiEndpoint: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxImageSize: 512,
  concurrency: 10,
  supportsVision: true,
};

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'general',
    name: '通用分类',
    description: '根据照片质量和内容综合判断分类',
    prompt: '分析这张照片，判断它应归入哪个分类：\n- delete: 模糊、低质量、曝光问题、无意义的内容\n- keep: 正常质量、可以保留的照片\n- stash: 有一定价值但不确定是否值得保留\n- favorite: 高质量、构图出色、值得精选的照片\n\n回复 JSON：{"bucket": "delete|keep|stash|favorite", "confidence": 0.0-1.0, "reason": "简短中文说明"}',
  },
  {
    id: 'quality',
    name: '质量筛选',
    description: '重点识别低质量照片标记为待删除',
    prompt: '分析这张照片的质量。重点关注：清晰度、曝光、构图、是否有拍摄失误。\n- delete: 模糊、过暗/过亮、构图混乱、拍摄失误\n- keep: 质量正常的照片\n- stash: 质量尚可但不够突出\n- favorite: 拍摄质量优秀、构图精美\n\n回复 JSON：{"bucket": "delete|keep|stash|favorite", "confidence": 0.0-1.0, "reason": "简短中文说明"}',
  },
  {
    id: 'content',
    name: '内容优先',
    description: '根据照片内容价值判断分类',
    prompt: '分析这张照片的内容价值。重点关注：主体是否明确、情感表达、场景独特性。\n- delete: 内容无意义、重复、杂乱\n- keep: 有记录价值的日常照片\n- stash: 内容有趣但不够突出\n- favorite: 精彩瞬间、情感丰富、值得珍藏\n\n回复 JSON：{"bucket": "delete|keep|stash|favorite", "confidence": 0.0-1.0, "reason": "简短中文说明"}',
  },
];
