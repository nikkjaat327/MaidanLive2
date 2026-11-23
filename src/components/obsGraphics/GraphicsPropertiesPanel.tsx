import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ImagePlus,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  GraphicsAnimationStyle,
  GraphicsElement,
  GraphicsLogoPreset,
  GraphicsQrLinkType,
  GraphicsShapeKind,
} from '../../types/broadcastGraphics.ts';
import {
  GRAPHICS_ANIMATION_OPTIONS,
  GRAPHICS_FONT_FAMILIES,
} from '../../utils/broadcastGraphicsTemplates.ts';

interface GraphicsPropertiesPanelProps {
  elements: GraphicsElement[];
  selectedIds: string[];
  canvasWidth: number;
  canvasHeight: number;
  onUpdateElement: (id: string, patch: Partial<GraphicsElement>, commit?: boolean) => void;
  onUpdateElementsBatch: (next: GraphicsElement[], label?: string) => void;
  onOpenAssetPickerForElement: (id: string) => void;
  onDeleteSelected: () => void;
}

export const GraphicsPropertiesPanel: React.FC<GraphicsPropertiesPanelProps> = ({
  elements,
  selectedIds,
  canvasWidth,
  canvasHeight,
  onUpdateElement,
  onUpdateElementsBatch,
  onOpenAssetPickerForElement,
  onDeleteSelected,
}) => {
  const selected = elements.find((e) => e.id === selectedIds[0]) || null;

  const alignSelected = (
    mode: 'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom' | 'distH' | 'distV'
  ) => {
    const targets = elements.filter((el) => selectedIds.includes(el.id) && !el.locked);
    if (targets.length === 0) return;

    if (mode === 'distH' && targets.length >= 3) {
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const minX = sorted[0].x;
      const maxX = sorted[sorted.length - 1].x;
      const step = (maxX - minX) / (sorted.length - 1);
      const map = new Map(sorted.map((item, idx) => [item.id, Math.round(minX + idx * step)]));
      onUpdateElementsBatch(
        elements.map((el) => (map.has(el.id) ? { ...el, x: map.get(el.id)! } : el)),
        'Distribute horizontally'
      );
      return;
    }

    if (mode === 'distV' && targets.length >= 3) {
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const minY = sorted[0].y;
      const maxY = sorted[sorted.length - 1].y;
      const step = (maxY - minY) / (sorted.length - 1);
      const map = new Map(sorted.map((item, idx) => [item.id, Math.round(minY + idx * step)]));
      onUpdateElementsBatch(
        elements.map((el) => (map.has(el.id) ? { ...el, y: map.get(el.id)! } : el)),
        'Distribute vertically'
      );
      return;
    }

    onUpdateElementsBatch(
      elements.map((el) => {
        if (!selectedIds.includes(el.id) || el.locked) return el;
        switch (mode) {
          case 'left':
            return { ...el, x: 48 };
          case 'centerH':
            return { ...el, x: Math.round((canvasWidth - el.width) / 2) };
          case 'right':
            return { ...el, x: canvasWidth - el.width - 48 };
          case 'top':
            return { ...el, y: 40 };
          case 'middleV':
            return { ...el, y: Math.round((canvasHeight - el.height) / 2) };
          case 'bottom':
            return { ...el, y: canvasHeight - el.height - 40 };
          default:
            return el;
        }
      }),
      `Align ${mode}`
    );
  };

  if (!selected) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center space-y-2">
        <Layers className="w-7 h-7 text-slate-400 mx-auto" />
        <p className="text-xs font-bold text-slate-900">No Element Selected</p>
        <p className="text-[11px] text-slate-500">
          Click any graphic on the canvas or in the Layers list to edit coordinates, typography, crop, QR link, or animation.
        </p>
      </div>
    );
  }

  const update = (patch: Partial<GraphicsElement>) => onUpdateElement(selected.id, patch, true);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-4 max-h-[720px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 truncate">{selected.layerName}</p>
          <p className="text-[10px] font-mono uppercase text-slate-500">
            {selected.type} · z:{selected.zIndex}
            {selectedIds.length > 1 ? ` · (${selectedIds.length} selected)` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onDeleteSelected}
          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200"
          title="Delete selected element"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Align & Distribute */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Canvas Alignment
        </p>
        <div className="grid grid-cols-6 gap-1">
          <button
            type="button"
            onClick={() => alignSelected('left')}
            title="Align Left Safe Edge"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignStartVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alignSelected('centerH')}
            title="Center Horizontally"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignCenterVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alignSelected('right')}
            title="Align Right Safe Edge"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignEndVertical className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alignSelected('top')}
            title="Align Top Safe Edge"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignStartHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alignSelected('middleV')}
            title="Center Vertically"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignCenterHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => alignSelected('bottom')}
            title="Align Bottom Safe Edge"
            className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 flex justify-center"
          >
            <AlignEndHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
        {selectedIds.length >= 3 && (
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => alignSelected('distH')}
              className="py-1 rounded border border-slate-200 text-[10px] font-semibold hover:bg-slate-50"
            >
              Distribute Horizontally
            </button>
            <button
              type="button"
              onClick={() => alignSelected('distV')}
              className="py-1 rounded border border-slate-200 text-[10px] font-semibold hover:bg-slate-50"
            >
              Distribute Vertically
            </button>
          </div>
        )}
      </div>

      {/* Exact Coordinates & Transform */}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Position, Size &amp; Transform
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">X (px)</span>
            <input
              type="number"
              value={selected.x}
              onChange={(e) => update({ x: Math.round(Number(e.target.value) || 0) })}
              className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Y (px)</span>
            <input
              type="number"
              value={selected.y}
              onChange={(e) => update({ y: Math.round(Number(e.target.value) || 0) })}
              className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Width</span>
            <input
              type="number"
              min={8}
              max={3840}
              value={selected.width}
              onChange={(e) => update({ width: Math.max(8, Math.round(Number(e.target.value) || 8)) })}
              className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Height</span>
            <input
              type="number"
              min={2}
              max={3840}
              value={selected.height}
              onChange={(e) =>
                update({ height: Math.max(2, Math.round(Number(e.target.value) || 2)) })
              }
              className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Rotation (°)</span>
            <input
              type="number"
              min={-360}
              max={360}
              value={selected.rotation || 0}
              onChange={(e) => update({ rotation: Math.round(Number(e.target.value) || 0) })}
              className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">
              Opacity ({Math.round((selected.opacity ?? 1) * 100)}%)
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.opacity ?? 1}
              onChange={(e) => update({ opacity: Number(e.target.value) })}
              className="w-full accent-[#EA580C] mt-1.5"
            />
          </label>
        </div>
      </div>

      {/* TEXT PROPERTIES */}
      {selected.type === 'text' && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Typography &amp; Copy
          </p>
          <textarea
            rows={2}
            value={selected.text || ''}
            onChange={(e) => update({ text: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            placeholder="Enter sponsor text or promotional message..."
          />

          <select
            value={selected.fontFamily || GRAPHICS_FONT_FAMILIES[0].id}
            onChange={(e) => update({ fontFamily: e.target.value })}
            className="w-full min-h-[32px] px-2 text-xs border border-slate-300 rounded bg-white"
          >
            {GRAPHICS_FONT_FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Size</span>
              <input
                type="number"
                min={10}
                max={240}
                value={selected.fontSize || 28}
                onChange={(e) => update({ fontSize: Math.max(10, Number(e.target.value) || 28) })}
                className="w-full min-h-[30px] px-2 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Weight</span>
              <select
                value={selected.fontWeight || '700'}
                onChange={(e) => update({ fontWeight: e.target.value })}
                className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="400">Regular</option>
                <option value="600">SemiBold</option>
                <option value="700">Bold</option>
                <option value="800">ExtraBold</option>
                <option value="900">Black</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Align</span>
              <select
                value={selected.textAlign || 'center'}
                onChange={(e) =>
                  update({ textAlign: e.target.value as 'left' | 'center' | 'right' })
                }
                className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px]">
              <span>Text Color</span>
              <input
                type="color"
                value={selected.fontColor?.startsWith('#') ? selected.fontColor.slice(0, 7) : '#ffffff'}
                onChange={(e) => update({ fontColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-slate-300"
              />
            </label>
            <button
              type="button"
              onClick={() => update({ italic: !selected.italic })}
              className={`px-2.5 py-1 rounded border text-[11px] font-serif italic ${
                selected.italic ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'border-slate-300'
              }`}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => update({ underline: !selected.underline })}
              className={`px-2.5 py-1 rounded border text-[11px] underline ${
                selected.underline ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'border-slate-300'
              }`}
            >
              U
            </button>
            <label className="inline-flex items-center gap-1 text-[11px]">
              <input
                type="checkbox"
                checked={selected.wordWrap !== false}
                onChange={(e) => update({ wordWrap: e.target.checked })}
                className="rounded border-slate-300 text-[#EA580C]"
              />
              <span>Wrap</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Spacing</span>
              <input
                type="number"
                step={0.5}
                value={selected.letterSpacing || 0}
                onChange={(e) => update({ letterSpacing: Number(e.target.value) || 0 })}
                className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Line H</span>
              <input
                type="number"
                step={0.1}
                min={0.8}
                max={3}
                value={selected.lineHeight || 1.2}
                onChange={(e) => update({ lineHeight: Number(e.target.value) || 1.2 })}
                className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Outline</span>
              <input
                type="number"
                min={0}
                max={12}
                value={selected.textOutlineWidth || 0}
                onChange={(e) => update({ textOutlineWidth: Number(e.target.value) || 0 })}
                className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-[11px]">
            <input
              type="checkbox"
              checked={Boolean(selected.gradientText?.enabled)}
              onChange={(e) =>
                update({
                  gradientText: {
                    enabled: e.target.checked,
                    from: selected.gradientText?.from || '#ffffff',
                    to: selected.gradientText?.to || '#fb923c',
                    angle: selected.gradientText?.angle ?? 90,
                  },
                })
              }
              className="rounded border-slate-300 text-[#EA580C]"
            />
            <span className="font-semibold">Gradient Text Fill</span>
          </label>
          {selected.gradientText?.enabled && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selected.gradientText.from}
                onChange={(e) =>
                  update({
                    gradientText: { ...selected.gradientText!, from: e.target.value },
                  })
                }
                className="w-7 h-7 rounded border border-slate-300"
              />
              <input
                type="color"
                value={selected.gradientText.to}
                onChange={(e) =>
                  update({
                    gradientText: { ...selected.gradientText!, to: e.target.value },
                  })
                }
                className="w-7 h-7 rounded border border-slate-300"
              />
              <input
                type="number"
                min={0}
                max={360}
                value={selected.gradientText.angle}
                onChange={(e) =>
                  update({
                    gradientText: {
                      ...selected.gradientText!,
                      angle: Number(e.target.value) || 90,
                    },
                  })
                }
                className="w-16 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                placeholder="deg"
              />
            </div>
          )}
        </div>
      )}

      {/* IMAGE & SPONSOR LOGO PROPERTIES */}
      {(selected.type === 'image' || selected.type === 'logo') && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {selected.type === 'logo' ? 'Sponsor Logo' : 'Image & Crop'}
            </p>
            <button
              type="button"
              onClick={() => onOpenAssetPickerForElement(selected.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold"
            >
              <ImagePlus className="w-3 h-3" />
              <span>{selected.src ? 'Replace Image' : 'Pick / Upload'}</span>
            </button>
          </div>

          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Fit Mode</span>
            <select
              value={selected.objectFit || 'contain'}
              onChange={(e) =>
                update({ objectFit: e.target.value as 'contain' | 'cover' | 'fill' })
              }
              className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
            >
              <option value="contain">Contain (Keep Full Image)</option>
              <option value="cover">Cover (Fill Box)</option>
              <option value="fill">Stretch Fit</option>
            </select>
          </label>

          {selected.type === 'logo' && (
            <label className="block space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Corner Snap Preset</span>
              <select
                value={selected.logoPreset || 'custom'}
                onChange={(e) => {
                  const preset = e.target.value as GraphicsLogoPreset;
                  const patch: Partial<GraphicsElement> = { logoPreset: preset };
                  if (preset === 'top-left') Object.assign(patch, { x: 48, y: 44 });
                  if (preset === 'top-right')
                    Object.assign(patch, { x: canvasWidth - selected.width - 48, y: 44 });
                  if (preset === 'bottom-left')
                    Object.assign(patch, { x: 48, y: canvasHeight - selected.height - 44 });
                  if (preset === 'bottom-right')
                    Object.assign(patch, {
                      x: canvasWidth - selected.width - 48,
                      y: canvasHeight - selected.height - 44,
                    });
                  update(patch);
                }}
                className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="custom">Custom Position</option>
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="floating">Floating Corner</option>
              </select>
            </label>
          )}

          <div>
            <span className="text-[10px] font-semibold text-slate-500 block mb-1">
              Crop Edges (%)
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                <label key={side} className="space-y-0.5">
                  <span className="text-[9px] uppercase text-slate-400">{side}</span>
                  <input
                    type="number"
                    min={0}
                    max={45}
                    value={selected.crop?.[side] ?? 0}
                    onChange={(e) =>
                      update({
                        crop: {
                          top: selected.crop?.top ?? 0,
                          right: selected.crop?.right ?? 0,
                          bottom: selected.crop?.bottom ?? 0,
                          left: selected.crop?.left ?? 0,
                          [side]: Math.min(45, Math.max(0, Number(e.target.value) || 0)),
                        },
                      })
                    }
                    className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* QR CODE PROPERTIES */}
      {selected.type === 'qr' && (
        <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            QR Code Target &amp; Branding
          </p>
          <select
            value={selected.qrLinkType || 'sponsor'}
            onChange={(e) => update({ qrLinkType: e.target.value as GraphicsQrLinkType })}
            className="w-full min-h-[32px] px-2 border border-slate-300 rounded bg-white"
          >
            <option value="sponsor">Sponsor Website URL</option>
            <option value="match">Current Live Match Link</option>
            <option value="tournament">Tournament Page Link</option>
            <option value="team">Team Profile Link</option>
            <option value="registration">Tournament Registration Link</option>
            <option value="custom">Custom URL</option>
          </select>

          {(selected.qrLinkType === 'sponsor' || selected.qrLinkType === 'custom' || !selected.qrLinkType) && (
            <input
              type="url"
              value={selected.qrUrl || ''}
              onChange={(e) => update({ qrUrl: e.target.value })}
              placeholder="https://sponsor-website.com"
              className="w-full min-h-[32px] px-2.5 text-xs font-mono border border-slate-300 rounded"
            />
          )}

          {(selected.qrLinkType === 'team' ||
            selected.qrLinkType === 'tournament' ||
            selected.qrLinkType === 'match') && (
            <input
              type="text"
              value={selected.qrTargetId || ''}
              onChange={(e) => update({ qrTargetId: e.target.value })}
              placeholder="Optional target ID (defaults to current match/tournament)"
              className="w-full min-h-[30px] px-2.5 text-xs font-mono border border-slate-300 rounded"
            />
          )}

          <input
            type="text"
            value={selected.qrCaption || ''}
            onChange={(e) => update({ qrCaption: e.target.value })}
            placeholder="QR Caption (e.g. SCAN NOW)"
            className="w-full min-h-[30px] px-2.5 text-xs border border-slate-300 rounded"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1 text-[11px]">
              <span>FG</span>
              <input
                type="color"
                value={selected.qrFgColor || '#0f172a'}
                onChange={(e) => update({ qrFgColor: e.target.value })}
                className="w-6 h-6 rounded border border-slate-300"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px]">
              <span>BG</span>
              <input
                type="color"
                value={selected.qrBgColor || '#ffffff'}
                onChange={(e) => update({ qrBgColor: e.target.value })}
                className="w-6 h-6 rounded border border-slate-300"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[11px]">
              <span>Caption</span>
              <input
                type="color"
                value={selected.qrCaptionColor || '#ffffff'}
                onChange={(e) => update({ qrCaptionColor: e.target.value })}
                className="w-6 h-6 rounded border border-slate-300"
              />
            </label>
          </div>
        </div>
      )}

      {/* SHAPE KIND */}
      {selected.type === 'shape' && (
        <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Shape Geometry
          </p>
          <select
            value={selected.shapeKind || 'rounded_rect'}
            onChange={(e) => {
              const kind = e.target.value as GraphicsShapeKind;
              update({
                shapeKind: kind,
                borderRadius: kind === 'circle' ? 9999 : kind === 'rectangle' ? 0 : 16,
              });
            }}
            className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
          >
            <option value="rectangle">Rectangle</option>
            <option value="rounded_rect">Rounded Card</option>
            <option value="circle">Circle / Badge</option>
            <option value="line">Accent Line</option>
            <option value="divider">Divider Bar</option>
          </select>
        </div>
      )}

      {/* CONTAINER STYLING (BG, Gradient, Border, Shadow) */}
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Container Background, Border &amp; Shadow
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Fill</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={
                  selected.backgroundColor && selected.backgroundColor.startsWith('#')
                    ? selected.backgroundColor.slice(0, 7)
                    : '#0f172a'
                }
                onChange={(e) => update({ backgroundColor: e.target.value })}
                className="w-7 h-7 rounded border border-slate-300"
              />
              <button
                type="button"
                onClick={() => update({ backgroundColor: 'transparent' })}
                className="px-1.5 py-0.5 text-[10px] border border-slate-200 rounded hover:bg-slate-50"
              >
                None
              </button>
            </div>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Border W</span>
            <input
              type="number"
              min={0}
              max={32}
              value={selected.borderWidth || 0}
              onChange={(e) => update({ borderWidth: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Radius</span>
            <input
              type="number"
              min={0}
              max={9999}
              value={selected.borderRadius || 0}
              onChange={(e) => update({ borderRadius: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1 text-[11px]">
            <span>Border Color</span>
            <input
              type="color"
              value={
                selected.borderColor?.startsWith('#')
                  ? selected.borderColor.slice(0, 7)
                  : '#ea580c'
              }
              onChange={(e) => update({ borderColor: e.target.value })}
              className="w-6 h-6 rounded border border-slate-300"
            />
          </label>
          <label className="inline-flex items-center gap-1 text-[11px]">
            <input
              type="checkbox"
              checked={Boolean(selected.shadowEnabled)}
              onChange={(e) => update({ shadowEnabled: e.target.checked })}
              className="rounded border-slate-300 text-[#EA580C]"
            />
            <span>Shadow</span>
          </label>
          <label className="inline-flex items-center gap-1 text-[11px]">
            <input
              type="checkbox"
              checked={Boolean(selected.gradient?.enabled)}
              onChange={(e) =>
                update({
                  gradient: {
                    enabled: e.target.checked,
                    from: selected.gradient?.from || '#0f172a',
                    to: selected.gradient?.to || '#1e293b',
                    angle: selected.gradient?.angle ?? 135,
                  },
                })
              }
              className="rounded border-slate-300 text-[#EA580C]"
            />
            <span>Gradient Fill</span>
          </label>
        </div>

        {selected.gradient?.enabled && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={selected.gradient.from.slice(0, 7)}
              onChange={(e) =>
                update({ gradient: { ...selected.gradient!, from: e.target.value } })
              }
              className="w-7 h-7 rounded border border-slate-300"
            />
            <input
              type="color"
              value={selected.gradient.to.slice(0, 7)}
              onChange={(e) =>
                update({ gradient: { ...selected.gradient!, to: e.target.value } })
              }
              className="w-7 h-7 rounded border border-slate-300"
            />
            <input
              type="number"
              min={0}
              max={360}
              value={selected.gradient.angle}
              onChange={(e) =>
                update({
                  gradient: { ...selected.gradient!, angle: Number(e.target.value) || 135 },
                })
              }
              className="w-16 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
              placeholder="deg"
            />
          </div>
        )}
      </div>

      {/* ELEMENT ANIMATION SETTINGS */}
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#EA580C]" />
          <span>Element Motion &amp; Animation</span>
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Entry Animation</span>
            <select
              value={selected.animation?.style || 'fade-in'}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    style: e.target.value as GraphicsAnimationStyle,
                  },
                })
              }
              className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
            >
              {GRAPHICS_ANIMATION_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Exit Animation</span>
            <select
              value={selected.animation?.exitStyle || 'fade-out'}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    exitStyle: e.target.value as GraphicsAnimationStyle,
                  },
                })
              }
              className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
            >
              {GRAPHICS_ANIMATION_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Duration (ms)</span>
            <input
              type="number"
              min={100}
              max={15000}
              step={50}
              value={selected.animation?.durationMs ?? 420}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    durationMs: Math.max(100, Number(e.target.value) || 420),
                  },
                })
              }
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Delay (ms)</span>
            <input
              type="number"
              min={0}
              max={10000}
              step={50}
              value={selected.animation?.delayMs ?? 0}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    delayMs: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selected.animation?.speed || 'normal'}
            onChange={(e) =>
              update({
                animation: {
                  ...selected.animation,
                  speed: e.target.value as 'slow' | 'normal' | 'fast',
                },
              })
            }
            className="min-h-[28px] px-1.5 border border-slate-300 rounded bg-white"
          >
            <option value="slow">Speed: Slow</option>
            <option value="normal">Speed: Normal</option>
            <option value="fast">Speed: Fast</option>
          </select>
          <select
            value={selected.animation?.direction || 'normal'}
            onChange={(e) =>
              update({
                animation: {
                  ...selected.animation,
                  direction: e.target.value as 'normal' | 'reverse' | 'alternate',
                },
              })
            }
            className="min-h-[28px] px-1.5 border border-slate-300 rounded bg-white"
          >
            <option value="normal">Dir: Normal</option>
            <option value="reverse">Dir: Reverse</option>
            <option value="alternate">Dir: Alternate</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(selected.animation?.loop)}
            onChange={(e) =>
              update({
                animation: {
                  ...selected.animation,
                  loop: e.target.checked,
                  endBehavior: e.target.checked ? 'loop' : 'hold',
                },
              })
            }
            className="rounded border-slate-300 text-[#EA580C]"
          />
          <span>Continuous Loop (Pulse / Bounce / Ticker)</span>
        </label>
      </div>
    </div>
  );
};
