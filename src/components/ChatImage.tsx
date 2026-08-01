import { useEffect, useState } from 'react';
import { resolveChatImageUrl } from '../lib/api';

interface ChatImageProps {
  src: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export function ChatImage({ src, alt = 'תמונה', className, onClick }: ChatImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setUrl(null);

    void (async () => {
      const resolved = await resolveChatImageUrl(src);
      if (alive) setUrl(resolved);
    })();

    return () => {
      alive = false;
    };
  }, [src]);

  if (failed || !url) {
    return (
      <div className={`chat-image-fallback ${className ?? ''}`}>
        {failed ? 'לא ניתן לטעון את התמונה' : 'טוען תמונה…'}
      </div>
    );
  }

  if (onClick) {
    return (
      <button type="button" className="message-image-btn" onClick={onClick}>
        <img
          src={url}
          alt={alt}
          className={className}
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
