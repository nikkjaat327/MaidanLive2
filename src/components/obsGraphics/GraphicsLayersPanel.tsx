import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Folder,
  Group,
  Image as ImageIcon,
  Layers,
  Lock,
  QrCode,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Ungroup,
  Unlock,
} from 'lucide-react';
import type {
  GraphicsAnimationStyle,
  GraphicsDesignGroupMeta,
  GraphicsElement,
} from '../../types/broadcastGraphics.ts';
import {
  GRAPHICS_ENTRY_ANIMATIONS,
  GRAPHICS_EXIT_ANIMATIONS,
} from '../../utils/broadcastGraphicsTemplates.ts';

interface GraphicsLayersPanelProps {
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onUpdateElements: (next: GraphicsElement[], label?: string) => void;
  onUpdateGroups?: (next: GraphicsDesignGroupMeta[]) => void;
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
    case 'icon':
      return Sparkles;
    default:
      return Shapes;
  }
}

export const GraphicsLayersPanel: React.FC<GraphicsLayersPanelProps> = ({
  elements,
  groups = [],
  selectedIds,
  onSelect,
  onUpdateElements,
  onUpdateGroups,
  onDuplicateIds,
  onDeleteIds,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [groupRenameDraft, setGroupRenameDraft] = useState('');

  // Highest zIndex shown at top of layers stack
  const layersDescending = useMemo(
    () => [...elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)),
    [elements]
  );

  const activeGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const el of elements) {
      if (el.groupId) ids.add(el.groupId);
    }
    return Array.from(ids);
  }, [elements]);

  const resolvedGroups = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.groupId, g]));
    return activeGroupIds.map((gid, index) => {
      const meta = byId.get(gid);
      return (
        meta || {
          groupId: gid,
          name: `Group ${index + 1}`,
          opacity: 1,
          locked: false,
          visible: true,
          animation: {},
        }
      );
    });
  }, [groups, activeGroupIds]);

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
    if (onUpdateGroups) {
      onUpdateGroups([
        ...resolvedGroups,
        {
          groupId: gid,
          name: `Group ${resolvedGroups.length + 1}`,
          opacity: 1,
          locked: false,
          visible: true,
          animation: {},
        },
      ]);
    }
  };

  const handleUngroupSelected = () => {
    const groupIdsToRemove = new Set(
      elements
        .filter((el) => selectedIds.includes(el.id) && el.groupId)
        .map((el) => el.groupId as string)
    );
    if (groupIdsToRemove.size === 0) return;
    onUpdateElements(
      elements.map((el) =>
        el.groupId && groupIdsToRemove.has(el.groupId) ? { ...el, groupId: undefined } : el
      ),
      'Ungroup layers'
    );
    if (onUpdateGroups) {
      onUpdateGroups(resolvedGroups.filter((g) => !groupIdsToRemove.has(g.groupId)));
    }
  };

  const updateGroupMeta = (groupId: string, patch: Partial<GraphicsDesignGroupMeta>) => {
    if (!onUpdateGroups) return;
    const next = resolvedGroups.map((g) =>
      g.groupId === groupId ? { ...g, ...patch } : g
    );
    onUpdateGroups(next);
  };

  return (
    <div className="space-y-3">
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
            title="Group selected layers (Shift-click or drag-box to select multiple)"
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

      {/* Groups Metadata Inspector */}
      {resolvedGroups.length > 0 && (
        <div className="space-y-1.5 border-b border-slate-200 pb-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Groups ({resolvedGroups.length})
          </p>
          {resolvedGroups.map((grp) => {
            const memberIds = elements
              .filter((e) => e.groupId === grp.groupId)
              .map((e) => e.id);
            const allSelected =
              memberIds.length > 0 && memberIds.every((id) => selectedIds.includes(id));

            return (
              <div
                key={grp.groupId}
                className={`p-2 rounded-lg border text-xs space-y-2 ${
                  allSelected
                    ? 'border-[#EA580C] bg-orange-50/60'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(memberIds)}
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                  >
                    <Folder className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    {renamingGroupId === grp.groupId ? (
                      <input
                        type="text"
                        autoFocus
                        value={groupRenameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setGroupRenameDraft(e.target.value)}
                        onBlur={() => {
                          updateGroupMeta(grp.groupId, {
                            name: groupRenameDraft.trim() || grp.name,
                          });
                          setRenamingGroupId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-[#EA580C] rounded bg-white"
                      />
                    ) : (
                      <span className="font-bold text-slate-900 truncate">
                        {grp.name} ({memberIds.length})
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingGroupId(grp.groupId);
                        setGroupRenameDraft(grp.name);
                      }}
                      title="Rename group"
                      className="p-1 text-slate-400 hover:text-slate-700"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateGroupMeta(grp.groupId, {
                          visible: grp.visible === false,
                        })
                      }
                      title={grp.visible === false ? 'Show group' : 'Hide group'}
                      className={`p-1 ${
                        grp.visible === false ? 'text-red-500' : 'text-slate-600'
                      }`}
                    >
                      {grp.visible === false ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateGroupMeta(grp.groupId, { locked: !grp.locked })
                      }
                      title={grp.locked ? 'Unlock group' : 'Lock group'}
                      className={`p-1 ${
                        grp.locked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      {grp.locked ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <Unlock className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {onUpdateGroups && (
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <label className="col-span-2 flex items-center gap-2">
                      <span className="text-slate-500 font-semibold w-16 shrink-0">
                        Opacity {Math.round((grp.opacity ?? 1) * 100)}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={grp.opacity ?? 1}
                        onChange={(e) =>
                          updateGroupMeta(grp.groupId, { opacity: Number(e.target.value) })
                        }
                        className="flex-1 accent-[#EA580C]"
                      />
                    </label>
                    <select
                      aria-label={`${grp.name} Entry Animation`}
                      value={grp.animation?.style || 'none'}
                      onChange={(e) =>
                        updateGroupMeta(grp.groupId, {
                          animation: {
                            ...(grp.animation || {}),
                            style: e.target.value as GraphicsAnimationStyle,
                          },
                        })
                      }
                      className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[10px]"
                    >
                      <option value="none">Grp Entry: Element</option>
                      {GRAPHICS_ENTRY_ANIMATIONS.filter((a) => a.id !== 'none').map((a) => (
                        <option key={a.id} value={a.id}>
                          Entry: {a.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${grp.name} Exit Animation`}
                      value={grp.animation?.exitStyle || 'none'}
                      onChange={(e) =>
                        updateGroupMeta(grp.groupId, {
                          animation: {
                            ...(grp.animation || {}),
                            exitStyle: e.target.value as GraphicsAnimationStyle,
                          },
                        })
                      }
                      className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[10px]"
                    >
                      <option value="none">Grp Exit: Element</option>
                      {GRAPHICS_EXIT_ANIMATIONS.filter((a) => a.id !== 'none').map((a) => (
                        <option key={a.id} value={a.id}>
                          Exit: {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {layersDescending.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-300 rounded-lg">
          No layers yet. Add Text, Image, Logo, QR Code, Icon, or Shape above.
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
                          if (e.key === 'Enter') e.currentTarget.blur();
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
                      <span className="text-[10px] font-mono text-sky-700 shrink-0">
                        · Grp
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
