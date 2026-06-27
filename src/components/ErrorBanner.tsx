import type { ReactNode } from 'react';

interface ErrorBannerProps {
  error: string;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps): ReactNode {
  return (
    <div className="error-banner">
      <span className="error-text">{error}</span>
      <button className="error-dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}
