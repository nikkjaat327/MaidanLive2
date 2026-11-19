import { useEffect, useRef, useState } from 'react';
import { Award, Check, Copy, Download, Share2 } from 'lucide-react';
import { Modal } from './Modal.tsx';

export type ShareCardPayload =
  | {
      type: 'LIVE_SCORE';
      title: string;
      sport: string;
      tournamentName?: string;
      statusLabel: string;
      teamAName: string;
      teamBName: string;
      teamAScore: string;
      teamBScore: string;
      teamASecondary?: string;
      teamBSecondary?: string;
      venueName?: string;
      shareUrl?: string;
    }
  | {
      type: 'MATCH_RESULT';
      title: string;
      sport: string;
      tournamentName?: string;
      resultText: string;
      winnerName?: string;
      mvpName?: string;
      teamAName: string;
      teamBName: string;
      teamAScore: string;
      teamBScore: string;
      teamASecondary?: string;
      teamBSecondary?: string;
      shareUrl?: string;
    }
  | {
      type: 'PLAYER_AWARD';
      playerName: string;
      sport: string;
      teamName?: string;
      role?: string;
      jerseyNumber?: number | null;
      mvpAwards?: number;
      stats: Array<{ label: string; value: string | number }>;
      shareUrl?: string;
    };

interface ShareCardModalProps {
  open: boolean;
  onClose: () => void;
  card: ShareCardPayload;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(/\s+/);
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        ctx.fillText(`${line}...`, x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

export function ShareCardModal({ open, onClose, card }: ShareCardModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    card.shareUrl ||
    (typeof window !== 'undefined' ? window.location.href : 'https://maidanlive.app');

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function renderCard() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      setRendering(true);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const W = 1080;
      const H = 1350;
      canvas.width = W;
      canvas.height = H;

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      bgGrad.addColorStop(0, '#090D16');
      bgGrad.addColorStop(0.55, '#0F172A');
      bgGrad.addColorStop(1, '#1E1B2E');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Subtle stadium accent glow
      const glow = ctx.createRadialGradient(W * 0.85, 160, 20, W * 0.85, 160, 480);
      glow.addColorStop(0, 'rgba(234, 88, 12, 0.25)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Outer border card frame
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 3;
      drawRoundedRect(ctx, 48, 48, W - 96, H - 96, 36);
      ctx.stroke();

      // Top Brand Header
      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.arc(108, 124, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 40px system-ui, -apple-system, sans-serif';
      ctx.fillText('MaidanLive', 138, 138);

      // Card Type Badge
      const badgeLabel =
        card.type === 'LIVE_SCORE'
          ? card.statusLabel.toUpperCase()
          : card.type === 'MATCH_RESULT'
            ? 'FINAL RESULT'
            : 'PLAYER SPOTLIGHT';
      const badgeBg =
        card.type === 'LIVE_SCORE'
          ? '#DC2626'
          : card.type === 'MATCH_RESULT'
            ? '#059669'
            : '#EA580C';

      ctx.font = '700 24px system-ui, -apple-system, sans-serif';
      const badgeWidth = Math.max(210, ctx.measureText(badgeLabel).width + 56);
      ctx.fillStyle = badgeBg;
      drawRoundedRect(ctx, W - 96 - badgeWidth, 94, badgeWidth, 58, 14);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(badgeLabel, W - 96 - badgeWidth / 2, 132);
      ctx.textAlign = 'left';

      // Body by card type
      if (card.type === 'LIVE_SCORE' || card.type === 'MATCH_RESULT') {
        ctx.fillStyle = '#F97316';
        ctx.font = '700 28px system-ui, -apple-system, sans-serif';
        const subHeader = [card.sport.toUpperCase(), card.tournamentName].filter(Boolean).join(' · ');
        ctx.fillText(subHeader, 96, 240);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 50px system-ui, -apple-system, sans-serif';
        const afterTitleY = wrapText(ctx, card.title, 96, 315, W - 192, 64, 2);

        // Score Panel
        const boxY = Math.max(430, afterTitleY + 25);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, 96, boxY, W - 192, 420, 28);
        ctx.fill();
        ctx.stroke();

        // Divider between teams
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(140, boxY + 210);
        ctx.lineTo(W - 140, boxY + 210);
        ctx.stroke();

        // Team A row
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 40px system-ui, -apple-system, sans-serif';
        ctx.fillText(card.teamAName.slice(0, 22), 140, boxY + 100);
        if (card.teamASecondary) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 26px system-ui, -apple-system, sans-serif';
          ctx.fillText(card.teamASecondary, 140, boxY + 148);
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 68px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(card.teamAScore || '0', W - 140, boxY + 125);
        ctx.textAlign = 'left';

        // Team B row
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 40px system-ui, -apple-system, sans-serif';
        ctx.fillText(card.teamBName.slice(0, 22), 140, boxY + 310);
        if (card.teamBSecondary) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 26px system-ui, -apple-system, sans-serif';
          ctx.fillText(card.teamBSecondary, 140, boxY + 358);
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 68px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(card.teamBScore || '0', W - 140, boxY + 335);
        ctx.textAlign = 'left';

        // Footer Info Banner (Venue or Result / MVP)
        const infoY = boxY + 465;
        if (card.type === 'MATCH_RESULT') {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
          drawRoundedRect(ctx, 96, infoY, W - 192, 130, 22);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#6EE7B7';
          ctx.font = '700 30px system-ui, -apple-system, sans-serif';
          wrapText(ctx, card.resultText || 'Match Completed', 132, infoY + 55, W - 264, 40, 2);

          if (card.mvpName) {
            ctx.fillStyle = '#FDE68A';
            ctx.font = '700 24px system-ui, -apple-system, sans-serif';
            ctx.fillText(`Player of the Match: ${card.mvpName}`, 132, infoY + 104);
          }
        } else if (card.venueName) {
          ctx.fillStyle = '#CBD5E1';
          ctx.font = '600 28px system-ui, -apple-system, sans-serif';
          ctx.fillText(`Venue: ${card.venueName}`, 96, infoY + 45);
        }
      } else {
        // PLAYER_AWARD Card
        ctx.fillStyle = '#F97316';
        ctx.font = '700 28px system-ui, -apple-system, sans-serif';
        const headerMeta = [
          card.sport.toUpperCase(),
          card.role,
          card.jerseyNumber !== null && card.jerseyNumber !== undefined ? `#${card.jerseyNumber}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        ctx.fillText(headerMeta, 96, 240);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 62px system-ui, -apple-system, sans-serif';
        const afterNameY = wrapText(ctx, card.playerName, 96, 325, W - 192, 74, 2);

        if (card.teamName) {
          ctx.fillStyle = '#6EE7B7';
          ctx.font = '700 32px system-ui, -apple-system, sans-serif';
          ctx.fillText(card.teamName, 96, afterNameY + 16);
        }

        // Stats Grid
        const gridY = Math.max(460, afterNameY + 70);
        const items = card.stats.slice(0, 4);
        const cardW = (W - 192 - 24) / 2;
        const cardH = 185;
        items.forEach((item, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const x = 96 + col * (cardW + 24);
          const y = gridY + row * (cardH + 24);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, x, y, cardW, cardH, 24);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 26px system-ui, -apple-system, sans-serif';
          ctx.fillText(item.label.toUpperCase(), x + 32, y + 60);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 64px ui-monospace, SFMono-Regular, monospace';
          ctx.fillText(String(item.value), x + 32, y + 142);
        });

        if (card.mvpAwards && card.mvpAwards > 0) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          drawRoundedRect(ctx, 96, gridY + 418, W - 192, 84, 20);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FCD34D';
          ctx.font = '700 30px system-ui, -apple-system, sans-serif';
          ctx.fillText(
            `${card.mvpAwards}x Official Player of the Match Award${card.mvpAwards === 1 ? '' : 's'}`,
            128,
            gridY + 470
          );
        }
      }

      // Bottom Branded CTA Footer Section (No QR Code)
      const footerY = H - 250;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, 96, footerY, W - 192, 156, 26);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#EA580C';
      drawRoundedRect(ctx, 130, footerY + 34, 14, 88, 7);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 32px system-ui, -apple-system, sans-serif';
      ctx.fillText('Watch Live Scores & Video on MaidanLive', 168, footerY + 66);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '500 22px system-ui, -apple-system, sans-serif';
      ctx.fillText('Ball-by-ball updates, official scorecards & grassroots broadcasts', 168, footerY + 104);
      ctx.fillStyle = '#F97316';
      ctx.font = '600 21px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(shareUrl.slice(0, 62), 168, footerY + 138);

      if (active) {
        setPreviewUrl(canvas.toDataURL('image/png'));
        setRendering(false);
      }
    }

    renderCard().catch(() => {
      if (active) setRendering(false);
    });

    return () => {
      active = false;
    };
  }, [open, card, shareUrl]);

  function handleDownloadPng() {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `maidanlive-${card.type.toLowerCase()}.png`;
    link.click();
  }

  async function handleShareCard() {
    const title = card.type === 'PLAYER_AWARD' ? card.playerName : card.title;
    const text =
      card.type === 'PLAYER_AWARD'
        ? `Check out ${card.playerName} on MaidanLive`
        : `${card.title} on MaidanLive`;

    if (previewUrl && typeof navigator !== 'undefined' && navigator.share) {
      try {
        const res = await fetch(previewUrl);
        const blob = await res.blob();
        const file = new File([blob], `maidanlive-${card.type.toLowerCase()}.png`, {
          type: 'image/png',
        });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, files: [file], url: shareUrl });
          return;
        }
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  const shareText =
    card.type === 'PLAYER_AWARD'
      ? `${card.playerName} (${card.sport}) on MaidanLive`
      : `${card.title} — ${card.teamAName} vs ${card.teamBName} on MaidanLive`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shareable Sports Card"
      subtitle="Download or share this live score & match card on WhatsApp or social feeds."
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <canvas ref={canvasRef} className="hidden" />

        <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[280px]">
          {rendering || !previewUrl ? (
            <div className="py-16 text-xs text-slate-400 inline-flex items-center gap-2">
              <Award className="w-4 h-4 animate-pulse text-orange-400" />
              <span>Generating HD sports card...</span>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt="MaidanLive Share Card"
              className="w-full max-h-[460px] object-contain"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!previewUrl}
            onClick={handleDownloadPng}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Download PNG</span>
          </button>

          <button
            type="button"
            onClick={handleShareCard}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-700"
          >
            <Share2 className="w-4 h-4" />
            <span>Share Image / Link</span>
          </button>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
          >
            <span>WhatsApp Link</span>
          </a>

          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-200"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Link Copied' : 'Copy Match URL'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
