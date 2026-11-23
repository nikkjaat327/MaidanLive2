import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Group,
  Image as ImageIcon,
  Layers,
  Lock,
  QrCode,
  Shapes,
  Trash2,
  Type,
  Ungroup,
  Unlock,
} from 'lucide-react';
import type { GraphicsElement } from '../../types/broadcastGraphics.ts';

interface GraphicsLayersPanelProps {
  elements: GraphicsElement[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateElements: (next: GraphicsElement[], label?: string) => void;
  onDuplicateIds: (ids: string[]) => void;
  onDeleteIds: (ids: string[]) => void;
}

function elementIcon(type: GraphicsElement['type']) {
  switch (type) {
    case 'text':
      return Type;
    case 'image':
    case 'logo':
      return ImageIcon;
    case 'qr':
      return QrCode;
    default:
      return Shapes;
  }
}

export const GraphicsLayersPanel: React.FC<GraphicsLayersPanelProps> = ({
  elements,
  selectedIds,
  onSelect,
  onUpdateElements,
  onDuplicateIds,
  onDeleteIds,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Highest zIndex shown at top of layers stack
  const layersDescending = useMemo(
    () => [...elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)),
    [elements]
  );

  const selectedHasGroup = useMemo(
    () =>
      selectedIds.some((id) => {
        const el = elements.find((item) => item.id === id);
        return Boolean(el?.groupId);
      }),
    [elements, selectedIds]
  );

  const moveLayerZ = (id: string, direction: 'up' | 'down') => {
    const orderedAsc = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const idx = orderedAsc.findIndex((e) => e.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx + 1 : idx - 1;
    if (swapIdx < 0 || swapIdx >= orderedAsc.length) return;
    const [moved] = orderedAsc.splice(idx, 1);
    orderedAsc.splice(swapIdx, 0, moved);
    const reindexed = orderedAsc.map((el, i) => ({ ...el, zIndex: i + 1 }));
    onUpdateElements(reindexed, 'Reorder layer');
  };

  const handleGroupSelected = () => {
    if (selectedIds.length < 2) return;
    const gid = `grp_${Date.now().toString(36)}`;
    onUpdateElements(
      elements.map((el) => (selectedIds.includes(el.id) ? { ...el, groupId: gid } : el)),
      'Group layers'
    );
  };

  const handleUngroupSelected = () => {
    const groupIds = new Set(
      elements
        .filter((el) => selectedIds.includes(el.id) && el.groupId)
        .map((el) => el.groupId as string)
    );
    if (groupIds.size === 0) return;
    onUpdateElements(
      elements.map((el) =>
        el.groupId && groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el
      ),
      'Ungroup layers'
    );
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
          <span>Layers ({elements.length})</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={selectedIds.length < 2}
            onClick={handleGroupSelected}
            title="Group selected layers"
            className="px-2 py-1 rounded border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1"
          >
            <Group className="w-3 h-3" />
            <span>Group</span>
          </button>
          <button
            type="button"
            disabled={!selectedHasGroup}
            onClick={handleUngroupSelected}
            title="Ungroup selected layers"
            className="px-2 py-1 rounded border border-slate-200 bg-white text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1"
          >
            <Ungroup className="w-3 h-3" />
            <span>Ungroup</span>
          </button>
        </div>
      </div>

      {layersDescending.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 rounded-lg">
          No layers yet. Add Text, Image, Logo, QR Code, or Shape above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5">
          {layersDescending.map((el, idx) => {
            const Icon = elementIcon(el.type);
            const selected = selectedIds.includes(el.id);

            return (
              <div
                key={el.id}
                onClick={(e) => {
                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    onSelect(
                      selected
                        ? selectedIds.filter((id) => id !== el.id)
                        : [...selectedIds, el.id]
                    );
                  } else {
                    onSelect([el.id]);
                  }
                }}
                className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  selected
                    ? 'border-[#EA580C] bg-orange-50/70'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Icon className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    {renamingId === el.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          onUpdateElements(
                            elements.map((item) =>
                              item.id === el.id
                                ? { ...item, layerName: renameDraft.trim() || item.layerName }
                                : item
                            ),
                            'Rename layer'
                          );
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-[#EA580C] rounded bg-white"
                      />
                    ) : (
                      <span
                        className="font-semibold text-slate-900 truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(el.id);
                          setRenameDraft(el.layerName);
                        }}
                      >
                        {el.layerName}
                      </span>
                    )}
                    {el.groupId && (
                      <span className="px-1 py-0.5 rounded bg-sky-100 text-sky-800 text-[9px] font-bold uppercase shrink-0">
                        GRP
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(el.id);
                        setRenameDraft(el.layerName);
                      }}
                      title="Rename layer"
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayerZ(el.id, 'up');
                      }}
                      title="Bring Forward"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === layersDescending.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveLayerZ(el.id, 'down');
                      }}
                      title="Send Backward"
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateElements(
                          elements.map((item) =>
                            item.id === el.id ? { ...item, visible: !item.visible } : item
                          ),
                          'Toggle visibility'
                        );
                      }}
                      title={el.visible ? 'Hide layer' : 'Show layer'}
                      className={`p-1 ${
                        el.visible ? 'text-slate-600 hover:text-slate-900' : 'text-red-500'
                      }`}
                    >
                      {el.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateElements(
                          elements.map((item) =>
                            item.id === el.id ? { ...item, locked: !item.locked } : item
                          ),
                          'Toggle lock'
                        );
                      }}
                      title={el.locked ? 'Unlock layer' : 'Lock layer'}
                      className={`p-1 ${
                        el.locked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {el.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateIds([el.id]);
                      }}
                      title="Duplicate layer"
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteIds([el.id]);
                      }}
                      title="Delete layer"
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
