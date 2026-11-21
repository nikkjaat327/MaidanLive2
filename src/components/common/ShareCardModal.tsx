import { useEffect, useRef, useState } from 'react';
import { Award, Check, Copy, Download, Share2 } from 'lucide-react';
import { TournamentPrizesConfig } from '../../types/index.ts';
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
      teamALogo?: string;
      teamBLogo?: string;
      venueName?: string;
      shareUrl?: string;
    }
  | {
      type: 'UPCOMING_MATCH';
      title: string;
      sport: string;
      tournamentName?: string;
      scheduledText?: string;
      venueName?: string;
      teamAName: string;
      teamBName: string;
      teamALogo?: string;
      teamBLogo?: string;
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
      teamALogo?: string;
      teamBLogo?: string;
      shareUrl?: string;
    }
  | {
      type: 'REPLAY';
      title: string;
      sport: string;
      tournamentName?: string;
      resultText?: string;
      winnerName?: string;
      teamAName: string;
      teamBName: string;
      teamAScore: string;
      teamBScore: string;
      teamASecondary?: string;
      teamBSecondary?: string;
      teamALogo?: string;
      teamBLogo?: string;
      shareUrl?: string;
    }
  | {
      type: 'TOURNAMENT';
      title: string;
      sport: string;
      format?: string;
      status: string;
      season?: string;
      location?: string;
      datesText?: string;
      prizeMoney?: string;
      prizes?: TournamentPrizesConfig;
      teamCount?: number;
      logoUrl?: string;
      shareUrl?: string;
    }
  | {
      type: 'TEAM';
      teamName: string;
      shortName?: string;
      sport: string;
      city?: string;
      captainName?: string;
      tournamentName?: string;
      teamLogoUrl?: string;
      record?: { played: number; won: number; lost: number; drawn: number };
      players?: Array<{
        name: string;
        role?: string;
        jerseyNumber?: number | null;
        avatarUrl?: string;
      }>;
      shareUrl?: string;
    }
  | {
      type: 'PLAYER_AWARD';
      playerName: string;
      sport: string;
      teamName?: string;
      role?: string;
      jerseyNumber?: number | null;
      avatarUrl?: string;
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
  const words = String(text || '').split(/\s+/).filter(Boolean);
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

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'ML';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

async function loadImageForCanvas(url?: string): Promise<HTMLImageElement | null> {
  const clean = url?.trim();
  if (!clean) return null;

  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 3500);

    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(img.naturalWidth > 0 ? img : null);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    };

    img.src = clean;
  });
}

