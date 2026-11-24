export type GraphicsElementType = 'image' | 'text' | 'logo' | 'qr' | 'shape' | 'icon';

export type GraphicsAnimationStyle =
  | 'none'
  | 'fade-in'
  | 'fade-out'
  | 'slide-left'
  | 'slide-right'
  | 'slide-top'
  | 'slide-bottom'
  | 'slide-out-left'
  | 'slide-out-right'
  | 'slide-out-top'
  | 'slide-out-bottom'
  | 'zoom-in'
  | 'zoom-out'
  | 'pop-in'
  | 'pop-out'
  | 'bounce'
  | 'bounce-in'
  | 'rotate-in'
  | 'rotate-out'
  | 'flip-in'
  | 'blur-in'
  | 'blur-out'
  | 'pulse'
  | 'float'
  | 'glow'
  | 'blink'
  | 'shake'
  | 'rotate-loop'
  | 'marquee';

export type GraphicsAnimationDirection = 'normal' | 'reverse' | 'alternate';

export type GraphicsAnimationSpeed = 'slow' | 'normal' | 'fast';

export type GraphicsAnimationIntensity = 'subtle' | 'medium' | 'strong';

export type GraphicsAnimationEasing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'cubic-bezier(0.22, 1, 0.36, 1)'
  | 'cubic-bezier(0.34, 1.56, 0.64, 1)'
  | 'cubic-bezier(0.16, 1, 0.3, 1)';

export interface GraphicsElementAnimation {
  style: GraphicsAnimationStyle;
  exitStyle?: GraphicsAnimationStyle;
  continuousStyle?: GraphicsAnimationStyle;
  durationMs: number;
  exitDurationMs?: number;
  delayMs: number;
  speed: GraphicsAnimationSpeed;
  direction: GraphicsAnimationDirection;
  easing?: string;
  repeatCount?: number; // 0 = infinite when loop is true, else 1..20
  intensity?: GraphicsAnimationIntensity;
  loop: boolean;
  startTrigger?: 'on_enter' | 'continuous';
  endBehavior?: 'hold' | 'hide' | 'loop';
  // Optional timeline sequencing inside the ad (relative to ad start in ms)
  startTimeMs?: number;
  endTimeMs?: number | null;
}

export type GraphicsShapeKind =
  | 'rectangle'
  | 'rounded_rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'divider'
  | 'container';

export type GraphicsBorderStyle = 'solid' | 'dashed' | 'dotted';

export type GraphicsImageMask =
  | 'none'
  | 'circle'
  | 'rounded'
  | 'pill'
  | 'diamond'
  | 'hexagon'
  | 'diagonal';

export type GraphicsAnchorPoint =
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type GraphicsQrLinkType =
  | 'sponsor'
  | 'tournament'
  | 'match'
  | 'team'
  | 'registration'
  | 'custom';

export type GraphicsLogoPreset =
  | 'custom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'floating';

export type GraphicsLayoutPresetId =
  | 'top_banner'
  | 'bottom_banner'
  | 'sponsor_lower_third'
  | 'top_left_sponsor'
  | 'top_right_sponsor'
  | 'bottom_left_sponsor'
  | 'bottom_right_sponsor'
  | 'center_promo_banner'
  | 'floating_ad'
  | 'corner_logo'
  | 'side_ad'
  | 'full_width_banner'
  | 'custom_position'
  | 'custom_size';

export type GraphicsDesignType =
  | 'banner'
  | 'lower_third'
  | 'logo'
  | 'qr'
  | 'side_ad'
  | 'full_banner'
  | 'event_promo'
  | 'custom';

export type GraphicsScope = 'global' | 'tournament' | 'match';

export type GraphicsAssetType = 'logo' | 'banner' | 'promo' | 'background';

export type BroadcastGraphicEventTrigger =
  | 'MATCH_STARTING'
  | 'FIRST_HALF'
  | 'SECOND_HALF'
  | 'TIMEOUT'
  | 'HALF_TIME'
  | 'MATCH_BREAK'
  | 'FOUR'
  | 'SIX'
  | 'WICKET'
  | 'ALL_OUT'
  | 'SUPER_TACKLE'
  | 'MATCH_COMPLETED';

