import type { ReactNode } from 'react';

interface HeaderProps {
  folderName: string;
  onReselect: () => void;
}

export function Header({ folderName, onReselect }: HeaderProps): ReactNode {
  return (
    <header className="header">
      <div className="header-title">
        <h1>Photo Quick Filter</h1>
        {folderName && <span className="folder-name">{folderName}</span>}
      </div>
      <button className="btn-reselect" onClick={onReselect}>
        重新选择文件夹
      </button>
    </header>
  );
}
