import React from 'react';
import {
  ArrowRight,
  Award,
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Crown,
  Flame,
  Gift,
  Globe,
  Heart,
  MapPin,
  Megaphone,
  Percent,
  Phone,
  PlayCircle,
  QrCode,
  Radio,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Target,
  ThumbsUp,
  Ticket,
  TrendingUp,
  Trophy,
  Tv,
  Users,
  Video,
  Volume2,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const BROADCAST_ICON_OPTIONS: Array<{
  id: string;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: 'trophy', label: 'Trophy', Icon: Trophy },
  { id: 'star', label: 'Star', Icon: Star },
  { id: 'zap', label: 'Bolt', Icon: Zap },
  { id: 'flame', label: 'Flame', Icon: Flame },
  { id: 'shield', label: 'Shield', Icon: Shield },
  { id: 'award', label: 'Award', Icon: Award },
  { id: 'crown', label: 'Crown', Icon: Crown },
  { id: 'target', label: 'Target', Icon: Target },
  { id: 'sparkles', label: 'Sparkles', Icon: Sparkles },
  { id: 'radio', label: 'Live Radio', Icon: Radio },
  { id: 'tv', label: 'Broadcast TV', Icon: Tv },
  { id: 'video', label: 'Camera', Icon: Video },
  { id: 'megaphone', label: 'Promo', Icon: Megaphone },
  { id: 'ticket', label: 'Ticket', Icon: Ticket },
  { id: 'tag', label: 'Offer Tag', Icon: Tag },
  { id: 'percent', label: 'Discount %', Icon: Percent },
  { id: 'shopping-bag', label: 'Shop', Icon: ShoppingBag },
  { id: 'gift', label: 'Gift', Icon: Gift },
  { id: 'clock', label: 'Clock', Icon: Clock },
  { id: 'calendar', label: 'Schedule', Icon: Calendar },
  { id: 'map-pin', label: 'Location', Icon: MapPin },
  { id: 'phone', label: 'Phone', Icon: Phone },
  { id: 'globe', label: 'Website', Icon: Globe },
  { id: 'qr-code', label: 'QR Scan', Icon: QrCode },
  { id: 'arrow-right', label: 'Arrow', Icon: ArrowRight },
  { id: 'chevron-right', label: 'Chevron', Icon: ChevronRight },
  { id: 'check-circle', label: 'Verified', Icon: CheckCircle2 },
  { id: 'play-circle', label: 'Play', Icon: PlayCircle },
  { id: 'heart', label: 'Heart', Icon: Heart },
  { id: 'thumbs-up', label: 'Like', Icon: ThumbsUp },
  { id: 'users', label: 'Team', Icon: Users },
  { id: 'trending-up', label: 'Trending', Icon: TrendingUp },
  { id: 'volume-2', label: 'Audio', Icon: Volume2 },
  { id: 'bell', label: 'Alert', Icon: Bell },
  { id: 'camera', label: 'Photo', Icon: Camera },
  { id: 'compass', label: 'Explore', Icon: Compass },
];

const ICON_MAP = new Map<string, LucideIcon>(
  BROADCAST_ICON_OPTIONS.map((item) => [item.id, item.Icon])
);

export const GraphicsIconRenderer: React.FC<{
  iconName?: string;
  color?: string;
  strokeWidth?: number;
}> = React.memo(({ iconName = 'trophy', color = '#ffffff', strokeWidth = 2 }) => {
  const Icon = ICON_MAP.get(iconName) || Trophy;
  return (
    <Icon
      className="w-full h-full"
      style={{ color }}
      strokeWidth={strokeWidth}
    />
  );
});

GraphicsIconRenderer.displayName = 'GraphicsIconRenderer';