export interface GraphicsCropBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GraphicsGradientStop {
  color: string;
  position: number; // 0..100
}

export interface GraphicsGradientConfig {
  enabled: boolean;
  from: string;
  to: string;
  angle: number;
  stops?: GraphicsGradientStop[];
}

export interface GraphicsDesignGroupMeta {
  groupId: string;
  name: string;
  opacity?: number;
  locked?: boolean;
  visible?: boolean;
  animation?: Partial<GraphicsElementAnimation>;
}

export interface GraphicsElement {
  id: string;
  type: GraphicsElementType;
  layerName: string;
  groupId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX?: number;
  scaleY?: number;
  anchorPoint?: GraphicsAnchorPoint;
  lockAspectRatio?: boolean;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;

  // Common box styling
  backgroundColor?: string;
  backgroundOpacity?: number;
  gradient?: GraphicsGradientConfig;
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: GraphicsBorderStyle;
  borderRadius?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  // Image & Logo properties
  assetId?: string;
  src?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  crop?: GraphicsCropBox;
  logoPreset?: GraphicsLogoPreset;
  flipX?: boolean;
  flipY?: boolean;
  imageMask?: GraphicsImageMask;
  imageAlign?: 'center' | 'top' | 'bottom' | 'left' | 'right';

  // Text properties
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontColor?: string;
  gradientText?: GraphicsGradientConfig;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  letterSpacing?: number;
  lineHeight?: number;
  wordWrap?: boolean;
  textOutlineWidth?: number;
  textOutlineColor?: string;
  textShadow?: string;
  textShadowColor?: string;
  textShadowBlur?: number;
  textShadowX?: number;
  textShadowY?: number;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDirection?: 'ltr' | 'rtl';

  // QR Code properties
  qrLinkType?: GraphicsQrLinkType;
  qrUrl?: string;
  qrTargetId?: string;
  qrFgColor?: string;
  qrBgColor?: string;
  qrCenterLogoUrl?: string;
  qrCenterLogoSizePct?: number;
  qrCaption?: string;
  qrCaptionColor?: string;

  // Shape properties
  shapeKind?: GraphicsShapeKind;
  strokeWidth?: number;

  // Vector Icon properties
  iconName?: string;
  iconColor?: string;
  iconStrokeWidth?: number;

  // Animation & Timeline
  animation: GraphicsElementAnimation;
}

