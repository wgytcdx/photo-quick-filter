import type { ReactNode } from 'react';

export function WelcomeView({ onSelect }: { onSelect: () => void }): ReactNode {
  return (
    <div className="welcome-view">
      <h2>选择照片文件夹开始筛选</h2>
      <p>支持 JPG、PNG、WebP、GIF、BMP、HEIC/HEIF 格式</p>
      <p className="welcome-hint">需要 Chrome 或 Edge 浏览器</p>
      <button className="btn-select" onClick={onSelect}>
        选择照片文件夹
      </button>
    </div>
  );
}

export function UnsupportedView(): ReactNode {
  return (
    <div className="unsupported-view">
      <h2>浏览器不支持 File System Access API</h2>
      <p>请使用 Chrome 或 Edge 浏览器访问此工具</p>
    </div>
  );
}
