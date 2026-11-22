import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, Mic, RefreshCw, Sliders, Tv, Video } from 'lucide-react';
import type { BroadcastCameraData, ObsDiscoveredInput } from '../../types/obs.ts';
import { Modal } from '../common/Modal.tsx';

interface CameraSourceMappingModalProps {
  open: boolean;
  onClose: () => void;
  obsConnected: boolean;
  obsInputs: ObsDiscoveredInput[];
  obsScenes: string[];
  existingCameras: BroadcastCameraData[];
  scoreboardSourceName: string;
  onRefreshObsInputs: () => Promise<ObsDiscoveredInput[]>;
  onSaveMappings: (
    mappings: Array<{
      cameraId?: string;
      obsInputName: string;
      displayName: string;
      obsSceneName?: string;
      inputKind?: string;
      isCamera: boolean;
    }>
  ) => Promise<void>;
}

interface DraftRow {
  obsInputName: string;
  inputKind: string;
  category: 'video' | 'audio' | 'overlay';
  isCamera: boolean;
  displayName: string;
  obsSceneName: string;
  existingCameraId?: string;
}

function classifyObsInput(
  inputName: string,
  inputKind: string,
  scoreboardSourceName: string
): 'video' | 'audio' | 'overlay' {
  const nameLower = inputName.toLowerCase();
  const kindLower = inputKind.toLowerCase();

  if (
    kindLower.includes('wasapi') ||
    kindLower.includes('pulse') ||
    kindLower.includes('coreaudio') ||
    kindLower.includes('alsa') ||
    kindLower.includes('jack') ||
    nameLower.includes('mic/aux') ||
    nameLower.includes('desktop audio')
  ) {
    return 'audio';
  }
  if (
    (scoreboardSourceName && nameLower === scoreboardSourceName.toLowerCase()) ||
    nameLower.includes('scoreboard') ||
    nameLower.includes('sponsor') ||
    nameLower.includes('overlay') ||
    kindLower.includes('text_') ||
    kindLower.includes('color_source')
  ) {
    return 'overlay';
  }
  return 'video';
}