export interface BroadcastAdDesignData {
  id: string;
  name: string;
  designType: GraphicsDesignType;
  isTemplate: boolean;
  scope: GraphicsScope;
  ownerUserId: string;
  tournamentId?: string | null;
  matchId?: string | null;
  canvasWidth: number;
  canvasHeight: number;
  layoutPreset: GraphicsLayoutPresetId;
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  defaultDurationSeconds: number; // 0 = permanent until hidden/removed
  timelineEnabled?: boolean;
  totalDurationSeconds?: number;
  thumbnailDataUrl: string;
  usageCount: number;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BroadcastGraphicsAssetData {
  id: string;
  ownerUserId: string;
  scope: GraphicsScope;
  tournamentId?: string | null;
  matchId?: string | null;
  name: string;
  assetType: GraphicsAssetType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  url: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActiveBroadcastGraphicSlot {
  instanceId: string;
  designId?: string | null;
  scheduleId?: string | null;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  durationSeconds: number; // 0 = permanent
  startedAt: string;
  expiresAt?: string | null;
  pausedRemainingMs?: number | null;
  visible: boolean;
  triggerSource: 'live_edit' | 'saved_ad' | 'queue' | 'schedule' | 'event';
  triggerEventType?: BroadcastGraphicEventTrigger | '';
  shownByName?: string;
}

export interface BroadcastAdQueueItem {
  queueItemId: string;
  designId: string;
  name: string;
  designType: GraphicsDesignType;
  thumbnailDataUrl: string;
  durationSeconds: number;
  delayAfterSeconds: number;
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
}

export interface BroadcastGraphicEventRule {
  trigger: BroadcastGraphicEventTrigger;
  enabled: boolean;
  designId: string;
  designName: string;
  durationSeconds: number;
  cooldownSeconds: number;
  lastTriggeredAt?: string | null;
}

export type GraphicsOverlapPolicy = 'replace' | 'stack';
export type GraphicsQueueStatus = 'idle' | 'playing' | 'paused';
export type GraphicsQueuePhase = 'idle' | 'showing' | 'gap' | 'paused';

export interface BroadcastGraphicsStateData {
  matchId: string;
  tournamentId?: string | null;
  broadcastSessionId: string;
  overlapPolicy: GraphicsOverlapPolicy;
  animationsPaused: boolean;
  activeSlots: ActiveBroadcastGraphicSlot[];
  queue: BroadcastAdQueueItem[];
  queueStatus: GraphicsQueueStatus;
  queuePhase?: GraphicsQueuePhase;
  currentQueueIndex: number;
  queueAutoAdvance: boolean;
  queueItemStartedAt?: string | null;
  queueNextActionAt?: string | null;
  queuePausedRemainingMs?: number | null;
  eventRules: BroadcastGraphicEventRule[];
  serverNowIso?: string;
  updatedAt?: string;
}

export type AdScheduleStatus =
  | 'scheduled'
  | 'preparing'
  | 'playing'
  | 'completed'
  | 'missed'
  | 'cancelled'
  | 'failed'
  | 'paused';

export type AdScheduleRepeatRule = 'none' | 'every_x_minutes' | 'daily_times' | 'weekdays';
export type AdScheduleConflictPolicy = 'prevent' | 'stack' | 'replace_lower_priority';
export type AdScheduleBridgePolicy = 'allow_overlay_only' | 'require_bridge';
export type AdScheduleEventRestriction = 'any' | 'live_only' | 'break_only';
export type AdScheduleSessionPolicy = 'cancel_on_end' | 'miss_on_end';

export interface AdScheduleExecutionLogItem {
  executedAt: string;
  status: 'completed' | 'missed' | 'failed' | 'skipped' | 'manual_play';
  note?: string;
}

export interface BroadcastAdScheduleData {
  id: string;
  matchId: string;
  tournamentId?: string | null;
  broadcastSessionId: string;
  designId: string;
  adName: string;
  adDesignType: GraphicsDesignType;
  adThumbnailDataUrl: string;
  matchTitle?: string;
  scheduledDate: string; // YYYY-MM-DD in selected timezone
  scheduledStartTime: string; // HH:mm or HH:mm:ss in selected timezone
  timezone: string; // IANA timezone e.g. Asia/Kolkata
  scheduledStartAt: string; // UTC ISO
  nextRunAt: string; // UTC ISO
  durationSeconds: number;
  gracePeriodSeconds: number;
  priority: number;
  conflictPolicy: AdScheduleConflictPolicy;
  bridgePolicy: AdScheduleBridgePolicy;
  eventRestriction: AdScheduleEventRestriction;
  sessionPolicy: AdScheduleSessionPolicy;
  repeatRule: AdScheduleRepeatRule;
  repeatIntervalMinutes: number;
  repeatDailyTimes: string[];
  repeatWeekdays: number[]; // 0=Sun .. 6=Sat
  repeatStartDate?: string;
  repeatEndDate?: string;
  repeatEndTime?: string;
  maxOccurrences?: number;
  occurrenceCount: number;
  status: AdScheduleStatus;
  statusReason?: string;
  activeSlotInstanceId?: string | null;
  lastExecutedAt?: string | null;
  lastCompletedAt?: string | null;
  executionHistory?: AdScheduleExecutionLogItem[];
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdScheduleConflictItem {
  scheduleId: string;
  adName: string;
  nextRunAt: string;
  durationSeconds: number;
  priority: number;
  status: AdScheduleStatus;
}

export interface BroadcastGraphicTemplate {
  templateId: string;
  name: string;
  description: string;
  designType: GraphicsDesignType;
  layoutPreset: GraphicsLayoutPresetId;
  defaultDurationSeconds: number;
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
}
