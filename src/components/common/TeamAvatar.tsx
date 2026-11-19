import { useEffect, useState } from 'react';

interface TeamAvatarProps {
  name: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamAvatar({ name, logoUrl, size = 'md' }: TeamAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const dims =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
        ? 'w-12 h-12 text-base'
        : 'w-10 h-10 text-sm';

  const initials = (name || 'T')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${dims} rounded-lg object-cover border border-slate-200 bg-white shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dims} rounded-lg bg-slate-900 text-white font-display font-bold flex items-center justify-center shrink-0 tracking-tight`}
    >
      {initials || 'TM'}
    </div>
  );
}