export function CameraSourceMappingModal({
  open,
  onClose,
  obsConnected,
  obsInputs,
  obsScenes,
  existingCameras,
  scoreboardSourceName,
  onRefreshObsInputs,
  onSaveMappings,
}: CameraSourceMappingModalProps) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualSourceName, setManualSourceName] = useState('');
  const [manualDisplayName, setManualDisplayName] = useState('');

  const buildRows = useMemo(
    () => (inputs: ObsDiscoveredInput[]) => {
      const camByInput = new Map(
        existingCameras
          .filter((c) => c.obsInputName)
          .map((c) => [c.obsInputName.trim(), c])
      );
      let camCounter = existingCameras.length;

      return inputs.map((inp) => {
        const matched = camByInput.get(inp.inputName);
        const category = classifyObsInput(inp.inputName, inp.inputKind, scoreboardSourceName);
        const guessedDefaultName = matched
          ? matched.label || matched.name
          : category === 'video'
            ? (() => {
                camCounter += 1;
                return `CAM ${camCounter}`;
              })()
            : inp.inputName;

        return {
          obsInputName: inp.inputName,
          inputKind: inp.inputKind || inp.unversionedInputKind || 'obs_input',
          category,
          isCamera: matched ? matched.enabled : category === 'video',
          displayName: guessedDefaultName,
          obsSceneName: matched?.obsSceneName || obsScenes[0] || '',
          existingCameraId: matched?.cameraId,
        } satisfies DraftRow;
      });
    },
    [existingCameras, obsScenes, scoreboardSourceName]
  );

  useEffect(() => {
    if (!open) return;
    setRows(buildRows(obsInputs));
  }, [open, obsInputs, buildRows]);

  async function handleRefresh() {
    try {
      setRefreshing(true);
      const latest = await onRefreshObsInputs();
      setRows(buildRows(latest));
    } finally {
      setRefreshing(false);
    }
  }

  function handleAddManualRow() {
    const cleanSource = manualSourceName.trim();
    if (!cleanSource) return;
    if (rows.some((r) => r.obsInputName === cleanSource)) return;
    setRows((prev) => [
      {
        obsInputName: cleanSource,
        inputKind: 'manual_obs_input',
        category: 'video',
        isCamera: true,
        displayName: manualDisplayName.trim() || cleanSource,
        obsSceneName: obsScenes[0] || '',
      },
      ...prev,
    ]);
    setManualSourceName('');
    setManualDisplayName('');
  }

  async function handleSave() {
    const selectedOrExisting = rows.filter((r) => r.isCamera || r.existingCameraId);
    if (selectedOrExisting.length === 0) return;
    try {
      setSaving(true);
      await onSaveMappings(
        selectedOrExisting.map((r) => ({
          cameraId: r.existingCameraId,
          obsInputName: r.obsInputName,
          displayName: r.displayName.trim() || r.obsInputName,
          obsSceneName: r.obsSceneName.trim() || undefined,
          inputKind: r.inputKind,
          isCamera: r.isCamera,
        }))
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = rows.filter((r) => r.isCamera).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="OBS Camera Source Mapping (Dynamic Discovery)"
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
          <div className="space-y-0.5">
            <p className="font-semibold text-slate-900">
              Select which OBS inputs are live Production Cameras (audio &amp; overlays stay excluded)
            </p>
            <p className="text-[11px] text-slate-600">
              Give each OBS source a friendly broadcast name like <code className="font-mono">CAM 1</code>,{' '}
              <code className="font-mono">WIDE</code>, or <code className="font-mono">CLOSE-UP</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={!obsConnected || refreshing}
            onClick={handleRefresh}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Scanning OBS...' : 'Refresh OBS Sources'}</span>
          </button>
        </div>

        {/* Manual OBS Input Fallback Entry */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div className="sm:col-span-5">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Add Custom OBS Source Name
            </label>
            <input
              type="text"
              value={manualSourceName}
              onChange={(e) => setManualSourceName(e.target.value)}
              placeholder="e.g., HDMI Capture 1 or CamLink 4K"
              className="w-full min-h-[36px] px-3 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Display Camera Name
            </label>
            <input
              type="text"
              value={manualDisplayName}
              onChange={(e) => setManualDisplayName(e.target.value)}
              placeholder="e.g., CAM 1 - WIDE"
              className="w-full min-h-[36px] px-3 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="button"
              disabled={!manualSourceName.trim()}
              onClick={handleAddManualRow}
              className="w-full min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
            >
              + Add Source Row
            </button>
          </div>
        </div>

        {/* Discovered OBS Sources Table */}
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center space-y-2">
            <Camera className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">
              {obsConnected
                ? 'No OBS sources cached yet — click "Refresh OBS Sources" above to scan OBS Studio.'
                : 'OBS Studio is offline. Connect OBS Studio first or add a custom OBS source name above.'}
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-200">
            {rows.map((row, idx) => (
              <div
                key={row.obsInputName}
                className={`p-3 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center ${
                  row.isCamera ? 'bg-orange-50/40' : 'bg-white'
                }`}
              >
                <div className="md:col-span-4 flex items-start gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={row.isCamera}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, isCamera: checked } : item))
                      );
                    }}
                    aria-label={`Mark ${row.obsInputName} as camera source`}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#EA580C] shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-bold text-slate-900 truncate">
                      {row.obsInputName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          row.category === 'video'
                            ? 'bg-emerald-50 text-emerald-700'
                            : row.category === 'audio'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {row.category === 'video' ? (
                          <Video className="w-2.5 h-2.5" />
                        ) : row.category === 'audio' ? (
                          <Mic className="w-2.5 h-2.5" />
                        ) : (
                          <Tv className="w-2.5 h-2.5" />
                        )}
                        {row.category === 'video'
                          ? 'Video Source'
                          : row.category === 'audio'
                            ? 'Audio Only'
                            : 'Overlay'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 truncate">
                        {row.inputKind}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-4">
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-0.5">
                    Display Name in Studio
                  </label>
                  <input
                    type="text"
                    value={row.displayName}
                    disabled={!row.isCamera && !row.existingCameraId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRows((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, displayName: val } : item))
                      );
                    }}
                    placeholder="CAM 1 / WIDE"
                    className="w-full min-h-[34px] px-2.5 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-0.5">
                    Default OBS Scene
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      list="obs-scenes-datalist"
                      value={row.obsSceneName}
                      disabled={!row.isCamera && !row.existingCameraId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRows((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, obsSceneName: val } : item))
                        );
                      }}
                      placeholder="Auto / Scene name"
                      className="w-full min-h-[34px] px-2.5 text-xs font-mono border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <datalist id="obs-scenes-datalist">
          {obsScenes.map((sc) => (
            <option key={sc} value={sc} />
          ))}
        </datalist>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <span className="text-xs text-slate-600 font-mono tabular-nums">
            {selectedCount} source(s) marked as Production Cameras
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || rows.filter((r) => r.isCamera || r.existingCameraId).length === 0}
              onClick={handleSave}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving Mappings...' : 'Save Camera Source Mappings'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
