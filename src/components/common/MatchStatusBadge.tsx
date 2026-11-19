import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  PauseCircle,
  Radio,
  Timer,
} from 'lucide-react';
import {
  getMatchStatusMeta,
  resolveMatchStatus,
  StandardMatchStatus,
} from '../../utils/matchStatus.ts';
import { LiveScoreData, LiveStreamData } from '../../types/index.ts';

interface MatchStatusBadgeProps {
  status?: StandardMatchStatus;
  stream?: Pick<LiveStreamData, 'status'> | null;
  score?: Pick<LiveScoreData, 'matchStatus' | 'resultStatus'> | null;
  rawStatus?: string | null;
  dark?: boolean;
  compact?: boolean;
  className?: string;
}

export function MatchStatusBadge({
  status,
  stream,
  score,
  rawStatus,
  dark = false,
  compact = false,
  className = '',
}: MatchStatusBadgeProps) {
  const resolved = status || resolveMatchStatus(stream, score, rawStatus);
  const meta = getMatchStatusMeta(resolved);

  const renderIcon = () => {
    const iconCls = 'w-3 h-3 shrink-0';
    switch (resolved) {
      case 'LIVE':
        return <Radio className={iconCls} />;
      case 'UPCOMING':
        return <Clock className={iconCls} />;
      case 'BREAK':
      case 'INNINGS BREAK':
        return <PauseCircle className={iconCls} />;
      case 'DELAYED':
        return <Timer className={iconCls} />;
      case 'INTERRUPTED':
        return <AlertTriangle className={iconCls} />;
      case 'COMPLETED':
        return <CheckCircle2 className={iconCls} />;
      case 'CANCELLED':
        return <Ban className={iconCls} />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border whitespace-nowrap ${
        dark ? meta.darkBadgeClass : meta.badgeClass
      } ${className}`}
    >
      {resolved === 'LIVE' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />
      ) : (
        renderIcon()
      )}
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  );
}
