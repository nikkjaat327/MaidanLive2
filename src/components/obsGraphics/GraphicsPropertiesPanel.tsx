import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  Layers,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
} from 'lucide-react';
import type {
  GraphicsAnchorPoint,
  GraphicsAnimationDirection,
  GraphicsAnimationIntensity,
  GraphicsAnimationSpeed,
  GraphicsAnimationStyle,
  GraphicsBorderStyle,
  GraphicsElement,
  GraphicsGradientConfig,
  GraphicsImageMask,
  GraphicsLogoPreset,
  GraphicsQrLinkType,
  GraphicsShapeKind,
} from '../../types/broadcastGraphics.ts';
import {
  GRAPHICS_CONTINUOUS_ANIMATIONS,
  GRAPHICS_EASING_OPTIONS,
  GRAPHICS_ENTRY_ANIMATIONS,
  GRAPHICS_EXIT_ANIMATIONS,
  GRAPHICS_FONT_FAMILIES,
} from '../../utils/broadcastGraphicsTemplates.ts';
import { BROADCAST_ICON_OPTIONS } from './GraphicsIconRenderer.tsx';
import { hexFromColor, rgbFromColor } from './graphicsStyleUtils.ts';

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

const ColorHexRgbField: React.FC<{
  label: string;
  value: string;
  onChange: (nextHex: string) => void;
  allowTransparent?: boolean;
}> = ({ label, value, onChange, allowTransparent = false }) => {
  const safeHex = hexFromColor(value, '#ffffff');
  const rgb = rgbFromColor(safeHex);
  const isTransparent = value === 'transparent';

  const setRgbChannel = (ch: 'r' | 'g' | 'b', num: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(num) || 0));
    const next = { ...rgb, [ch]: clamped };
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    onChange(`#${toHex(next.r)}${toHex(next.g)}${toHex(next.b)}`);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold text-slate-600">{label}</span>
        {allowTransparent && (
          <button
            type="button"
            onClick={() => onChange('transparent')}
            className={`px-1.5 py-0.5 text-[10px] rounded border ${
              isTransparent
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            None
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={safeHex}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer border border-slate-300 shrink-0"
        />
        <input
          type="text"
          value={isTransparent ? 'transparent' : safeHex}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v) || v === 'transparent') {
              onChange(v);
            }
          }}
          className="w-20 min-h-[28px] px-1.5 font-mono text-[11px] border border-slate-300 rounded bg-white"
          placeholder="#ffffff"
        />
        <div className="flex items-center gap-0.5 flex-1">
          {(['r', 'g', 'b'] as const).map((ch) => (
            <input
              key={ch}
              type="number"
              min={0}
              max={255}
              aria-label={`${label} ${ch.toUpperCase()}`}
              value={rgb[ch]}
              onChange={(e) => setRgbChannel(ch, Number(e.target.value))}
              className="w-full min-h-[28px] px-1 text-center font-mono tabular-nums text-[10px] border border-slate-300 rounded bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const GradientEditorBlock: React.FC<{
  label: string;
  gradient?: GraphicsGradientConfig;
  defaultFrom: string;
  defaultTo: string;
  defaultAngle?: number;
  onChange: (next: GraphicsGradientConfig) => void;
}> = ({ label, gradient, defaultFrom, defaultTo, defaultAngle = 135, onChange }) => {
  const enabled = Boolean(gradient?.enabled);
  const from = gradient?.from || defaultFrom;
  const to = gradient?.to || defaultTo;
  const angle = gradient?.angle ?? defaultAngle;
  const stops =
    Array.isArray(gradient?.stops) && gradient.stops.length >= 2
      ? gradient.stops
      : [
          { color: from, position: 0 },
          { color: to, position: 100 },
        ];

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            onChange({
              enabled: e.target.checked,
              from,
              to,
              angle,
              stops,
            })
          }
          className="rounded border-slate-300 text-[#EA580C]"
        />
        <span className="font-semibold text-slate-700">{label}</span>
      </label>

      {enabled && (
        <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <span>Angle (°)</span>
              <input
                type="number"
                min={0}
                max={360}
                value={angle}
                onChange={(e) =>
                  onChange({
                    enabled: true,
                    from,
                    to,
                    angle: Math.max(0, Math.min(360, Number(e.target.value) || 0)),
                    stops,
                  })
                }
                className="w-14 min-h-[26px] px-1.5 font-mono border border-slate-300 rounded bg-white"
              />
            </label>
            {stops.length < 5 && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    enabled: true,
                    from,
                    to,
                    angle,
                    stops: [...stops, { color: '#ea580c', position: 50 }],
                  })
                }
                className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-700"
              >
                <Plus className="w-3 h-3" />
                <span>Add Stop</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            {stops.map((st, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={hexFromColor(st.color, '#0f172a')}
                  onChange={(e) => {
                    const nextStops = stops.map((item, i) =>
                      i === idx ? { ...item, color: e.target.value } : item
                    );
                    onChange({
                      enabled: true,
                      from: nextStops[0]?.color || from,
                      to: nextStops[nextStops.length - 1]?.color || to,
                      angle,
                      stops: nextStops,
                    });
                  }}
                  className="w-6 h-6 rounded border border-slate-300"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={st.position}
                  onChange={(e) => {
                    const pos = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    const nextStops = stops.map((item, i) =>
                      i === idx ? { ...item, position: pos } : item
                    );
                    onChange({ enabled: true, from, to, angle, stops: nextStops });
                  }}
                  className="w-14 min-h-[26px] px-1.5 font-mono text-[11px] border border-slate-300 rounded bg-white"
                />
                <span className="text-[10px] text-slate-400">%</span>
                {stops.length > 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextStops = stops.filter((_, i) => i !== idx);
                      onChange({
                        enabled: true,
                        from: nextStops[0]?.color || from,
                        to: nextStops[nextStops.length - 1]?.color || to,
                        angle,
                        stops: nextStops,
                      });
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 ml-auto"
                    title="Remove stop"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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
          Click any graphic or drag a selection box on the canvas to edit coordinates, typography, image masks, icons, gradients, or timeline animations.
        </p>
      </div>
    );
  }

  const update = (patch: Partial<GraphicsElement>) => onUpdateElement(selected.id, patch, true);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-4 max-h-[760px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 truncate">{selected.layerName}</p>
          <p className="text-[10px] font-mono uppercase text-slate-500">
            {selected.type} · z:{selected.zIndex}
            {selectedIds.length > 1 ? ` · (${selectedIds.length} selected)` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => update({ locked: !selected.locked })}
            title={selected.locked ? 'Unlock element' : 'Lock element'}
            className={`p-1.5 rounded-lg border ${
              selected.locked
                ? 'border-amber-300 bg-amber-50 text-amber-700'
                : 'border-slate-200 text-slate-500 hover:text-slate-900'
            }`}
          >
            {selected.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200"
            title="Delete selected element"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
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
              Distribute H
            </button>
            <button
              type="button"
              onClick={() => alignSelected('distV')}
              className="py-1 rounded border border-slate-200 text-[10px] font-semibold hover:bg-slate-50"
            >
              Distribute V
            </button>
          </div>
        )}
      </div>

      {/* Exact Coordinates, Scale, Anchor & Spacing */}
      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Position, Size &amp; Transform
          </p>
          <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={Boolean(selected.lockAspectRatio)}
              onChange={(e) => update({ lockAspectRatio: e.target.checked })}
              className="rounded border-slate-300 text-[#EA580C]"
            />
            <span>Lock Ratio</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">X (px)</span>
            <input
              type="number"
              value={selected.x}
              onChange={(e) => update({ x: Math.round(Number(e.target.value) || 0) })}
              className="w-full min-h-[30px] px-2 font-mono tabular-nums border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Y (px)</span>
            <input
              type="number"
              value={selected.y}
              onChange={(e) => update({ y: Math.round(Number(e.target.value) || 0) })}
              className="w-full min-h-[30px] px-2 font-mono tabular-nums border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Width</span>
            <input
              type="number"
              min={8}
              max={3840}
              value={selected.width}
              onChange={(e) => {
                const nextW = Math.max(8, Math.round(Number(e.target.value) || 8));
                if (selected.lockAspectRatio && selected.width > 0) {
                  const ratio = selected.height / selected.width;
                  update({ width: nextW, height: Math.max(4, Math.round(nextW * ratio)) });
                } else {
                  update({ width: nextW });
                }
              }}
              className="w-full min-h-[30px] px-2 font-mono tabular-nums border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Height</span>
            <input
              type="number"
              min={2}
              max={3840}
              value={selected.height}
              onChange={(e) => {
                const nextH = Math.max(2, Math.round(Number(e.target.value) || 2));
                if (selected.lockAspectRatio && selected.height > 0) {
                  const ratio = selected.width / selected.height;
                  update({ height: nextH, width: Math.max(8, Math.round(nextH * ratio)) });
                } else {
                  update({ height: nextH });
                }
              }}
              className="w-full min-h-[30px] px-2 font-mono tabular-nums border border-slate-300 rounded"
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
              className="w-full min-h-[30px] px-2 font-mono tabular-nums border border-slate-300 rounded"
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
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Scale X / Y</span>
            <div className="flex gap-1">
              <input
                type="number"
                step={0.05}
                min={0.1}
                max={4}
                value={selected.scaleX ?? 1}
                onChange={(e) => update({ scaleX: Math.max(0.1, Number(e.target.value) || 1) })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono tabular-nums border border-slate-300 rounded"
              />
              <input
                type="number"
                step={0.05}
                min={0.1}
                max={4}
                value={selected.scaleY ?? 1}
                onChange={(e) => update({ scaleY: Math.max(0.1, Number(e.target.value) || 1) })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono tabular-nums border border-slate-300 rounded"
              />
            </div>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Transform Origin</span>
            <select
              value={selected.anchorPoint || 'center'}
              onChange={(e) => update({ anchorPoint: e.target.value as GraphicsAnchorPoint })}
              className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white text-[11px]"
            >
              <option value="center">Center</option>
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </label>
        </div>

        {/* Padding & Margin */}
        <div className="grid grid-cols-2 gap-1.5 text-xs pt-1">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Padding H / V</span>
            <div className="flex gap-1">
              <input
                type="number"
                min={0}
                max={200}
                value={selected.paddingX ?? 0}
                onChange={(e) => update({ paddingX: Math.max(0, Number(e.target.value) || 0) })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                placeholder="X"
              />
              <input
                type="number"
                min={0}
                max={200}
                value={selected.paddingY ?? 0}
                onChange={(e) => update({ paddingY: Math.max(0, Number(e.target.value) || 0) })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                placeholder="Y"
              />
            </div>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Margin T / B</span>
            <div className="flex gap-1">
              <input
                type="number"
                min={-100}
                max={200}
                value={selected.marginTop ?? 0}
                onChange={(e) => update({ marginTop: Number(e.target.value) || 0 })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                placeholder="T"
              />
              <input
                type="number"
                min={-100}
                max={200}
                value={selected.marginBottom ?? 0}
                onChange={(e) => update({ marginBottom: Number(e.target.value) || 0 })}
                className="w-1/2 min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
                placeholder="B"
              />
            </div>
          </label>
        </div>
      </div>

      {/* TEXT PROPERTIES */}
      {selected.type === 'text' && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Advanced Typography
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
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">SemiBold</option>
                <option value="700">Bold</option>
                <option value="800">ExtraBold</option>
                <option value="900">Black</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Case</span>
              <select
                value={selected.textTransform || 'none'}
                onChange={(e) =>
                  update({
                    textTransform: e.target.value as
                      | 'none'
                      | 'uppercase'
                      | 'lowercase'
                      | 'capitalize',
                  })
                }
                className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="none">Normal</option>
                <option value="uppercase">UPPER</option>
                <option value="lowercase">lower</option>
                <option value="capitalize">Title</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">H-Align</span>
              <select
                value={selected.textAlign || 'center'}
                onChange={(e) =>
                  update({ textAlign: e.target.value as 'left' | 'center' | 'right' })
                }
                className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">V-Align</span>
              <select
                value={selected.verticalAlign || 'middle'}
                onChange={(e) =>
                  update({ verticalAlign: e.target.value as 'top' | 'middle' | 'bottom' })
                }
                className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Dir</span>
              <select
                value={selected.textDirection || 'ltr'}
                onChange={(e) => update({ textDirection: e.target.value as 'ltr' | 'rtl' })}
                className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="ltr">LTR</option>
                <option value="rtl">RTL</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => update({ italic: !selected.italic })}
              className={`px-2.5 py-1 rounded border text-[11px] font-serif italic ${
                selected.italic ? 'bg-[#EA580C] text-white border-[#EA580C]' : 'border-slate-300'
              }`}
              title="Italic"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => update({ underline: !selected.underline })}
              className={`px-2.5 py-1 rounded border text-[11px] underline ${
                selected.underline
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'border-slate-300'
              }`}
              title="Underline"
            >
              U
            </button>
            <button
              type="button"
              onClick={() => update({ strikethrough: !selected.strikethrough })}
              className={`px-2.5 py-1 rounded border text-[11px] line-through ${
                selected.strikethrough
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'border-slate-300'
              }`}
              title="Strikethrough"
            >
              S
            </button>
            <label className="inline-flex items-center gap-1 text-[11px] ml-auto">
              <input
                type="checkbox"
                checked={selected.wordWrap !== false}
                onChange={(e) => update({ wordWrap: e.target.checked })}
                className="rounded border-slate-300 text-[#EA580C]"
              />
              <span>Wrap Text</span>
            </label>
          </div>

          <ColorHexRgbField
            label="Text Color"
            value={selected.fontColor || '#ffffff'}
            onChange={(nextHex) => update({ fontColor: nextHex })}
          />

          <GradientEditorBlock
            label="Gradient Text Fill"
            gradient={selected.gradientText}
            defaultFrom="#ffffff"
            defaultTo="#fb923c"
            defaultAngle={90}
            onChange={(nextGrad) => update({ gradientText: nextGrad })}
          />

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
              <span className="text-[10px] font-semibold text-slate-500">Outline W</span>
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

          {(selected.textOutlineWidth || 0) > 0 && (
            <ColorHexRgbField
              label="Outline Color"
              value={selected.textOutlineColor || '#000000'}
              onChange={(nextHex) => update({ textOutlineColor: nextHex })}
            />
          )}

          {/* Text Shadow */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">TxtSh X</span>
              <input
                type="number"
                value={selected.textShadowX ?? 0}
                onChange={(e) => update({ textShadowX: Number(e.target.value) || 0 })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">TxtSh Y</span>
              <input
                type="number"
                value={selected.textShadowY ?? 2}
                onChange={(e) => update({ textShadowY: Number(e.target.value) || 0 })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">TxtSh Blur</span>
              <input
                type="number"
                min={0}
                max={40}
                value={selected.textShadowBlur ?? 0}
                onChange={(e) => update({ textShadowBlur: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">Color</span>
              <input
                type="color"
                value={hexFromColor(selected.textShadowColor, '#000000')}
                onChange={(e) => update({ textShadowColor: e.target.value })}
                className="w-full h-[26px] rounded border border-slate-300"
              />
            </label>
          </div>
        </div>
      )}

      {/* IMAGE & SPONSOR LOGO PROPERTIES */}
      {(selected.type === 'image' || selected.type === 'logo') && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {selected.type === 'logo' ? 'Sponsor Logo' : 'Image, Mask & Crop'}
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

          <div className="grid grid-cols-2 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Fit Mode</span>
              <select
                value={selected.objectFit || 'contain'}
                onChange={(e) =>
                  update({ objectFit: e.target.value as 'contain' | 'cover' | 'fill' })
                }
                className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover Fill</option>
                <option value="fill">Stretch</option>
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Image Align</span>
              <select
                value={selected.imageAlign || 'center'}
                onChange={(e) =>
                  update({
                    imageAlign: e.target.value as 'center' | 'top' | 'bottom' | 'left' | 'right',
                  })
                }
                className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <label className="col-span-1 space-y-0.5">
              <span className="text-[10px] font-semibold text-slate-500">Mask Shape</span>
              <select
                value={selected.imageMask || 'none'}
                onChange={(e) => update({ imageMask: e.target.value as GraphicsImageMask })}
                className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white text-[11px]"
              >
                <option value="none">None</option>
                <option value="rounded">Rounded</option>
                <option value="circle">Circle</option>
                <option value="pill">Pill</option>
                <option value="diamond">Diamond</option>
                <option value="hexagon">Hexagon</option>
                <option value="diagonal">Diagonal</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => update({ flipX: !selected.flipX })}
              className={`mt-4 min-h-[30px] inline-flex items-center justify-center gap-1 rounded border text-[11px] font-semibold ${
                selected.flipX
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>Flip H</span>
            </button>
            <button
              type="button"
              onClick={() => update({ flipY: !selected.flipY })}
              className={`mt-4 min-h-[30px] inline-flex items-center justify-center gap-1 rounded border text-[11px] font-semibold ${
                selected.flipY
                  ? 'bg-[#EA580C] text-white border-[#EA580C]'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FlipVertical className="w-3.5 h-3.5" />
              <span>Flip V</span>
            </button>
          </div>

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

      {/* VECTOR ICON PROPERTIES */}
      {selected.type === 'icon' && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Broadcast Vector Icon
          </p>
          <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-1.5 rounded-lg border border-slate-200 bg-slate-50">
            {BROADCAST_ICON_OPTIONS.map((item) => {
              const IconComp = item.Icon;
              const active = (selected.iconName || 'trophy') === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => update({ iconName: item.id })}
                  title={item.label}
                  className={`p-1.5 rounded flex items-center justify-center border transition-colors ${
                    active
                      ? 'bg-[#EA580C] text-white border-[#EA580C]'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <IconComp className="w-4 h-4" />
                </button>
              );
            })}
          </div>
          <ColorHexRgbField
            label="Icon Color"
            value={selected.iconColor || '#ffffff'}
            onChange={(nextHex) => update({ iconColor: nextHex })}
          />
          <label className="block space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">
              Stroke Width ({selected.iconStrokeWidth ?? 2}px)
            </span>
            <input
              type="range"
              min={1}
              max={3.5}
              step={0.25}
              value={selected.iconStrokeWidth ?? 2}
              onChange={(e) => update({ iconStrokeWidth: Number(e.target.value) })}
              className="w-full accent-[#EA580C]"
            />
          </label>
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

          {(selected.qrLinkType === 'sponsor' ||
            selected.qrLinkType === 'custom' ||
            !selected.qrLinkType) && (
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
                borderRadius:
                  kind === 'circle' || kind === 'ellipse'
                    ? 9999
                    : kind === 'rectangle'
                      ? 0
                      : 16,
              });
            }}
            className="w-full min-h-[30px] px-2 border border-slate-300 rounded bg-white"
          >
            <option value="rectangle">Rectangle</option>
            <option value="rounded_rect">Rounded Rectangle</option>
            <option value="circle">Circle / Badge</option>
            <option value="ellipse">Ellipse / Oval</option>
            <option value="container">Glass Container</option>
            <option value="line">Accent Line</option>
            <option value="divider">Divider Bar</option>
          </select>
        </div>
      )}

      {/* CONTAINER STYLING (BG, Opacity, Gradient, Border, Shadow) */}
      <div className="space-y-2.5 border-t border-slate-200 pt-3 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Fill, Gradient, Border &amp; Shadow
        </p>

        <ColorHexRgbField
          label="Background Fill"
          value={selected.backgroundColor || 'transparent'}
          onChange={(nextHex) => update({ backgroundColor: nextHex })}
          allowTransparent
        />

        <label className="block space-y-0.5">
          <span className="text-[10px] font-semibold text-slate-500">
            Background Opacity ({Math.round((selected.backgroundOpacity ?? 1) * 100)}%)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={selected.backgroundOpacity ?? 1}
            onChange={(e) => update({ backgroundOpacity: Number(e.target.value) })}
            className="w-full accent-[#EA580C]"
          />
        </label>

        <GradientEditorBlock
          label="Gradient Background"
          gradient={selected.gradient}
          defaultFrom="#0f172a"
          defaultTo="#1e293b"
          defaultAngle={135}
          onChange={(nextGrad) => update({ gradient: nextGrad })}
        />

        <div className="grid grid-cols-3 gap-1.5">
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
            <span className="text-[10px] font-semibold text-slate-500">Style</span>
            <select
              value={selected.borderStyle || 'solid'}
              onChange={(e) => update({ borderStyle: e.target.value as GraphicsBorderStyle })}
              className="w-full min-h-[28px] px-1 border border-slate-300 rounded bg-white"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
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

        {(selected.borderWidth || 0) > 0 && (
          <ColorHexRgbField
            label="Border Color"
            value={selected.borderColor || '#ea580c'}
            onChange={(nextHex) => update({ borderColor: nextHex })}
          />
        )}

        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(selected.shadowEnabled)}
            onChange={(e) => update({ shadowEnabled: e.target.checked })}
            className="rounded border-slate-300 text-[#EA580C]"
          />
          <span>Drop Shadow</span>
        </label>

        {selected.shadowEnabled && (
          <div className="grid grid-cols-4 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">Off X</span>
              <input
                type="number"
                value={selected.shadowOffsetX ?? 0}
                onChange={(e) => update({ shadowOffsetX: Number(e.target.value) || 0 })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">Off Y</span>
              <input
                type="number"
                value={selected.shadowOffsetY ?? 6}
                onChange={(e) => update({ shadowOffsetY: Number(e.target.value) || 0 })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">Blur</span>
              <input
                type="number"
                min={0}
                max={80}
                value={selected.shadowBlur ?? 18}
                onChange={(e) => update({ shadowBlur: Math.max(0, Number(e.target.value) || 0) })}
                className="w-full min-h-[26px] px-1 font-mono border border-slate-300 rounded"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[9px] text-slate-500">Color</span>
              <input
                type="color"
                value={hexFromColor(selected.shadowColor, '#000000')}
                onChange={(e) => update({ shadowColor: e.target.value })}
                className="w-full h-[26px] rounded border border-slate-300"
              />
            </label>
          </div>
        )}
      </div>

      {/* ELEMENT ANIMATION & TIMELINE SETTINGS */}
      <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#EA580C]" />
          <span>Motion, Transitions &amp; Timing</span>
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Entry Transition</span>
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
              {GRAPHICS_ENTRY_ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Exit Transition</span>
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
              {GRAPHICS_EXIT_ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-0.5">
          <span className="text-[10px] font-semibold text-slate-500">
            Continuous Ambient Motion
          </span>
          <select
            value={selected.animation?.continuousStyle || 'none'}
            onChange={(e) => {
              const val = e.target.value as GraphicsAnimationStyle;
              update({
                animation: {
                  ...selected.animation,
                  continuousStyle: val,
                  loop: val !== 'none',
                },
              });
            }}
            className="w-full min-h-[30px] px-1.5 border border-slate-300 rounded bg-white"
          >
            {GRAPHICS_CONTINUOUS_ANIMATIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-3 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Entry (ms)</span>
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
            <span className="text-[10px] font-semibold text-slate-500">Exit (ms)</span>
            <input
              type="number"
              min={100}
              max={15000}
              step={50}
              value={selected.animation?.exitDurationMs ?? 340}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    exitDurationMs: Math.max(100, Number(e.target.value) || 340),
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
              max={15000}
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
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Easing Curve</span>
            <select
              value={selected.animation?.easing || 'cubic-bezier(0.16, 1, 0.3, 1)'}
              onChange={(e) =>
                update({ animation: { ...selected.animation, easing: e.target.value } })
              }
              className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white text-[11px]"
            >
              {GRAPHICS_EASING_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Intensity</span>
            <select
              value={selected.animation?.intensity || 'medium'}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    intensity: e.target.value as GraphicsAnimationIntensity,
                  },
                })
              }
              className="w-full min-h-[28px] px-1.5 border border-slate-300 rounded bg-white text-[11px]"
            >
              <option value="subtle">Subtle</option>
              <option value="medium">Medium</option>
              <option value="strong">Strong</option>
            </select>
          </label>
          <select
            value={selected.animation?.speed || 'normal'}
            onChange={(e) =>
              update({
                animation: {
                  ...selected.animation,
                  speed: e.target.value as GraphicsAnimationSpeed,
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
                  direction: e.target.value as GraphicsAnimationDirection,
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

        <div className="grid grid-cols-2 gap-1.5">
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">Start At (ms)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={selected.animation?.startTimeMs ?? 0}
              onChange={(e) =>
                update({
                  animation: {
                    ...selected.animation,
                    startTimeMs: Math.max(0, Number(e.target.value) || 0),
                  },
                })
              }
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] font-semibold text-slate-500">End At (ms)</span>
            <input
              type="number"
              min={0}
              step={100}
              value={selected.animation?.endTimeMs ?? ''}
              placeholder="Ad End"
              onChange={(e) => {
                const raw = e.target.value.trim();
                update({
                  animation: {
                    ...selected.animation,
                    endTimeMs: raw ? Math.max(0, Number(raw) || 0) : null,
                  },
                });
              }}
              className="w-full min-h-[28px] px-1.5 font-mono border border-slate-300 rounded"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
