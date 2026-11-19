import { useEffect, useState } from 'react';
import { ExternalLink, Megaphone } from 'lucide-react';
import { SponsorOverlayData } from '../../types/index.ts';

interface SponsorOverlayBannerProps {
  overlays: SponsorOverlayData[];
}

export function SponsorOverlayBanner({ overlays }: SponsorOverlayBannerProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (overlays.length <= 1) {
      setIndex(0);
      return;
    }
    const current = overlays[index % overlays.length];
    const durationMs = Math.max(4, current?.durationSeconds || 12) * 1000;
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % overlays.length);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [overlays, index]);

  if (overlays.length === 0) return null;
  const active = overlays[index % overlays.length];
  const sponsor = active?.sponsor;
  if (!sponsor) return null;

  const content = (
    <div className="pointer-events-auto inline-flex items-center gap-2.5 px-3 py-1.5 rounded bg-slate-950/88 border border-white/15 backdrop-blur-md text-white shadow-lg max-w-full">
      {sponsor.logoUrl && (
        <img
          src={sponsor.logoUrl}
          alt={sponsor.name}
          className="w-6 h-6 rounded object-contain bg-white/95 p-0.5 shrink-0"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}
      <div className="min-w-0 text-left">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300 font-bold">
          {active.mode === 'ANNOUNCEMENT' && <Megaphone className="w-3 h-3 shrink-0" />}
          <span className="truncate">{sponsor.sponsorshipType || 'Official Sponsor'}</span>
        </div>
        <p className="text-xs font-semibold truncate">
          {active.mode === 'ANNOUNCEMENT' && active.announcementText
            ? `${sponsor.name}: ${active.announcementText}`
            : sponsor.name}
        </p>
      </div>
      {sponsor.websiteUrl && <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />}
    </div>
  );

  if (sponsor.websiteUrl) {
    return (
      <a
        href={sponsor.websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block max-w-full"
      >
        {content}
      </a>
    );
  }

  return content;
}
