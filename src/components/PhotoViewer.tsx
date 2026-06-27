import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { PhotoEntry } from '../lib/types';
import type { AiSuggestion } from '../lib/ai-types';
import { CATEGORY_LABELS, CATEGORY_COLORS, UNPREVIEWABLE_EXTENSIONS } from '../lib/constants';

interface PhotoViewerProps {
  photo: PhotoEntry | null;
  suggestion: AiSuggestion | null;
}

function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}

function PhotoLoader({ photo }: { photo: PhotoEntry }): ReactNode {
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const file = await photo.fileHandle.getFile();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(file);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [photo]);

  const ext = getExt(photo.name);
  const isUnpreviewable = UNPREVIEWABLE_EXTENSIONS.has(ext);

  if (isUnpreviewable) {
    return (
      <div className="photo-unpreviewable">
        <p className="unpreviewable-icon">&#128443;</p>
        <p>当前浏览器无法预览 {ext.toUpperCase()} 格式</p>
        <p>仍可使用方向键分类此照片</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="photo-unpreviewable">
        <p>图片加载失败</p>
        <p>仍可使用方向键分类此照片</p>
      </div>
    );
  }

  if (url) {
    return <img src={url} alt={photo.name} className="photo-img" />;
  }

  return <div className="photo-loading">加载中...</div>;
}

export function PhotoViewer({ photo, suggestion }: PhotoViewerProps): ReactNode {
  if (!photo) {
    return <div className="photo-viewer-empty">没有更多照片</div>;
  }

  return (
    <div className="photo-viewer-container">
      <div className="photo-viewer">
        <PhotoLoader key={photo.relativePath} photo={photo} />
        {suggestion && (
          <div className="ai-suggestion-badge" style={{ borderColor: CATEGORY_COLORS[suggestion.bucket] }}>
            <span className="suggestion-bucket" style={{ color: CATEGORY_COLORS[suggestion.bucket] }}>
              AI: {CATEGORY_LABELS[suggestion.bucket]}
            </span>
            <span className="suggestion-conf">{(suggestion.confidence * 100).toFixed(0)}%</span>
            <span className="suggestion-reason">{suggestion.reason}</span>
          </div>
        )}
      </div>
      <div className="photo-info">
        <span className="photo-name">{photo.name}</span>
        <span className="photo-path">{photo.relativePath}</span>
        <span className="photo-size">{formatSize(photo.size)}</span>
        <span className="photo-date">{formatDate(photo.lastModified)}</span>
      </div>
    </div>
  );
}
