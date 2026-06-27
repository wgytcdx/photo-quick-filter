import type { Category } from './types';
import type { AiConfig, AiUsage } from './ai-types';

interface AiApiSuccess {
  success: true;
  bucket: Category;
  confidence: number;
  reason: string;
  usage?: AiUsage;
}

interface AiApiFailure {
  success: false;
  error: string;
  rawContent?: string;
}

export type AiApiResponse = AiApiSuccess | AiApiFailure;

function formatSizeForAi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function tryParseBucketJson(text: string): AiApiResponse | null {
  try {
    const json = JSON.parse(text);
    if (json.bucket && json.reason) {
      const bucket = String(json.bucket).toLowerCase();
      if (bucket === 'delete' || bucket === 'keep' || bucket === 'stash' || bucket === 'favorite') {
        const confidence = typeof json.confidence === 'number'
          ? Math.min(1, Math.max(0, json.confidence))
          : 0.5;
        return {
          success: true,
          bucket: bucket as Category,
          confidence,
          reason: String(json.reason),
        };
      }
    }
  } catch { /* not JSON */ }
  return null;
}

function parseAiResponse(content: string): AiApiResponse {
  const cleaned = stripThinkTags(content);

  const direct = tryParseBucketJson(cleaned);
  if (direct) return direct;

  const allJsonBlocks = cleaned.match(/\{[^{}]*\}/g);
  if (allJsonBlocks) {
    for (const block of allJsonBlocks) {
      const result = tryParseBucketJson(block);
      if (result) return result;
    }
  }

  const lastBrace = cleaned.lastIndexOf('}');
  if (lastBrace !== -1) {
    const lastOpen = cleaned.lastIndexOf('{', lastBrace);
    if (lastOpen !== -1 && lastOpen < lastBrace) {
      const result = tryParseBucketJson(cleaned.slice(lastOpen, lastBrace + 1));
      if (result) return result;
    }
  }

  console.error('[AI] parseAiResponse failed, raw content:', content.slice(0, 500));
  return { success: false, error: 'AI 返回格式无法解析', rawContent: cleaned.slice(0, 200) };
}

export interface AiTestResult {
  success: boolean;
  message: string;
  model?: string;
  latency?: number;
}

export async function testAiConnection(config: AiConfig): Promise<AiTestResult> {
  const start = Date.now();
  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user' as const, content: 'Reply with exactly one word: ok' }],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    const latency = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[AI] testAiConnection HTTP error:', response.status, errorText.slice(0, 500));
      if (response.status === 401) return { success: false, message: 'API Key 无效或未授权', latency };
      if (response.status === 404) return { success: false, message: 'API 地址不正确或模型不存在', latency };
      if (response.status === 429) return { success: false, message: 'API 请求频率超限，请稍后重试', latency };
      if (response.status === 503) return { success: false, message: '服务暂时不可用（模型过载或维护中），请稍后重试或更换模型', latency };
      return { success: false, message: `API 错误 (${response.status}): ${errorText.slice(0, 200)}`, latency };
    }

    const data = await response.json();
    const modelUsed = data.model ?? config.model;
    return {
      success: true,
      message: '连接成功',
      model: modelUsed,
      latency,
    };
  } catch (e) {
    console.error('[AI] testAiConnection network error:', e);
    return { success: false, message: `网络错误: ${e instanceof Error ? e.message : '无法连接到 API 服务器'}`, latency: Date.now() - start };
  }
}

export async function callAiApi(
  config: AiConfig,
  imageBase64: string,
  prompt: string,
  signal?: AbortSignal,
  photoName?: string,
  photoSize?: number,
  photoDate?: number,
): Promise<AiApiResponse> {
  let messageContent: unknown;

  if (config.supportsVision) {
    messageContent = [
      { type: 'text' as const, text: prompt },
      { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
    ];
  } else {
    const metaLines: string[] = [];
    if (photoName) metaLines.push(`文件名: ${photoName}`);
    if (photoSize !== undefined) metaLines.push(`文件大小: ${formatSizeForAi(photoSize)}`);
    if (photoDate !== undefined) metaLines.push(`拍摄/修改时间: ${new Date(photoDate).toLocaleString('zh-CN')}`);
    const meta = metaLines.length > 0 ? `照片信息:\n${metaLines.join('\n')}\n\n` : '';
    messageContent = `${meta}${prompt}\n\n注意：你无法看到图片，请根据文件名、大小、时间等元信息推断分类。无法判断时使用 stash 或 keep。`;
  }

  const body = {
    model: config.model,
    messages: [
      {
        role: 'user' as const,
        content: messageContent,
      },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  };

  try {
    console.log('[AI] callAiApi sending request, model:', config.model, 'endpoint:', config.apiEndpoint);
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[AI] callAiApi HTTP error:', response.status, errorText.slice(0, 500));
      if (response.status === 401) return { success: false, error: 'API Key 无效或未授权' };
      if (response.status === 429) return { success: false, error: 'API 请求频率超限，请稍后重试' };
      if (response.status === 400) return { success: false, error: `请求格式错误: ${errorText.slice(0, 200)}` };
      if (response.status === 503) return { success: false, error: '服务暂时不可用（模型过载或维护中），请稍后重试或更换模型' };
      return { success: false, error: `API 错误 (${response.status}): ${errorText.slice(0, 200)}` };
    }

    const data = await response.json();

    if (data.error) {
      console.error('[AI] callAiApi API returned error object:', JSON.stringify(data.error).slice(0, 500));
      return { success: false, error: data.error.message ?? JSON.stringify(data.error).slice(0, 200) };
    }

    const content: string = data.choices?.[0]?.message?.content ?? '';
    if (!content) {
      console.error('[AI] callAiApi empty content, full response:', JSON.stringify(data).slice(0, 500));
      return { success: false, error: 'AI 返回内容为空' };
    }

    console.log('[AI] callAiApi got content, length:', content.length, 'preview:', content.slice(0, 150));
    const parsed = parseAiResponse(content);
    if (parsed.success) {
      const u = data.usage;
      parsed.usage = {
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
        totalTokens: u?.total_tokens ?? 0,
      };
    }
    return parsed;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    console.error('[AI] callAiApi exception:', e);
    return { success: false, error: `网络错误: ${e instanceof Error ? e.message : '未知'}` };
  }
}