function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  fallbackName: string,
  cx: number,
  cy: number,
  radius: number,
  bgColor = '#1E293B',
  borderColor = 'rgba(255,255,255,0.2)'
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.clip();

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const scale = Math.max((radius * 2) / img.naturalWidth, (radius * 2) / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  } else {
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `800 ${Math.round(radius * 0.72)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(fallbackName), cx, cy + 1);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function getCardTitle(card: ShareCardPayload): string {
  switch (card.type) {
    case 'PLAYER_AWARD':
      return card.playerName;
    case 'TEAM':
      return card.teamName;
    default:
      return card.title;
  }
}

function getShareSummaryText(card: ShareCardPayload): string {
  switch (card.type) {
    case 'PLAYER_AWARD':
      return `${card.playerName} (${card.sport}) on MaidanLive`;
    case 'TEAM':
      return `${card.teamName} Squad (${card.sport}) on MaidanLive`;
    case 'TOURNAMENT':
      return `${card.title} (${card.sport}) on MaidanLive`;
    case 'REPLAY':
      return `Watch Replay: ${card.title} — ${card.teamAName} vs ${card.teamBName} on MaidanLive`;
    case 'UPCOMING_MATCH':
      return `Upcoming Match: ${card.teamAName} vs ${card.teamBName} on MaidanLive`;
    default:
      return `${card.title} — ${card.teamAName} vs ${card.teamBName} on MaidanLive`;
  }
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

      // Preload optional remote assets safely (CORS-safe fallback to initials)
      let teamAImg: HTMLImageElement | null = null;
      let teamBImg: HTMLImageElement | null = null;
      let logoImg: HTMLImageElement | null = null;
      let playerImg: HTMLImageElement | null = null;
      let rosterImgs: Array<HTMLImageElement | null> = [];

      if (
        card.type === 'LIVE_SCORE' ||
        card.type === 'UPCOMING_MATCH' ||
        card.type === 'MATCH_RESULT' ||
        card.type === 'REPLAY'
      ) {
        [teamAImg, teamBImg] = await Promise.all([
          loadImageForCanvas(card.teamALogo),
          loadImageForCanvas(card.teamBLogo),
        ]);
      } else if (card.type === 'TOURNAMENT') {
        logoImg = await loadImageForCanvas(card.logoUrl);
      } else if (card.type === 'TEAM') {
        const visiblePlayers = (card.players || []).slice(0, 12);
        [logoImg, ...rosterImgs] = await Promise.all([
          loadImageForCanvas(card.teamLogoUrl),
          ...visiblePlayers.map((p) => loadImageForCanvas(p.avatarUrl)),
        ]);
      } else if (card.type === 'PLAYER_AWARD') {
        playerImg = await loadImageForCanvas(card.avatarUrl);
      }

      if (!active) return;

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
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('MaidanLive', 138, 138);

      // Card Type Badge
      const badgeLabel =
        card.type === 'LIVE_SCORE'
          ? card.statusLabel.toUpperCase()
          : card.type === 'UPCOMING_MATCH'
            ? 'UPCOMING MATCH'
            : card.type === 'MATCH_RESULT'
              ? 'FINAL RESULT'
              : card.type === 'REPLAY'
                ? 'FULL REPLAY'
                : card.type === 'TOURNAMENT'
                  ? card.status.toUpperCase()
                  : card.type === 'TEAM'
                    ? 'TEAM SQUAD'
                    : 'PLAYER SPOTLIGHT';

      const badgeBg =
        card.type === 'LIVE_SCORE'
          ? '#DC2626'
          : card.type === 'UPCOMING_MATCH'
            ? '#D97706'
            : card.type === 'MATCH_RESULT'
              ? '#059669'
              : card.type === 'REPLAY'
                ? '#2563EB'
                : card.type === 'TOURNAMENT'
                  ? card.status === 'ONGOING'
                    ? '#059669'
                    : '#D97706'
                  : card.type === 'TEAM'
                    ? '#0D9488'
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
      if (card.type === 'TOURNAMENT') {
        const hasLogo = Boolean(logoImg);
        if (hasLogo && logoImg) {
          drawCircularAvatar(ctx, logoImg, card.title, 152, 268, 56, '#1E293B', 'rgba(249,115,22,0.5)');
        }
        const headerX = hasLogo ? 236 : 96;
        const headerW = W - headerX - 96;

        ctx.fillStyle = '#F97316';
        ctx.font = '700 26px system-ui, -apple-system, sans-serif';
        const subMeta = [
          card.sport.toUpperCase(),
          card.format ? card.format.replace(/_/g, ' ') : '',
          card.season || '',
        ]
          .filter(Boolean)
          .join(' · ');
        ctx.fillText(subMeta, headerX, 240);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 50px system-ui, -apple-system, sans-serif';
        const afterTitleY = wrapText(ctx, card.title, headerX, 312, headerW, 62, 2);

        // Meta strip (Location / Dates / Teams)
        const metaRowY = Math.max(415, afterTitleY + 18);
        const metaItems = [
          card.location ? `Ground: ${card.location}` : '',
          card.datesText ? `Dates: ${card.datesText}` : '',
          typeof card.teamCount === 'number' && card.teamCount > 0 ? `${card.teamCount} Teams` : '',
        ].filter(Boolean);

        if (metaItems.length > 0) {
          ctx.fillStyle = '#CBD5E1';
          ctx.font = '600 26px system-ui, -apple-system, sans-serif';
          wrapText(ctx, metaItems.join('   ·   '), 96, metaRowY, W - 192, 38, 2);
        }

        // Prize Tiers Section
        const prizeStartY = metaItems.length > 0 ? metaRowY + 95 : metaRowY + 25;
        const tiers: Array<{
          rank: string;
          amount: string;
          label: string;
          bg: string;
          border: string;
          accent: string;
        }> = [];
        if (card.prizes?.first && (card.prizes.first.amount?.trim() || card.prizes.first.label?.trim())) {
          tiers.push({
            rank: '1ST PRIZE',
            amount: card.prizes.first.amount?.trim() || '',
            label: card.prizes.first.label?.trim() || 'Champions',
            bg: 'rgba(245, 158, 11, 0.16)',
            border: 'rgba(251, 191, 36, 0.55)',
            accent: '#FCD34D',
          });
        }
        if (card.prizes?.second && (card.prizes.second.amount?.trim() || card.prizes.second.label?.trim())) {
          tiers.push({
            rank: '2ND PRIZE',
            amount: card.prizes.second.amount?.trim() || '',
            label: card.prizes.second.label?.trim() || 'Runners-Up',
            bg: 'rgba(148, 163, 184, 0.16)',
            border: 'rgba(203, 213, 225, 0.4)',
            accent: '#E2E8F0',
          });
        }
        if (card.prizes?.third && (card.prizes.third.amount?.trim() || card.prizes.third.label?.trim())) {
          tiers.push({
            rank: '3RD PRIZE',
            amount: card.prizes.third.amount?.trim() || '',
            label: card.prizes.third.label?.trim() || 'Third Place',
            bg: 'rgba(234, 88, 12, 0.14)',
            border: 'rgba(251, 146, 60, 0.45)',
            accent: '#FDBA74',
          });
        }

        if (tiers.length > 0) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '700 22px system-ui, -apple-system, sans-serif';
          ctx.fillText('OFFICIAL PRIZES & HONOURS', 96, prizeStartY - 18);

          const tierH = 118;
          tiers.forEach((tier, idx) => {
            const y = prizeStartY + idx * (tierH + 18);
            ctx.fillStyle = tier.bg;
            ctx.strokeStyle = tier.border;
            ctx.lineWidth = 2;
            drawRoundedRect(ctx, 96, y, W - 192, tierH, 22);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = tier.accent;
            ctx.font = '800 24px system-ui, -apple-system, sans-serif';
            ctx.fillText(tier.rank, 132, y + 44);

            ctx.fillStyle = '#F8FAFC';
            ctx.font = '600 28px system-ui, -apple-system, sans-serif';
            ctx.fillText(tier.label.slice(0, 32), 132, y + 86);

            if (tier.amount) {
              ctx.fillStyle = '#FFFFFF';
              ctx.font = '800 40px ui-monospace, SFMono-Regular, monospace';
              ctx.textAlign = 'right';
              ctx.fillText(tier.amount.slice(0, 18), W - 132, y + 72);
              ctx.textAlign = 'left';
            }
          });
        } else if (card.prizeMoney?.trim()) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, 96, prizeStartY, W - 192, 160, 24);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#FCD34D';
          ctx.font = '700 24px system-ui, -apple-system, sans-serif';
          ctx.fillText('TOTAL PRIZE POOL', 136, prizeStartY + 56);

          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 46px system-ui, -apple-system, sans-serif';
          ctx.fillText(card.prizeMoney.trim().slice(0, 28), 136, prizeStartY + 118);
        }
      } else if (card.type === 'TEAM') {
        drawCircularAvatar(
          ctx,
          logoImg,
          card.teamName,
          154,
          268,
          58,
          '#0F172A',
          'rgba(20, 184, 166, 0.55)'
        );

        ctx.fillStyle = '#2DD4BF';
        ctx.font = '700 26px system-ui, -apple-system, sans-serif';
        const teamMeta = [card.sport.toUpperCase(), card.shortName, card.city].filter(Boolean).join(' · ');
        ctx.fillText(teamMeta, 240, 236);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 50px system-ui, -apple-system, sans-serif';
        const afterTeamY = wrapText(ctx, card.teamName, 240, 304, W - 336, 58, 2);

        const subLine = [
          card.captainName ? `Captain: ${card.captainName}` : '',
          card.tournamentName || '',
        ]
          .filter(Boolean)
          .join('  ·  ');
        if (subLine) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 24px system-ui, -apple-system, sans-serif';
          ctx.fillText(subLine.slice(0, 52), 240, afterTeamY + 6);
        }

        // Optional Record Strip
        let listStartY = Math.max(418, afterTeamY + 54);
        if (card.record && card.record.played > 0) {
          const recItems = [
            { label: 'PLAYED', val: card.record.played },
            { label: 'WON', val: card.record.won },
            { label: 'LOST', val: card.record.lost },
            { label: 'DRAW/TIE', val: card.record.drawn },
          ];
          const pillW = (W - 192 - 36) / 4;
          recItems.forEach((it, idx) => {
            const x = 96 + idx * (pillW + 12);
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1.5;
            drawRoundedRect(ctx, x, listStartY, pillW, 74, 16);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#94A3B8';
            ctx.font = '700 18px system-ui, -apple-system, sans-serif';
            ctx.fillText(it.label, x + 18, listStartY + 28);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '800 30px ui-monospace, SFMono-Regular, monospace';
            ctx.fillText(String(it.val), x + 18, listStartY + 60);
          });
          listStartY += 108;
        }

        // Squad Roster Grid (up to 12 players, ZERO PII)
        const roster = card.players || [];
        const visibleRoster = roster.slice(0, 12);
        ctx.fillStyle = '#CBD5E1';
        ctx.font = '700 22px system-ui, -apple-system, sans-serif';
        ctx.fillText(`OFFICIAL SQUAD (${roster.length})`, 96, listStartY);

        const gridTop = listStartY + 22;
        if (visibleRoster.length === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          drawRoundedRect(ctx, 96, gridTop, W - 192, 120, 20);
          ctx.fill();
          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 26px system-ui, -apple-system, sans-serif';
          ctx.fillText('Squad players will appear here once published.', 132, gridTop + 68);
        } else {
          const cols = 2;
          const colW = (W - 192 - 20) / cols;
          const rowH = 74;
          visibleRoster.forEach((pl, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = 96 + col * (colW + 20);
            const y = gridTop + row * (rowH + 14);
            if (y + rowH > H - 290) return;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1.5;
            drawRoundedRect(ctx, x, y, colW, rowH, 16);
            ctx.fill();
            ctx.stroke();

            drawCircularAvatar(
              ctx,
              rosterImgs[idx] || null,
              pl.name,
              x + 36,
              y + rowH / 2,
              22,
              '#1E293B',
              'rgba(255,255,255,0.2)'
            );

            ctx.fillStyle = '#FFFFFF';
            ctx.font = '700 23px system-ui, -apple-system, sans-serif';
            const jerseyTag =
              pl.jerseyNumber !== null && pl.jerseyNumber !== undefined ? `#${pl.jerseyNumber} ` : '';
            ctx.fillText(`${jerseyTag}${pl.name}`.slice(0, 22), x + 72, y + 34);

            if (pl.role) {
              ctx.fillStyle = '#94A3B8';
              ctx.font = '500 18px system-ui, -apple-system, sans-serif';
              ctx.fillText(pl.role.slice(0, 24), x + 72, y + 57);
            }
          });

          if (roster.length > visibleRoster.length) {
            ctx.fillStyle = '#FDBA74';
            ctx.font = '700 22px system-ui, -apple-system, sans-serif';
            ctx.fillText(`+${roster.length - visibleRoster.length} more squad members`, 96, H - 275);
          }
        }
      } else if (
        card.type === 'LIVE_SCORE' ||
        card.type === 'UPCOMING_MATCH' ||
        card.type === 'MATCH_RESULT' ||
        card.type === 'REPLAY'
      ) {
        ctx.fillStyle = '#F97316';
        ctx.font = '700 28px system-ui, -apple-system, sans-serif';
        const subHeader = [card.sport.toUpperCase(), card.tournamentName].filter(Boolean).join(' · ');
        ctx.fillText(subHeader, 96, 240);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 50px system-ui, -apple-system, sans-serif';
        const afterTitleY = wrapText(ctx, card.title, 96, 315, W - 192, 64, 2);

        const boxY = Math.max(430, afterTitleY + 25);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, 96, boxY, W - 192, 420, 28);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(140, boxY + 210);
        ctx.lineTo(W - 140, boxY + 210);
        ctx.stroke();

        // Team A row
        drawCircularAvatar(ctx, teamAImg, card.teamAName, 174, boxY + 105, 36, '#1E293B');
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 38px system-ui, -apple-system, sans-serif';
        ctx.fillText(card.teamAName.slice(0, 20), 230, boxY + 102);

        if (card.type === 'UPCOMING_MATCH') {
          ctx.fillStyle = '#FDBA74';
          ctx.font = '700 28px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('TEAM A', W - 140, boxY + 114);
          ctx.textAlign = 'left';
        } else {
          if (card.teamASecondary) {
            ctx.fillStyle = '#94A3B8';
            ctx.font = '600 24px system-ui, -apple-system, sans-serif';
            ctx.fillText(card.teamASecondary, 230, boxY + 148);
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 66px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(card.teamAScore || '0', W - 140, boxY + 125);
          ctx.textAlign = 'left';
        }

        // Team B row
        drawCircularAvatar(ctx, teamBImg, card.teamBName, 174, boxY + 315, 36, '#1E293B');
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '700 38px system-ui, -apple-system, sans-serif';
        ctx.fillText(card.teamBName.slice(0, 20), 230, boxY + 312);

        if (card.type === 'UPCOMING_MATCH') {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '700 28px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText('TEAM B', W - 140, boxY + 324);
          ctx.textAlign = 'left';
        } else {
          if (card.teamBSecondary) {
            ctx.fillStyle = '#94A3B8';
            ctx.font = '600 24px system-ui, -apple-system, sans-serif';
            ctx.fillText(card.teamBSecondary, 230, boxY + 358);
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 66px ui-monospace, SFMono-Regular, monospace';
          ctx.textAlign = 'right';
          ctx.fillText(card.teamBScore || '0', W - 140, boxY + 335);
          ctx.textAlign = 'left';
        }

        const infoY = boxY + 465;
        if (card.type === 'MATCH_RESULT' || (card.type === 'REPLAY' && card.resultText)) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.16)';
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
          drawRoundedRect(ctx, 96, infoY, W - 192, 130, 22);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#6EE7B7';
          ctx.font = '700 30px system-ui, -apple-system, sans-serif';
          wrapText(ctx, card.resultText || 'Match Completed', 132, infoY + 55, W - 264, 40, 2);

          if (card.type === 'MATCH_RESULT' && card.mvpName) {
            ctx.fillStyle = '#FDE68A';
            ctx.font = '700 24px system-ui, -apple-system, sans-serif';
            ctx.fillText(`Player of the Match: ${card.mvpName}`, 132, infoY + 104);
          }
        } else if (card.type === 'UPCOMING_MATCH') {
          const scheduleInfo = [card.scheduledText, card.venueName ? `Venue: ${card.venueName}` : '']
            .filter(Boolean)
            .join('  ·  ');
          if (scheduleInfo) {
            ctx.fillStyle = '#CBD5E1';
            ctx.font = '600 26px system-ui, -apple-system, sans-serif';
            wrapText(ctx, scheduleInfo, 96, infoY + 38, W - 192, 38, 2);
          }
        } else if (card.type === 'LIVE_SCORE' && card.venueName) {
          ctx.fillStyle = '#CBD5E1';
          ctx.font = '600 28px system-ui, -apple-system, sans-serif';
          ctx.fillText(`Venue: ${card.venueName}`, 96, infoY + 45);
        }
      } else {
        // PLAYER_AWARD Card (with optional compressed portrait)
        drawCircularAvatar(
          ctx,
          playerImg,
          card.playerName,
          170,
          292,
          74,
          '#1E293B',
          'rgba(249,115,22,0.6)'
        );

        ctx.fillStyle = '#F97316';
        ctx.font = '700 26px system-ui, -apple-system, sans-serif';
        const headerMeta = [
          card.sport.toUpperCase(),
          card.role,
          card.jerseyNumber !== null && card.jerseyNumber !== undefined ? `#${card.jerseyNumber}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        ctx.fillText(headerMeta, 276, 250);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 56px system-ui, -apple-system, sans-serif';
        const afterNameY = wrapText(ctx, card.playerName, 276, 322, W - 372, 66, 2);

        if (card.teamName) {
          ctx.fillStyle = '#6EE7B7';
          ctx.font = '700 30px system-ui, -apple-system, sans-serif';
          ctx.fillText(card.teamName, 276, afterNameY + 8);
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

      // Bottom Branded CTA Footer Section
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
        try {
          setPreviewUrl(canvas.toDataURL('image/png'));
        } catch {
          setPreviewUrl('');
        }
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
    const title = getCardTitle(card);
    const text = getShareSummaryText(card);

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

  const shareText = getShareSummaryText(card);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shareable Sports Card"
      subtitle="Download or share this MaidanLive card on WhatsApp or social feeds."
      maxWidthClass="max-w-lg"
      zIndexClass="z-[100]"
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
            <span>{copied ? 'Link Copied' : 'Copy Share Link'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
