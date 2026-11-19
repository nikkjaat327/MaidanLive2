import { useState } from 'react';

interface BroadcastLogoProps {
  logoUrl?: string;
  alt: string;
}

/**
 * Renders a compact 18px-20px team emblem ONLY when a valid logoUrl is present and loads.
 * Gracefully hides missing or broken logos without broken image icons or placeholder clutter.
 */
export function BroadcastLogo({ logoUrl, alt }: BroadcastLogoProps) {
  const [failed, setFailed] = useState(false);

  if (!logoUrl || !logoUrl.trim() || failed) {
    return null;
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm object-cover shrink-0 bg-white/10"
    />
  );
}
