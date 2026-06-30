import type { ReactNode } from 'react';

interface WelcomeViewProps {
  onSelect: () => void;
  storageLabel: string;
  isAndroidWeb: boolean;
}

export function WelcomeView({ onSelect, storageLabel, isAndroidWeb }: WelcomeViewProps): ReactNode {
  return (
    <div className="welcome-view">
      <h2>选择照片文件夹开始筛选</h2>
      <p>支持 JPG、PNG、WebP、GIF、BMP、HEIC/HEIF 格式</p>
      <p className="welcome-hint">{storageLabel}</p>
      {isAndroidWeb && (
        <p className="welcome-note">安卓网页模式会先验证目录写入和删除能力，验证失败时请改用 APK 路线。</p>
      )}
      <button className="btn-select" onClick={onSelect}>
        选择照片文件夹
      </button>
    </div>
  );
}

export function UnsupportedView({ reason }: { reason: string }): ReactNode {
  return (
    <div className="unsupported-view">
      <h2>浏览器不支持 File System Access API</h2>
      <p>{reason}</p>
    </div>
  );
}
