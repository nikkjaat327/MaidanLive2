export type GraphicsElementType = 'image' | 'text' | 'logo' | 'qr' | 'shape';

export type GraphicsAnimationStyle =
  | 'none'
  | 'fade-in'
  | 'fade-out'
  | 'slide-left'
  | 'slide-right'
  | 'slide-top'
  | 'slide-bottom'
  | 'zoom-in'
  | 'zoom-out'
  | 'pop-in'
  | 'bounce'
  | 'pulse'
  | 'marquee';

export type GraphicsAnimationDirection = 'normal' | 'reverse' | 'alternate';

export type GraphicsAnimationSpeed = 'slow' | 'normal' | 'fast';

export interface GraphicsElementAnimation {
  style: GraphicsAnimationStyle;
  exitStyle?: GraphicsAnimationStyle;
  durationMs: number;
  delayMs: number;
  speed: GraphicsAnimationSpeed;
  direction: GraphicsAnimationDirection;
  loop: boolean;
  startTrigger?: 'on_enter' | 'continuous';
  endBehavior?: 'hold' | 'hide' | 'loop';
}

export type GraphicsShapeKind = 'rectangle' | 'rounded_rect' | 'circle' | 'line' | 'divider';

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

export interface GraphicsGradientConfig {
  enabled: boolean;
  from: string;
  to: string;
  angle: number;
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
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;

  // Common box styling
  backgroundColor?: string;
  gradient?: GraphicsGradientConfig;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
  paddingX?: number;
  paddingY?: number;

  // Image & Logo properties
  assetId?: string;
  src?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  crop?: GraphicsCropBox;
  logoPreset?: GraphicsLogoPreset;

  // Text properties
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontColor?: string;
  gradientText?: GraphicsGradientConfig;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;
  wordWrap?: boolean;
  textOutlineWidth?: number;
  textOutlineColor?: string;
  textShadow?: string;
  italic?: boolean;
  underline?: boolean;

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

  // Animation
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
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  defaultDurationSeconds: number; // 0 = permanent until hidden/removed
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
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  durationSeconds: number; // 0 = permanent
  startedAt: string;
  expiresAt?: string | null;
  pausedRemainingMs?: number | null;
  visible: boolean;
  triggerSource: 'live_edit' | 'saved_ad' | 'queue' | 'event';
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

export interface BroadcastGraphicsStateData {
  matchId: string;
  tournamentId?: string | null;
  broadcastSessionId: string;
  overlapPolicy: GraphicsOverlapPolicy;
  animationsPaused: boolean;
  activeSlots: ActiveBroadcastGraphicSlot[];
  queue: BroadcastAdQueueItem[];
  queueStatus: GraphicsQueueStatus;
  currentQueueIndex: number;
  queueAutoAdvance: boolean;
  eventRules: BroadcastGraphicEventRule[];
  updatedAt?: string;
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
