import type { PhotoEntry } from './types';
import type { AiConfig, AiPhotoAnalysis } from './ai-types';
import { getExtension } from './scanner';
import { UNPREVIEWABLE_EXTENSIONS } from './constants';
import { callAiApi } from './ai-service';
import { prepareImage } from './ai-image';

export async function analyzeOnePhoto(
  config: AiConfig,
  prompt: string,
  photo: PhotoEntry,
  signal?: AbortSignal,
): Promise<AiPhotoAnalysis> {
  const ext = getExtension(photo.name);
  if (UNPREVIEWABLE_EXTENSIONS.has(ext)) {
    return {
      photo,
      suggestion: null,
      error: `${ext.toUpperCase()} 格式无法预览，需手动分类`,
    };
  }

  const imageBase64 = await prepareImage(photo, config.maxImageSize);
  if (config.supportsVision && !imageBase64) {
    return { photo, suggestion: null, error: '图片加载失败' };
  }

  const aiResponse = await callAiApi(
    config,
    imageBase64 ?? '',
    prompt,
    signal,
    photo.name,
    photo.size,
    photo.lastModified,
  );

  if (!aiResponse.success) {
    return { photo, suggestion: null, error: aiResponse.error };
  }

  return {
    photo,
    suggestion: {
      bucket: aiResponse.bucket,
      confidence: aiResponse.confidence,
      reason: aiResponse.reason,
    },
    usage: aiResponse.usage,
  };
}
